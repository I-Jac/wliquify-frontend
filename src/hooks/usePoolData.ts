'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { PublicKey, Connection } from '@solana/web3.js';
import { BN, Program, AnchorProvider } from '@coral-xyz/anchor';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { calculateWLqiValue } from '@/utils/app/calculations';
import {
    DynamicTokenData,
    HistoricalTokenDataDecoded,
    ParsedOracleTokenInfo,
    ProcessedTokenData,
    PoolConfig,
    SupportedToken
} from '@/utils/core/types';
import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool';
import { useOracleData } from './useOracleData';
import { createRateLimitedFetch } from '@/utils/network/rateLimitUtils';
import { processSingleToken } from '@/utils/app/singleTokenProcessing';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { useUserData } from '@/hooks/useUserData';
import { fetchCorePoolConfigAndWLQI, RateLimitedFetchFn, fetchSingleSupportedTokenPublicData } from '@/utils/app/poolDataUtils';
import { fetchSupportedTokensPublicData } from '@/utils/app/poolDataUtils';

interface UsePoolDataProps {
    program: Program<WLiquifyPool> | null;
    provider: AnchorProvider | null;
    readOnlyProvider: AnchorProvider | null;
    connection: Connection;
    wallet: WalletContextState;
    enabled?: boolean;
}

