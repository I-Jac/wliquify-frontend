'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { PublicKey, SystemProgram, Connection } from '@solana/web3.js';
import { BN, Program, AnchorProvider } from '@coral-xyz/anchor';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { calculateWLqiValue } from '@/utils/calculations';
import {
    DynamicTokenData,
    HistoricalTokenDataDecoded,
    ParsedOracleTokenInfo,
    ProcessedTokenData,
} from '@/utils/types';
import { decodeTokenAccountAmountBN } from '@/utils/accounts';
import { PoolConfig, SupportedToken } from '@/utils/types';
import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool';
import { useOracleData } from './useOracleData';
import { createRateLimitedFetch } from '@/utils/hookUtils';
import { processSingleToken } from '@/utils/singleTokenProcessing';
import { processOracleData } from '@/utils/oracleUtils';
import { cleanupSubscriptions, setupSubscription, setupUserTokenSubscription } from '@/utils/subscriptionUtils';
import { fetchCorePoolConfigAndWLQI, RateLimitedFetchFn } from '@/utils/poolDataUtils';
import { fetchSupportedTokensPublicData, fetchUserTokenAccountBalances } from '@/utils/poolDataUtils';

interface UsePoolDataProps {
    program: Program<WLiquifyPool> | null;
    provider: AnchorProvider | null;
    readOnlyProvider: AnchorProvider | null;
    connection: Connection;
    wallet: WalletContextState; // Use the broader WalletContextState type
}

