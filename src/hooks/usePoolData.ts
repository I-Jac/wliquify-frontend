'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { PublicKey, SystemProgram, Connection } from '@solana/web3.js';
import { BN, Program, AnchorProvider } from '@coral-xyz/anchor';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { getAssociatedTokenAddressSync, getMint } from '@solana/spl-token';
import { calculateWLqiValue } from '@/utils/calculations';
import {
    DynamicTokenData,
    HistoricalTokenDataDecoded,
    TokenProcessingInfo,
    ParsedOracleTokenInfo,
    ProcessedTokenData,
} from '@/utils/types';
import { findPoolConfigPDA, findHistoricalTokenDataPDA } from '@/utils/pda';
import { decodeHistoricalTokenData, decodeTokenAccountAmountBN } from '@/utils/accounts';
import { PoolConfig, SupportedToken } from '@/utils/types';
import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool';
import { useOracleData } from './useOracleData';
import { createRateLimitedFetch } from '@/utils/hookUtils';
import { processSingleToken } from '@/utils/singleTokenProcessing';
import { processOracleData } from '@/utils/oracleUtils';
import { cleanupSubscriptions, setupSubscription, setupUserTokenSubscription } from '@/utils/subscriptionUtils';

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
        if (!program || !activeProvider || !connection) {
            console.warn("usePoolData Hook: Fetch public data skipped: Program or Provider/Connection not ready.");
            return;
        }
        // console.log("usePoolData Hook: Fetching public pool data...");
        setIsLoadingPublicData(true);
        setError(null);
        // Reset relevant states before fetch
        setPoolConfig(null);
        setDynamicData(new Map());
        setHistoricalData(new Map());
        setWlqiValueScaled(null);
        hasFetchedPublicData.current = false;

        try {
            const programId = program.programId;
            const configPda = findPoolConfigPDA(programId);
            setPoolConfigPda(configPda);

            const fetchedConfig = await rateLimitedFetch(
                () => program.account.poolConfig.fetch(configPda) as Promise<PoolConfig>,
                "Failed to fetch pool config"
            );
            
            setPoolConfig(fetchedConfig);
            setTotalPoolValueScaled(fetchedConfig.currentTotalPoolValueScaled);

            // --- wLQI Mint Info ---
            const [wlqiSupplyData, wlqiMintData] = await Promise.all([
                rateLimitedFetch(
                    () => connection.getTokenSupply(fetchedConfig.wliMint),
                    "Failed to fetch wLQI supply"
                ),
                rateLimitedFetch(
                    () => getMint(connection, fetchedConfig.wliMint),
                    "Failed to fetch wLQI mint data"
                )
            ]);

            const fetchedWlqiSupply = wlqiSupplyData.value.amount;
            const fetchedWlqiDecimals = wlqiMintData.decimals;

            setWlqiSupply(fetchedWlqiSupply);
            setWlqiDecimals(fetchedWlqiDecimals);

            // --- Fetching Vaults, Price Feeds, History for Supported Tokens ---
            const publicAddressesToFetch: PublicKey[] = [];
            const tokenInfoMap = new Map<string, Partial<TokenProcessingInfo>>();

            // Get all decimals first - fetch in parallel with retries
            const allConfiguredMints = fetchedConfig.supportedTokens
                .map((st: SupportedToken) => st.mint)
                .filter((mint): mint is PublicKey => mint !== null);

            // Fetch all mint info in parallel with retries
            const mintInfoPromises = allConfiguredMints.map((mint: PublicKey) => 
                rateLimitedFetch(
                    () => getMint(connection, mint),
                    `Failed to get mint info for ${mint.toBase58()}`
                ).catch(err => {
                    console.warn(`usePoolData Hook: Failed to get mint info for ${mint.toBase58()}: ${err.message}`);
                    return null;
                })
            );
            const mintInfos = await Promise.all(mintInfoPromises);
            const decimalsMap = new Map<string, number>();
            mintInfos.forEach((mintInfo: import('@solana/spl-token').Mint | null, index: number) => {
                if (mintInfo) {
                    decimalsMap.set(allConfiguredMints[index].toBase58(), mintInfo.decimals);
                }
            });

            // Prepare addresses to fetch
            fetchedConfig.supportedTokens.forEach((supportedToken: SupportedToken) => {
                const mint = supportedToken.mint;
                if (!mint) {
                    console.warn("usePoolData Hook: Skipping token in config with null mint address.");
                    return;
                }
                const mintAddress = mint.toBase58();
                const priceFeedAddress = supportedToken.priceFeed;
                const vault = supportedToken.vault;
                const decimals = decimalsMap.get(mintAddress);

                if (!vault) {
                    console.error(`usePoolData Hook: Vault address missing in config for mint ${mintAddress}. Skipping public fetch.`);
                    return;
                }
                if (typeof decimals !== 'number') {
                    console.warn(`usePoolData Hook: Decimals not found via getMint for ${mintAddress}, skipping public fetch.`);
                    return;
                }

                // Add vault to fetch list
                publicAddressesToFetch.push(vault);
                const vaultIndex = publicAddressesToFetch.length - 1;

                // Add price feed if it exists in config
                let priceFeedIndex: number | undefined = undefined;
                if (priceFeedAddress && !priceFeedAddress.equals(SystemProgram.programId)) {
                    publicAddressesToFetch.push(priceFeedAddress);
                    priceFeedIndex = publicAddressesToFetch.length - 1;
                } else {
                    console.warn(`usePoolData Hook: Price feed missing or system program ID for mint ${mintAddress}.`);
                }

                // Add HistoricalTokenData PDA to fetch list
                const historyPda = findHistoricalTokenDataPDA(mint, program.programId);
                publicAddressesToFetch.push(historyPda);
                const historyPdaIndex = publicAddressesToFetch.length - 1;

                tokenInfoMap.set(mintAddress, {
                    mint: mint,
                    vault: vault,
                    priceFeed: priceFeedAddress ?? SystemProgram.programId,
                    vaultIndex: vaultIndex,
                    priceFeedIndex: priceFeedIndex,
                    historyPdaIndex: historyPdaIndex,
                    mintDecimals: decimals,
                });
            });

            // --- Batch fetch all public accounts --- 
            const ACCOUNTS_BATCH_SIZE = 99; // Max accounts per getMultipleAccountsInfo call, under the typical limit of 100
            let allFetchedAccountsInfo: (import('@solana/web3.js').AccountInfo<Buffer> | null)[] = [];
            const batchPromises = [];

            for (let i = 0; i < publicAddressesToFetch.length; i += ACCOUNTS_BATCH_SIZE) {
                const batch = publicAddressesToFetch.slice(i, i + ACCOUNTS_BATCH_SIZE);
                if (batch.length > 0) {
                    batchPromises.push(
                        rateLimitedFetch(
                            () => connection.getMultipleAccountsInfo(batch),
                            `Failed to fetch batch of public accounts (offset ${i})`
                        )
                    );
                }
            }

            try {
                const resultsFromBatches = await Promise.all(batchPromises);
                resultsFromBatches.forEach(batchResult => {
                    if (batchResult) { // batchResult itself could be null if rateLimitedFetch can return null for a whole batch
                        allFetchedAccountsInfo = allFetchedAccountsInfo.concat(batchResult);
                    }
                });
            } catch (batchError) {
                console.error("usePoolData Hook: Error fetching one or more account batches:", batchError);
                const errorMessage = batchError instanceof Error ? batchError.message : String(batchError);
                setError(`Failed to fetch all public account details due to batching error: ${errorMessage}`);
                setIsLoadingPublicData(false);
                // Potentially set other states to null/empty if data is unusable
                setPoolConfig(null);
                setWlqiSupply(null);
                setDynamicData(new Map());
                setHistoricalData(new Map());
                setPoolConfigPda(null);
                return; // Exit if critical batch fetching fails
            }
            // END Batch fetch --- 

            // Process fetched accounts (now using allFetchedAccountsInfo)
            const initialDynamicData = new Map<string, DynamicTokenData>();
            const initialHistoricalData = new Map<string, HistoricalTokenDataDecoded | null>();
            let processingError = false;

            fetchedConfig.supportedTokens.forEach((supportedToken: SupportedToken) => {
                const mint = supportedToken.mint;
                if (!mint) return;
                const mintAddress = mint.toBase58();
                const info = tokenInfoMap.get(mintAddress);

                if (!info || info.vaultIndex === undefined || info.mintDecimals === undefined || info.historyPdaIndex === undefined) {
                    console.warn(`usePoolData Hook: Skipping processing dynamic/historical data for ${mintAddress}, info/indices/decimals/history incomplete in map.`);
                    processingError = true;
                    return;
                }

                const vaultInfo = allFetchedAccountsInfo[info.vaultIndex];
                const priceFeedInfo = info.priceFeedIndex !== undefined ? allFetchedAccountsInfo[info.priceFeedIndex] : null;
                const historyInfo = allFetchedAccountsInfo[info.historyPdaIndex];

                // Store Dynamic Data
                initialDynamicData.set(mintAddress, {
                    vaultBalance: vaultInfo ? decodeTokenAccountAmountBN(vaultInfo.data) : null,
                    priceFeedInfo: priceFeedInfo,
                    decimals: info.mintDecimals,
                    userBalance: null // User balance fetched separately
                });

                // Decode and store Historical Data
                const decodedHistory = decodeHistoricalTokenData(historyInfo);
                if (decodedHistory) {
                    initialHistoricalData.set(mintAddress, decodedHistory);
                } else {
                    console.warn(`usePoolData Hook: Failed to decode HistoricalTokenData for ${mintAddress}`);
                    initialHistoricalData.set(mintAddress, null);
                }
            });

            setDynamicData(initialDynamicData);
            setHistoricalData(initialHistoricalData);

            if (processingError) {
                setError("Errors occurred processing some public token data.");
            }

            hasFetchedPublicData.current = true;

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("usePoolData Hook: Error fetching public pool data:", errorMessage);
            setError(`Failed to load public pool data: ${errorMessage}`);
            setPoolConfig(null);
            setWlqiSupply(null);
            setDynamicData(new Map());
            setHistoricalData(new Map());
            setPoolConfigPda(null);
        } finally {
            setIsLoadingPublicData(false);
        }
    }, [program, provider, readOnlyProvider, connection, rateLimitedFetch]); // Dependencies for public data fetch

    // --- Fetch User Account Data (Moved from Component) ---
    const fetchUserAccountData = useCallback(async () => {
        // Guard clauses
        if (!wallet.connected || !wallet.publicKey || !connection) {
            // console.log("usePoolData Hook: Skipping user data fetch: Wallet not connected or connection missing.");
            // Reset user-specific state if wallet disconnects
            setUserWlqiBalance(null);
            setUserTokenBalances(new Map());
            hasFetchedUserData.current = false;
            return;
        }
        // Ensure public data (specifically poolConfig) is loaded before fetching user data
        if (!poolConfig || !poolConfig.wliMint) {
            // console.log("usePoolData Hook: Skipping user data fetch: Pool config or wLQI mint not loaded yet.");
            // Don't reset state here, just wait for public data
            return;
        }

        // console.log("usePoolData Hook: Fetching user account data...");
        setIsLoadingUserData(true); // Set user data loading state
        // Don't reset error here, let public data errors persist if they occurred
        const userPublicKey = wallet.publicKey;
        const userAddressesToFetch: PublicKey[] = [];
        const tokenMintMapForUserFetch = new Map<string, PublicKey>(); // map index to mint

        try {
            // Add user wLQI ATA
            const userWlqiAta = getAssociatedTokenAddressSync(poolConfig.wliMint, userPublicKey, true);
            userAddressesToFetch.push(userWlqiAta);

            // Add user ATAs for supported tokens
            poolConfig.supportedTokens.forEach(token => {
                try {
                    const mint = token.mint;
                    if (mint && !mint.equals(poolConfig.wliMint)) { // Exclude wLQI itself
                        const userAta = getAssociatedTokenAddressSync(mint, userPublicKey, true);
                        userAddressesToFetch.push(userAta);
                        tokenMintMapForUserFetch.set((userAddressesToFetch.length - 1).toString(), mint);
                    }
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    console.error(`usePoolData Hook: Error deriving user ATA for mint ${token.mint?.toBase58() ?? 'unknown'}:`, errorMessage);
                }
            });

            // --- Batch fetch all user accounts ---
            const ACCOUNTS_BATCH_SIZE = 99;
            let allUserAccountsInfo: (import('@solana/web3.js').AccountInfo<Buffer> | null)[] = [];
            const userAccountBatchPromises = [];

            if (userAddressesToFetch.length > 0) { // Only proceed if there are addresses to fetch
                for (let i = 0; i < userAddressesToFetch.length; i += ACCOUNTS_BATCH_SIZE) {
                    const batch = userAddressesToFetch.slice(i, i + ACCOUNTS_BATCH_SIZE);
                    if (batch.length > 0) {
                        userAccountBatchPromises.push(
                            rateLimitedFetch(
                                () => connection.getMultipleAccountsInfo(batch),
                                `Failed to fetch batch of user accounts (offset ${i})`
                            )
                        );
                    }
                }

                try {
                    const resultsFromUserBatches = await Promise.all(userAccountBatchPromises);
                    resultsFromUserBatches.forEach(batchResult => {
                        if (batchResult) {
                            allUserAccountsInfo = allUserAccountsInfo.concat(batchResult);
                        }
                    });
                } catch (batchError) {
                    console.error("usePoolData Hook: Error fetching one or more user account batches:", batchError);
                    const errorMessage = batchError instanceof Error ? batchError.message : String(batchError);
                    setError(`Failed to load user account data due to batching error: ${errorMessage}`);
                    setUserWlqiBalance(null);
                    setUserTokenBalances(new Map());
                    setIsLoadingUserData(false);
                    return; // Exit if critical batch fetching fails
                }
            } else {
                allUserAccountsInfo = [];
            }
            // END Batch fetch ---

            const userWlqiInfo = allUserAccountsInfo[0];
            const newWlqiBalance = userWlqiInfo ? decodeTokenAccountAmountBN(userWlqiInfo.data) : new BN(0);
            setUserWlqiBalance(newWlqiBalance);

            const newUserTokenBalancesMap = new Map<string, BN | null>();
            const otherTokenAccountsInfo = allUserAccountsInfo.length > 1 ? allUserAccountsInfo.slice(1) : [];
            otherTokenAccountsInfo.forEach((accInfo, index) => {
                const mapKey = (index + 1).toString(); 
                const mint = tokenMintMapForUserFetch.get(mapKey);
                if (mint) {
                    const mintAddressStr = mint.toBase58();
                    const newUserBalance = accInfo ? decodeTokenAccountAmountBN(accInfo.data) : new BN(0);
                    newUserTokenBalancesMap.set(mintAddressStr, newUserBalance);
                } else {
                    console.warn(`usePoolData Hook: [fetchUserAccountData] Could not find mint in map for key ${mapKey}.`);
                }
            });
            setUserTokenBalances(newUserTokenBalancesMap);
            hasFetchedUserData.current = true;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("usePoolData Hook: Error fetching user account data:", errorMessage);
            setError(`Failed to load user account data: ${errorMessage}`);
            setUserWlqiBalance(null);
            setUserTokenBalances(new Map());
        } finally {
            setIsLoadingUserData(false);
        }
    }, [wallet.connected, wallet.publicKey, connection, poolConfig, rateLimitedFetch]); // Explicitly including rateLimitedFetch

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