export function usePoolData({
    program,
    provider,
    readOnlyProvider,
    connection,
    wallet,
    enabled = true,
}: UsePoolDataProps) {
    // --- State managed by the hook for PUBLIC data ---
    const [poolConfig, setPoolConfig] = useState<PoolConfig | null>(null);
    const [poolConfigPda, setPoolConfigPda] = useState<PublicKey | null>(null);
    const [dynamicData, setDynamicData] = useState<Map<string, DynamicTokenData>>(new Map());
    const [historicalData, setHistoricalData] = useState<Map<string, HistoricalTokenDataDecoded | null>>(new Map());
    const [wLqiSupply, setWlqiSupply] = useState<string | null>(null);
    const [wLqiDecimals, setWlqiDecimals] = useState<number | null>(null);
    const [processedTokenData, setProcessedTokenData] = useState<ProcessedTokenData[] | null>(null);
    const [totalPoolValueScaled, setTotalPoolValueScaled] = useState<BN | null>(null);
    const [isLoadingPublicData, setIsLoadingPublicData] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const hasFetchedPublicData = useRef(false);
    const isLoadingFullDataRef = useRef(false);
    const prevWlqiSupplyRef = useRef<string | null>(null);
    const prevTotalPoolValueScaledRef = useRef<BN | null>(null);
    const prevIsLoadingPublicRef = useRef(isLoadingPublicData);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const rateLimitedFetch = useMemo(() => createRateLimitedFetch(), [connection]);

    const { oracleData, refreshOracleData } = useOracleData({
        connection,
        oracleAggregatorAddress: poolConfig?.oracleAggregatorAccount ?? null
    });

    // --- Instantiate useUserData hook ---
    const { 
        userWlqiBalance, 
        setUserWlqiBalance,
        userTokenBalances, 
        setUserTokenBalances,
        isLoadingUserData, 
        userDataError, 
        refreshUserData: refreshUserDataFromHook 
    } = useUserData({
        connection,
        userPublicKey: wallet.publicKey,
        poolConfigForUserBalances: poolConfig ? { wliMint: poolConfig.wliMint, supportedTokens: poolConfig.supportedTokens } : null,
        rateLimitedFetch: rateLimitedFetch as RateLimitedFetchFn,
        enabled: enabled,
    });

    // +++ START NEW FUNCTION +++
    const refreshSpecificTokenData = useCallback(async (updatedMintAddress: PublicKey) => {
        const functionStartTime = new Date().toLocaleTimeString();
        console.log(`[${functionStartTime}] refreshSpecificTokenData: START for token ${updatedMintAddress.toBase58()}`);

        const activeProvider = provider || readOnlyProvider;
        const currentProgram = program;
        const currentConnection = activeProvider?.connection ?? connection;

        if (!currentProgram || !currentConnection) {
            console.warn("refreshSpecificTokenData: Program or connection not available.");
            return;
        }
        
        console.log(`refreshSpecificTokenData: Refreshing data for token ${updatedMintAddress.toBase58()}`);

        try {
            // Step 1: Re-fetch core pool config to get latest global values
            console.log(`[${new Date().toLocaleTimeString()}] refreshSpecificTokenData: Fetching core config for ${updatedMintAddress.toBase58()}`);
            const coreDataResult = await fetchCorePoolConfigAndWLQI(
                currentProgram,
                currentConnection,
                rateLimitedFetch as RateLimitedFetchFn
            );
            console.log(`[${new Date().toLocaleTimeString()}] refreshSpecificTokenData: Core config fetched for ${updatedMintAddress.toBase58()}`);

            if (coreDataResult.error || !coreDataResult.poolConfig || !coreDataResult.poolConfigPda || coreDataResult.wlqiSupply === null || coreDataResult.wlqiDecimals === null || !coreDataResult.wLqiMint) {
                const errorMsg = coreDataResult.error || "Failed to load essential pool configuration or wLQI data during specific token refresh.";
                console.error("refreshSpecificTokenData:", errorMsg);
                return;
            }
            
            const newPoolConfig = coreDataResult.poolConfig;
            setPoolConfig(newPoolConfig);
            setPoolConfigPda(coreDataResult.poolConfigPda);
            setTotalPoolValueScaled(newPoolConfig.currentTotalPoolValueScaled);
            setWlqiSupply(coreDataResult.wlqiSupply);
            setWlqiDecimals(coreDataResult.wlqiDecimals);

            // Update refs so background refreshes can detect if specific refresh handled it
            prevWlqiSupplyRef.current = coreDataResult.wlqiSupply;
            prevTotalPoolValueScaledRef.current = newPoolConfig.currentTotalPoolValueScaled;

            const tokenToUpdate = newPoolConfig.supportedTokens.find(
                (st: SupportedToken) => st.mint?.toBase58() === updatedMintAddress.toBase58()
            );

            if (!tokenToUpdate) {
                console.warn(`refreshSpecificTokenData: Token ${updatedMintAddress.toBase58()} not found in the latest pool config.`);
                return;
            }

            console.log(`[${new Date().toLocaleTimeString()}] refreshSpecificTokenData: Fetching single token data for ${updatedMintAddress.toBase58()}`);
            const singleTokenResult = await fetchSingleSupportedTokenPublicData(
                currentConnection,
                currentProgram.programId,
                tokenToUpdate,
                rateLimitedFetch as RateLimitedFetchFn
            );
            console.log(`[${new Date().toLocaleTimeString()}] refreshSpecificTokenData: Single token data fetched for ${updatedMintAddress.toBase58()}`);

            if (singleTokenResult.error || !singleTokenResult.dynamicData) {
                console.error(`refreshSpecificTokenData: Error fetching data for token ${updatedMintAddress.toBase58()}: ${singleTokenResult.error}`);
                return;
            }

            const mintStr = updatedMintAddress.toBase58();
            setDynamicData(prevMap => {
                const nextMap = new Map(prevMap);
                if (singleTokenResult.dynamicData) {
                    nextMap.set(mintStr, singleTokenResult.dynamicData as DynamicTokenData);
                }
                return nextMap;
            });
            setHistoricalData(prevMap => {
                const nextMap = new Map(prevMap);
                nextMap.set(mintStr, singleTokenResult.historicalData);
                return nextMap;
            });
            
            console.log(`[${new Date().toLocaleTimeString()}] refreshSpecificTokenData: Successfully updated data for token ${mintStr}`);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(`refreshSpecificTokenData: General error for token ${updatedMintAddress.toBase58()}: ${errorMessage}`);
        }
    }, [
        program, provider, readOnlyProvider, connection, rateLimitedFetch, 
        setPoolConfig, setPoolConfigPda, setTotalPoolValueScaled, setWlqiSupply, setWlqiDecimals,
        setDynamicData, setHistoricalData
    ]);
    // +++ END NEW FUNCTION +++

    // --- Fetch Public Pool Data ---
    const fetchPublicPoolData = useCallback(async (options?: { isBackgroundRefresh?: boolean }) => {
        const isBackground = options?.isBackgroundRefresh ?? false;

        if (!isBackground) {
            if (isLoadingFullDataRef.current) {
                return;
            }
            isLoadingFullDataRef.current = true;
            prevWlqiSupplyRef.current = null;
            prevTotalPoolValueScaledRef.current = null;
        }

        const activeProvider = provider || readOnlyProvider;
        const currentProgram = program;
        const currentConnection = activeProvider?.connection ?? connection;

        if (!currentProgram || !currentConnection) {
            if (!isBackground) setIsLoadingPublicData(false);
            if (!isBackground && isLoadingFullDataRef.current) isLoadingFullDataRef.current = false; 
            return;
        }

        if (!isBackground) {
            setIsLoadingPublicData(true);
            setError(null);
            setPoolConfig(null);
            setPoolConfigPda(null);
            setWlqiSupply(null);
            setWlqiDecimals(null);
            setDynamicData(new Map());
            setHistoricalData(new Map());
            setTotalPoolValueScaled(null);
        }

        let coreDataFetchedSuccessfully = false;
        let newWlqiSupply: string | null = null;
        let newTotalPoolValueScaled: BN | null = null;

        try {
            const coreDataResult = await fetchCorePoolConfigAndWLQI(
                currentProgram,
                currentConnection,
                rateLimitedFetch as RateLimitedFetchFn 
            );

            if (coreDataResult.error || !coreDataResult.poolConfig || !coreDataResult.poolConfigPda || coreDataResult.wlqiSupply === null || coreDataResult.wlqiDecimals === null || !coreDataResult.wLqiMint) {
                const errorMsg = coreDataResult.error || "Failed to load essential pool configuration or wLQI data.";
                if (!isBackground) {
                    setError(errorMsg);
                    setPoolConfig(coreDataResult.poolConfig || null);
                    setPoolConfigPda(coreDataResult.poolConfigPda || null);
                }
                if (!isBackground) setIsLoadingPublicData(false);
                return;
            }
            
            coreDataFetchedSuccessfully = true;
            const fetchedConfig = coreDataResult.poolConfig;
            newWlqiSupply = coreDataResult.wlqiSupply;
            newTotalPoolValueScaled = fetchedConfig.currentTotalPoolValueScaled;

            setPoolConfig(fetchedConfig);
            setPoolConfigPda(coreDataResult.poolConfigPda);
            setTotalPoolValueScaled(newTotalPoolValueScaled);
            setWlqiSupply(newWlqiSupply);
            setWlqiDecimals(coreDataResult.wlqiDecimals);

            const isMaintainerUpdateScenario = 
                isBackground && 
                prevWlqiSupplyRef.current !== null && 
                newWlqiSupply === prevWlqiSupplyRef.current && 
                newTotalPoolValueScaled && 
                prevTotalPoolValueScaledRef.current && 
                !newTotalPoolValueScaled.eq(prevTotalPoolValueScaledRef.current);

            const noChangeSinceLastUpdate = // New flag
                isBackground &&
                prevWlqiSupplyRef.current !== null &&
                prevTotalPoolValueScaledRef.current !== null &&
                newWlqiSupply === prevWlqiSupplyRef.current &&
                newTotalPoolValueScaled && newTotalPoolValueScaled.eq(prevTotalPoolValueScaledRef.current);

            if (isMaintainerUpdateScenario) {
                console.log("usePoolData: Maintainer update detected (total value changed, wLQI supply same). Skipping token vault data refresh.");
            } else if (noChangeSinceLastUpdate) {
                console.log("usePoolData: Background refresh detected no change from refs. Skipping token vault data refresh.");
            } else {
                const supportedTokensDataResult = await fetchSupportedTokensPublicData(
                    currentConnection,
                    currentProgram.programId,
                    fetchedConfig.supportedTokens,
                    rateLimitedFetch as RateLimitedFetchFn
                );

                if (supportedTokensDataResult.error) {
                    const tokenDataErrorMsg = supportedTokensDataResult.error ?? "Error fetching token dynamic/historical data.";
                    if (!isBackground) {
                         setError(prevError => prevError ? `${prevError}; ${tokenDataErrorMsg}` : tokenDataErrorMsg);
                    }
                    // No setIsLoadingPublicData(false) here, as core data might be fine
                }
                
                setDynamicData(supportedTokensDataResult.dynamicData as Map<string, DynamicTokenData> || new Map()); 
                setHistoricalData(supportedTokensDataResult.historicalData || new Map());
            }

            if (!isBackground) {
                hasFetchedPublicData.current = true;
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            if (!isBackground) {
                setError(`Failed to load public pool data: ${errorMessage}`);
                setPoolConfig(null); setPoolConfigPda(null); setWlqiSupply(null); setWlqiDecimals(null);
                setDynamicData(new Map()); setHistoricalData(new Map()); setTotalPoolValueScaled(null);
            }
            coreDataFetchedSuccessfully = false;
        } finally {
            if (coreDataFetchedSuccessfully) {
                prevWlqiSupplyRef.current = newWlqiSupply;
                prevTotalPoolValueScaledRef.current = newTotalPoolValueScaled;
            }
            if (!isBackground) {
                isLoadingFullDataRef.current = false;
                setIsLoadingPublicData(false);
            }
        }
    }, [program, provider, readOnlyProvider, connection, rateLimitedFetch]);

    const triggerFullPublicDataRefresh = useCallback(() => {
        hasFetchedPublicData.current = false; 
        fetchPublicPoolData({ isBackgroundRefresh: false });
    }, [fetchPublicPoolData]);

    const handleSubscriptionUpdate = useCallback(() => {
        fetchPublicPoolData({ isBackgroundRefresh: true });
    }, [fetchPublicPoolData]);

    // --- useSubscriptions Hook ---
    useSubscriptions({
        connection,
        poolConfig,
        poolConfigPda,
        userPublicKey: wallet.publicKey,
        refreshPublicData: handleSubscriptionUpdate, 
        refreshOracleData: refreshOracleData,       
        refreshSpecificTokenDataCallback: refreshSpecificTokenData, // Pass the new granular callback
        setUserWlqiBalance,
        setUserTokenBalances
    });

    const refreshPublicData = useCallback(() => {
        triggerFullPublicDataRefresh();
    }, [triggerFullPublicDataRefresh]);

    const refreshUserData = useCallback(async () => {
        await refreshUserDataFromHook();
    }, [refreshUserDataFromHook]);

    const refreshAllData = useCallback(() => {
        hasFetchedPublicData.current = false;
        fetchPublicPoolData({ isBackgroundRefresh: false }).then(() => {
            if (wallet.publicKey) { // Ensure user data is only refreshed if user is connected
                refreshUserDataFromHook();
            }
        });
    }, [fetchPublicPoolData, refreshUserDataFromHook, wallet.publicKey]);

    const wLqiValueScaled = useMemo(() => {
        if (totalPoolValueScaled === null || wLqiSupply === null || wLqiDecimals === null) return null;
        try {
            return calculateWLqiValue(totalPoolValueScaled, wLqiSupply, wLqiDecimals);
        } catch (e) {
            console.error("usePoolData: Error calculating wLqiValueScaled:", e);
            setError(prev => prev ? prev + "; Failed to calculate wLQI value" : "Failed to calculate wLQI value");
            return null;
        }
    }, [totalPoolValueScaled, wLqiSupply, wLqiDecimals]);

    const memoizedNewProcessedData = useMemo(() => {
        if (!poolConfig || !dynamicData || dynamicData.size === 0 || !historicalData || !oracleData?.data || totalPoolValueScaled === null) {
            return null;
        }
        try {
            const oracleTokenMap = new Map<string, ParsedOracleTokenInfo>(oracleData.data.map(info => [info.address, info]));
            const result = Array.from(dynamicData.entries())
                .map(([mintAddress, data]) => {
                    const tokenConfig = poolConfig.supportedTokens.find((st: SupportedToken) => st.mint?.toBase58() === mintAddress);
                    const oracleInfo = oracleTokenMap.get(mintAddress);
                    const history = historicalData.get(mintAddress);
                    const userBalanceForToken = userTokenBalances.get(mintAddress) ?? null;
                    if (!tokenConfig || history === undefined || data.decimals === null) return null;

                    const isWlqi = tokenConfig.mint?.equals(poolConfig.wliMint);
                    const processSingleTokenArgs = {
                        mintAddress: mintAddress,
                        data: { // Nested data structure as implied by linter
                            vaultBalance: data.vaultBalance,
                            priceFeedInfo: data.priceFeedInfo,
                            decimals: data.decimals,
                            userBalance: userBalanceForToken // Use the specific user balance here
                        },
                        tokenConfig: tokenConfig,
                        oracleInfo: oracleInfo, // Parameter name to match linter expectation
                        history: history,       // Parameter name to match linter expectation
                        currentTvlFromState: totalPoolValueScaled, // Parameter name to match linter expectation
                        // Retain other parameters that were part of the intended logic
                        userBalance: userBalanceForToken, // Often passed at top level as well
                        wlqiDecimals: wLqiDecimals,
                        wLqiMint: poolConfig.wliMint, 
                        wLqiValueScaled: isWlqi ? wLqiValueScaled : null
                    };
                    return processSingleToken(processSingleTokenArgs);
                })
                .filter((item): item is ProcessedTokenData => item !== null);
            return result;
        } catch (e) {
            console.error("usePoolData: Error processing token data:", e);
            setError(prev => prev ? prev + "; Failed to process token data" : "Failed to process token data");
            return null;
        }
    }, [poolConfig, dynamicData, historicalData, oracleData, totalPoolValueScaled, userTokenBalances, wLqiDecimals, wLqiValueScaled]);

    useEffect(() => {
        if (memoizedNewProcessedData) {
            setProcessedTokenData(memoizedNewProcessedData);
        }
    }, [memoizedNewProcessedData]);

    // Initial fetch of public data
    useEffect(() => {
        if (enabled && !hasFetchedPublicData.current && program && (provider || readOnlyProvider)) {
            fetchPublicPoolData({ isBackgroundRefresh: false });
        }
    }, [enabled, program, provider, readOnlyProvider, fetchPublicPoolData]);

    // Effect to update prevIsLoadingPublicRef after every render
    useEffect(() => {
        prevIsLoadingPublicRef.current = isLoadingPublicData;
    }); // No dependency array, runs after every render to capture the latest state

    // Effect to refresh user data when public data has just finished loading and user is connected
    useEffect(() => {
        const justFinishedLoadingPublic = prevIsLoadingPublicRef.current === true && isLoadingPublicData === false;

        if (enabled && wallet.publicKey && justFinishedLoadingPublic && !isLoadingUserData) {
            refreshUserDataFromHook();
        }
    }, [enabled, wallet.publicKey, isLoadingPublicData, isLoadingUserData, refreshUserDataFromHook]);
    
    // +++ START NEW FUNCTION +++
    const refreshAfterTransaction = useCallback(async (updatedMintAddressString: string | null) => {
        const functionStartTime = new Date().toLocaleTimeString();
        console.log(`[${functionStartTime}] refreshAfterTransaction: START for mint string ${updatedMintAddressString}`);

        if (!updatedMintAddressString) {
            console.warn("refreshAfterTransaction: Mint address string not provided.");
            return;
        }
        try {
            const updatedMintAddress = new PublicKey(updatedMintAddressString);
            console.log(`[${new Date().toLocaleTimeString()}] refreshAfterTransaction: Parsed mint ${updatedMintAddress.toBase58()}. Calling refreshSpecificTokenData.`);
            await refreshSpecificTokenData(updatedMintAddress);
            console.log(`[${new Date().toLocaleTimeString()}] refreshAfterTransaction: refreshSpecificTokenData COMPLETED for ${updatedMintAddress.toBase58()}. Calling refreshUserData.`);

            // Then, refresh user-specific balances.
            await refreshUserData(); // This refreshUserData is from usePoolData's scope, ultimately calling refreshUserDataFromHook
            console.log(`[${new Date().toLocaleTimeString()}] refreshAfterTransaction: refreshUserData COMPLETED for ${updatedMintAddress.toBase58()}.`);
            
            console.log(`[${new Date().toLocaleTimeString()}] refreshAfterTransaction: END for mint ${updatedMintAddress.toBase58()}`);
        } catch (error) {
            console.error(`refreshAfterTransaction: Invalid mint address string provided: ${updatedMintAddressString}`, error);
            // Optionally, trigger a broader refresh or set an error state
        }
    }, [refreshSpecificTokenData, refreshUserData]); // Depends on the refreshSpecificTokenData and refreshUserData callbacks from usePoolData
    // +++ END NEW FUNCTION +++
    
    return {
        poolConfig,
        poolConfigPda,
        dynamicData,
        historicalData,
        processedTokenData,
        totalPoolValueScaled,
        wLqiSupply,
        wLqiDecimals,
        wLqiValueScaled,
        isLoadingPublicData,
        isLoadingUserData,
        error,
        userDataError,
        userWlqiBalance,
        userTokenBalances,
        refreshPublicData,
        refreshOracleData,
        refreshUserData,
        refreshAllData,
        refreshSpecificTokenData, // Expose the new function
        refreshAfterTransaction, 
        oracleData
    };
} 