export function usePoolData({
    program,
    provider,
    readOnlyProvider,
    connection,
    wallet,
}: UsePoolDataProps) {
    // --- State managed by the hook ---
    const [poolConfig, setPoolConfig] = useState<PoolConfig | null>(null);
    const [poolConfigPda, setPoolConfigPda] = useState<PublicKey | null>(null);
    const [dynamicData, setDynamicData] = useState<Map<string, DynamicTokenData>>(new Map());
    const [historicalData, setHistoricalData] = useState<Map<string, HistoricalTokenDataDecoded | null>>(new Map());
    const [wLqiSupply, setWlqiSupply] = useState<string | null>(null);
    const [wLqiDecimals, setWlqiDecimals] = useState<number | null>(null);
    const [processedTokenData, setProcessedTokenData] = useState<ProcessedTokenData[] | null>(null);
    const [totalPoolValueScaled, setTotalPoolValueScaled] = useState<BN | null>(null);
    const [wLqiValueScaled, setWlqiValueScaled] = useState<BN | null>(null);
    const [userWlqiBalance, setUserWlqiBalance] = useState<BN | null>(null);
    const [userTokenBalances, setUserTokenBalances] = useState<Map<string, BN | null>>(new Map());
    const [isLoadingPublicData, setIsLoadingPublicData] = useState(true);
    const [isLoadingUserData, setIsLoadingUserData] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasFetchedPublicData = useRef(false);
    const hasFetchedUserData = useRef(false);
    const [wLqiMint, setWLqiMint] = useState<PublicKey | null>(null);

    // Create rate limited fetch function
    const rateLimitedFetch = useMemo(() => createRateLimitedFetch(connection), [connection]);

    // Use the new useOracleData hook
    const { oracleData, refreshOracleData } = useOracleData({
        connection,
        oracleAggregatorAddress: poolConfig?.oracleAggregatorAccount ?? null
    });

    // --- Helper function for processing token data ---
    // Removed unused processTokenData function since we're using processSingleToken from utils

    // --- Fetch Public Pool Data (Moved from Component) ---
    const fetchPublicPoolData = useCallback(async () => {
        const activeProvider = provider || readOnlyProvider;
        // Use program from state/props, activeProvider.connection for the connection
        const currentProgram = program;
        const currentConnection = activeProvider?.connection ?? connection; // Fallback to hook prop connection

        if (!currentProgram || !currentConnection) {
            console.warn("usePoolData Hook: Fetch public data skipped: Program or Connection not ready.");
            setIsLoadingPublicData(false); // Ensure loading state is reset
            return;
        }

        // console.log("usePoolData Hook: Fetching public pool data...");
        setIsLoadingPublicData(true);
        setError(null);
        // Reset relevant states before fetch
        setPoolConfig(null); // Reset before calling the new util
        setPoolConfigPda(null);
        setWlqiSupply(null);
        setWlqiDecimals(null);
        setWLqiMint(null);
        setDynamicData(new Map());
        setHistoricalData(new Map());
        setWlqiValueScaled(null);
        hasFetchedPublicData.current = false;

        try {
            // Call the new utility function for core config and wLQI data
            const coreDataResult = await fetchCorePoolConfigAndWLQI(
                currentProgram,
                currentConnection,
                rateLimitedFetch as RateLimitedFetchFn // Cast because rateLimitedFetch is created by useMemo without explicit type arg in usePoolData
            );

            if (coreDataResult.error || !coreDataResult.poolConfig || !coreDataResult.poolConfigPda || coreDataResult.wlqiSupply === null || coreDataResult.wlqiDecimals === null || !coreDataResult.wLqiMint) {
                setError(coreDataResult.error || "Failed to load essential pool configuration or wLQI data.");
                // Set states to null or defaults if core data fetching failed partially or fully
                setPoolConfig(coreDataResult.poolConfig || null);
                setPoolConfigPda(coreDataResult.poolConfigPda || null);
                setWlqiSupply(coreDataResult.wlqiSupply || null);
                setWlqiDecimals(coreDataResult.wlqiDecimals || null);
                setWLqiMint(coreDataResult.wLqiMint || null);
                setIsLoadingPublicData(false);
                return;
            }

            const fetchedConfig = coreDataResult.poolConfig;
            setPoolConfig(fetchedConfig);
            setPoolConfigPda(coreDataResult.poolConfigPda);
            setTotalPoolValueScaled(fetchedConfig.currentTotalPoolValueScaled); // This comes from fetchedConfig
            setWlqiSupply(coreDataResult.wlqiSupply);
            setWlqiDecimals(coreDataResult.wlqiDecimals);
            setWLqiMint(coreDataResult.wLqiMint);

            // --- Fetching Vaults, Price Feeds, History for Supported Tokens --- 
            // Call the new utility function for supported tokens public data
            const supportedTokensDataResult = await fetchSupportedTokensPublicData(
                currentConnection,
                currentProgram.programId,
                fetchedConfig.supportedTokens,
                rateLimitedFetch as RateLimitedFetchFn
            );

            if (supportedTokensDataResult.error) {
                // Append to existing error or set new error
                setError(prevError => 
                    prevError 
                        ? `${prevError}; ${supportedTokensDataResult.error}` 
                        : (supportedTokensDataResult.error ?? null) // Ensure null if undefined
                );
                // Note: We might still have partial data in supportedTokensDataResult.dynamicData and .historicalData
                // Decide if we should stop or proceed with potentially partial data.
                // For now, we will set what we have and the error will indicate issues.
            }

            // Set dynamic and historical data from the result
            // Ensure the structure matches what setDynamicData and setHistoricalData expect.
            // The utility returns Pick<DynamicTokenData, ...>, so we might need to cast or ensure compatibility.
            setDynamicData(supportedTokensDataResult.dynamicData as Map<string, DynamicTokenData>); 
            setHistoricalData(supportedTokensDataResult.historicalData);
            
            // The original `processingError` logic is now handled within `fetchSupportedTokensPublicData`
            // and its error is returned/appended.

            hasFetchedPublicData.current = true;

        } catch (err) { // This catch is for errors in fetchCorePoolConfigAndWLQI or other unexpected errors
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("usePoolData Hook: Error fetching public pool data:", errorMessage);
            setError(`Failed to load public pool data: ${errorMessage}`);
            // Reset all relevant states on a major catch-all error
            setPoolConfig(null);
            setPoolConfigPda(null);
            setWlqiSupply(null);
            setWlqiDecimals(null);
            setWLqiMint(null);
            setDynamicData(new Map());
            setHistoricalData(new Map());
            setTotalPoolValueScaled(null);
        } finally {
            setIsLoadingPublicData(false);
        }
    }, [program, provider, readOnlyProvider, connection, rateLimitedFetch]); // Dependencies for public data fetch

    // --- Fetch User Account Data (Moved from Component) ---
    const fetchUserAccountData = useCallback(async () => {
        // Guard clauses
        if (!wallet.connected || !wallet.publicKey || !connection) {
            setUserWlqiBalance(null);
            setUserTokenBalances(new Map());
            hasFetchedUserData.current = false;
            return;
        }
        if (!poolConfig || !poolConfig.wliMint) {
            // console.log("usePoolData Hook: Skipping user data fetch: Pool config or wLQI mint not loaded yet.");
            return;
        }

        // console.log("usePoolData Hook: Fetching user account data...");
        setIsLoadingUserData(true);
        // Don't reset main error state here, let prior errors persist or be overwritten by this specific fetch if it fails badly

        try {
            const userBalancesResult = await fetchUserTokenAccountBalances(
                connection,
                wallet.publicKey, // Already checked for null above
                poolConfig.wliMint, // Already checked for null above
                poolConfig.supportedTokens,
                rateLimitedFetch as RateLimitedFetchFn
            );

            if (userBalancesResult.error) {
                setError(prevError => 
                    prevError 
                        ? `${prevError}; UserData: ${userBalancesResult.error}` 
                        : `UserData: ${userBalancesResult.error ?? 'Unknown user data fetch error'}`
                );
                // Set balances to what was returned, even if partial or null, error will indicate issues
            }

            setUserWlqiBalance(userBalancesResult.userWlqiBalance ?? new BN(0));
            setUserTokenBalances(userBalancesResult.userTokenBalances ?? new Map());
            
            hasFetchedUserData.current = true;

        } catch (err) { // Catch unexpected errors from the utility or other issues
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("usePoolData Hook: Critical error in fetchUserAccountData:", errorMessage);
            setError(`Critical error fetching user account data: ${errorMessage}`);
            setUserWlqiBalance(null);
            setUserTokenBalances(new Map());
        } finally {
            setIsLoadingUserData(false);
        }
    }, [wallet.connected, wallet.publicKey, connection, poolConfig, rateLimitedFetch]);

    // --- NEW: Targeted function to fetch only oracle data ---
    const fetchAndSetOracleData = useCallback(async () => {
        if (!connection || !poolConfig?.oracleAggregatorAccount) {
            return;
        }

        const { error } = await processOracleData(connection, poolConfig.oracleAggregatorAccount);
        
        if (error) {
            setError(prevError => prevError ? `${prevError}, ${error}` : error);
            return;
        }

        refreshOracleData();
    }, [connection, poolConfig, refreshOracleData]);

    // --- Refresh Functions --- (Moved Up)
    const refreshPublicData = useCallback(() => {
        // console.log("usePoolData Hook: Refreshing public data...");
        hasFetchedPublicData.current = false; // Reset flag
        fetchPublicPoolData();
    }, [fetchPublicPoolData]);

    const refreshUserData = useCallback(async () => {
        // This still fetches ALL user data, could be optimized further if needed,
        // but is kept separate for manual refresh capability.
        // console.log(`usePoolData Hook: Refreshing user data triggered by: ${logSource}`);
        fetchUserAccountData();
    }, [fetchUserAccountData]);

    const refreshAllData = useCallback(() => {
        // console.log("usePoolData Hook: Refreshing all data...");
        hasFetchedPublicData.current = false;
        hasFetchedUserData.current = false;
        fetchPublicPoolData().then(() => {
            // Fetch user data after public data has finished (or potentially in parallel if safe)
            fetchUserAccountData();
        });
    }, [fetchPublicPoolData, fetchUserAccountData]);

    // --- Effect to Calculate Derived Values ---
    useEffect(() => {
        if (!poolConfig || !dynamicData || dynamicData.size === 0 || !historicalData || historicalData.size === 0 || !oracleData || wLqiDecimals === null || !wLqiSupply) {
            setWlqiValueScaled(null);
            return;
        }

        if (!hasFetchedUserData.current && wallet.connected) {
            return;
        }

        try {
            const oracleTokenMap = new Map<string, ParsedOracleTokenInfo>(oracleData.data.map(info => [info.address, info]));
            const currentTvlFromState = totalPoolValueScaled;
            
            if (currentTvlFromState === null) {
                throw new Error("TVL from state is null, cannot calculate derived values.");
            }

            const calculatedWlqiValue = calculateWLqiValue(currentTvlFromState, wLqiSupply, wLqiDecimals);
            setWlqiValueScaled(calculatedWlqiValue);

            const newProcessedData = Array.from(dynamicData.entries())
                .map(([mintAddress, data]) => {
                    const tokenConfig = poolConfig.supportedTokens.find((st: SupportedToken) => st.mint?.toBase58() === mintAddress);
                    const oracleInfo = oracleTokenMap.get(mintAddress);
                    const history = historicalData.get(mintAddress);
                    const userBalance = userTokenBalances.get(mintAddress) ?? null;

                    if (!tokenConfig || history === undefined) {
                        return null;
                    }

                    return processSingleToken({
                        mintAddress,
                        data,
                        tokenConfig,
                        oracleInfo,
                        history,
                        currentTvlFromState,
                        userBalance
                    });
                })
                .filter((data): data is ProcessedTokenData => data !== null);

            setProcessedTokenData(prevProcessedTokenData => {
                if (isLoadingPublicData || isLoadingUserData) {
                    return prevProcessedTokenData;
                }

                if (!prevProcessedTokenData || prevProcessedTokenData.length !== newProcessedData.length) {
                    return newProcessedData;
                }

                const hasChanges = newProcessedData.some((newToken, i) => {
                    const prevToken = prevProcessedTokenData[i];
                    return (
                        prevToken.mintAddress !== newToken.mintAddress ||
                        !prevToken.vaultBalance?.eq(newToken.vaultBalance) ||
                        prevToken.actualDominancePercent !== newToken.actualDominancePercent ||
                        !prevToken.targetDominance?.eq(newToken.targetDominance) ||
                        prevToken.isDelisted !== newToken.isDelisted ||
                        prevToken.depositFeeOrBonusBps !== newToken.depositFeeOrBonusBps ||
                        prevToken.withdrawFeeOrBonusBps !== newToken.withdrawFeeOrBonusBps ||
                        !prevToken.userBalance?.eq(newToken.userBalance ?? new BN(0))
                    );
                });

                return hasChanges ? newProcessedData : prevProcessedTokenData;
            });

        } catch (e) {
            console.error("usePoolData Hook: Error calculating derived values:", e);
            setError("Failed to process pool data.");
            setProcessedTokenData(null);
            setWlqiValueScaled(null);
        }
    }, [poolConfig, dynamicData, historicalData, oracleData, wLqiSupply, wLqiDecimals, userTokenBalances, wallet.connected, totalPoolValueScaled, isLoadingPublicData, isLoadingUserData]);

    // --- Effect for Initial Public Data Fetch ---
    useEffect(() => {
        if (program && (provider || readOnlyProvider) && connection && !hasFetchedPublicData.current) {
            fetchPublicPoolData();
        }
    }, [program, provider, readOnlyProvider, connection, fetchPublicPoolData]);

    // --- Effect for User Data Fetch on Wallet Connection/Change or Public Data Load ---
    useEffect(() => {
        // Fetch user data only if wallet is connected AND public data is ready
        if (wallet.connected && wallet.publicKey && poolConfig && !hasFetchedUserData.current) {
            fetchUserAccountData();
        } else if (!wallet.connected) {
            // Reset user data if wallet disconnects
            if (hasFetchedUserData.current) {
                setUserWlqiBalance(null);
                setUserTokenBalances(new Map());
                hasFetchedUserData.current = false;
            }
        }
    }, [wallet.connected, wallet.publicKey, poolConfig, fetchUserAccountData]);

    // --- Effect for Subscribing to User Token Account Changes ---
    const userAccountSubscriptionIdsRef = useRef<number[]>([]);
    const isSubscribingRef = useRef(false);

    useEffect(() => {
        if (!connection || !wallet.publicKey || !poolConfig || !wLqiMint || !poolConfig.supportedTokens || isSubscribingRef.current) {
            return;
        }

        isSubscribingRef.current = true;

        const publicKey = wallet.publicKey;
        const tokenMints = poolConfig.supportedTokens.map(t => t.mint);
        const allMints = [wLqiMint, ...tokenMints];

        // Cleanup existing subscriptions
        if (userAccountSubscriptionIdsRef.current.length > 0) {
            cleanupSubscriptions(connection, userAccountSubscriptionIdsRef.current);
            userAccountSubscriptionIdsRef.current = [];
        }

        const newSubIds: number[] = [];

        allMints.forEach(mint => {
            if (!mint) return;
            try {
                const userAta = getAssociatedTokenAddressSync(mint, publicKey, true);
                const subId = setupUserTokenSubscription(
                    connection,
                    userAta,
                    (accountInfo) => { 
                        const newBalance = decodeTokenAccountAmountBN(accountInfo.data);

                        if (mint.equals(wLqiMint)) {
                            setUserWlqiBalance(newBalance);
                        } else {
                            const mintAddressStr = mint.toBase58();
                            setUserTokenBalances(prevBalances => {
                                const newBalances = new Map(prevBalances);
                                newBalances.set(mintAddressStr, newBalance);
                                return newBalances;
                            });
                        }
                    }
                );
                if (subId !== null) {
                    newSubIds.push(subId);
                }
            } catch (err) {
                console.error(`Error getting ATA or subscribing for mint ${mint.toBase58()}:`, err);
            }
        });

        userAccountSubscriptionIdsRef.current = newSubIds;
        isSubscribingRef.current = false;

        return () => {
            cleanupSubscriptions(connection, userAccountSubscriptionIdsRef.current);
            userAccountSubscriptionIdsRef.current = [];
            isSubscribingRef.current = false;
        };

    }, [connection, wallet.publicKey, poolConfig, wLqiMint]);

    // --- Effect to Subscribe to PoolConfig Changes --- 
    const poolConfigSubscriptionRef = useRef<number | null>(null);
    const isPoolConfigSubscribingRef = useRef(false);

    useEffect(() => {
        if (!connection || !poolConfigPda || isPoolConfigSubscribingRef.current) { 
            return;
        }

        isPoolConfigSubscribingRef.current = true;

        // Cleanup existing subscription
        if (poolConfigSubscriptionRef.current !== null) {
            cleanupSubscriptions(connection, [poolConfigSubscriptionRef.current]);
            poolConfigSubscriptionRef.current = null;
        }

        const subscriptionId = setupSubscription(
            connection,
            poolConfigPda,
            () => { 
                refreshPublicData();
            },
            "PoolConfig"
        );

        if (subscriptionId !== null) {
            poolConfigSubscriptionRef.current = subscriptionId;
        }

        isPoolConfigSubscribingRef.current = false;

        return () => {
            if (poolConfigSubscriptionRef.current !== null) {
                cleanupSubscriptions(connection, [poolConfigSubscriptionRef.current]);
                poolConfigSubscriptionRef.current = null;
            }
            isPoolConfigSubscribingRef.current = false;
        };
    }, [connection, poolConfigPda, refreshPublicData]);

    // --- Effect to Subscribe to Oracle Aggregator Account Changes ---
    const oracleSubscriptionRef = useRef<number | null>(null);
    const isOracleSubscribingRef = useRef(false);

    useEffect(() => {
        if (!connection || !poolConfig?.oracleAggregatorAccount || 
            poolConfig.oracleAggregatorAccount.equals(SystemProgram.programId) || 
            isOracleSubscribingRef.current) {
            return;
        }

        isOracleSubscribingRef.current = true;

        // Cleanup existing subscription
        if (oracleSubscriptionRef.current !== null) {
            cleanupSubscriptions(connection, [oracleSubscriptionRef.current]);
            oracleSubscriptionRef.current = null;
        }

        const subscriptionId = setupSubscription(
            connection,
            poolConfig.oracleAggregatorAccount,
            () => {
                fetchAndSetOracleData();
            },
            "Oracle Aggregator"
        );

        if (subscriptionId !== null) {
            oracleSubscriptionRef.current = subscriptionId;
        }

        isOracleSubscribingRef.current = false;

        return () => {
            if (oracleSubscriptionRef.current !== null) {
                cleanupSubscriptions(connection, [oracleSubscriptionRef.current]);
                oracleSubscriptionRef.current = null;
            }
            isOracleSubscribingRef.current = false;
        };
    }, [connection, poolConfig, fetchAndSetOracleData]);

    // --- Effect to fetch W-LQI Mint address from Pool Config ---
    useEffect(() => {
        if (poolConfig) {
            setWLqiMint(poolConfig.wliMint);
        }
    }, [poolConfig]);

    // --- Return Hook State and Functions ---
    return {
        poolConfig,
        poolConfigPda,
        oracleData,
        dynamicData,
        historicalData,
        wLqiSupply,
        wLqiDecimals,
        processedTokenData,
        totalPoolValueScaled,
        wLqiValueScaled,
        userWlqiBalance,
        userTokenBalances,
        isLoadingPublicData,
        isLoadingUserData,
        error,
        refreshPublicData,
        refreshUserData,
        refreshAllData,
    };
} 