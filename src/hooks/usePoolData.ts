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
import { fetchCorePoolConfigAndWLQI, RateLimitedFetchFn } from '@/utils/app/poolDataUtils';
import { fetchSupportedTokensPublicData } from '@/utils/app/poolDataUtils';

interface UsePoolDataProps {
    program: Program<WLiquifyPool> | null;
    provider: AnchorProvider | null;
    readOnlyProvider: AnchorProvider | null;
    connection: Connection;
    wallet: WalletContextState;
}

export function usePoolData({
    program,
    provider,
    readOnlyProvider,
    connection,
    wallet,
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
    const isLoadingFullDataRef = useRef(false); // To prevent concurrent full refreshes

    const rateLimitedFetch = useMemo(() => createRateLimitedFetch(connection), [connection]);

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
        rateLimitedFetch: rateLimitedFetch,
    });

    // --- Fetch Public Pool Data ---
    const fetchPublicPoolData = useCallback(async (options?: { isBackgroundRefresh?: boolean }) => {
        const isBackground = options?.isBackgroundRefresh ?? false;

        if (!isBackground) {
            if (isLoadingFullDataRef.current) {
                // console.log("usePoolData: Full fetch already in progress, skipping new full fetch request.");
                return;
            }
            isLoadingFullDataRef.current = true;
        }

        // console.log(`usePoolData: fetchPublicPoolData START. isBackground: ${isBackground}, hasFetchedPublicData.current: ${hasFetchedPublicData.current}, isLoadingFullDataRef: ${isLoadingFullDataRef.current}`);
        const activeProvider = provider || readOnlyProvider;
        const currentProgram = program;
        const currentConnection = activeProvider?.connection ?? connection;

        if (!currentProgram || !currentConnection) {
            // console.warn("usePoolData: Fetch skipped - Program or Connection not ready.");
            if (!isBackground) setIsLoadingPublicData(false);
            return;
        }

        if (!isBackground) {
            setIsLoadingPublicData(true);
            setError(null);
            // console.log("usePoolData: Resetting state for full refresh.");
            setPoolConfig(null);
            setPoolConfigPda(null);
            setWlqiSupply(null);
            setWlqiDecimals(null);
            setDynamicData(new Map());
            setHistoricalData(new Map());
            setTotalPoolValueScaled(null);
            // DO NOT set hasFetchedPublicData.current = false here. Let the initial useEffect control its first run.
            // It will be set to true upon successful completion of a non-background fetch.
        } else {
            // console.log("usePoolData: Background refresh initiated.");
        }

        try {
            const coreDataResult = await fetchCorePoolConfigAndWLQI(
                currentProgram,
                currentConnection,
                rateLimitedFetch as RateLimitedFetchFn 
            );
            // console.log("usePoolData: Core data fetched.", coreDataResult.poolConfig ? 'Config OK' : 'Config FAIL', coreDataResult.error ? `Error: ${coreDataResult.error}` : '');

            if (coreDataResult.error || !coreDataResult.poolConfig || !coreDataResult.poolConfigPda || coreDataResult.wlqiSupply === null || coreDataResult.wlqiDecimals === null || !coreDataResult.wLqiMint) {
                const errorMsg = coreDataResult.error || "Failed to load essential pool configuration or wLQI data.";
                // console.error("usePoolData: Error with core pool data:", errorMsg);
                if (!isBackground) {
                    setError(errorMsg);
                    // Potentially set partial data if useful, or ensure clean slate
                    setPoolConfig(coreDataResult.poolConfig || null);
                    setPoolConfigPda(coreDataResult.poolConfigPda || null);
                }
                // No matter what, if core data fails on a full refresh, we stop and set loading false.
                if (!isBackground) setIsLoadingPublicData(false);
                return;
            }
            
            const fetchedConfig = coreDataResult.poolConfig;
            setPoolConfig(fetchedConfig);
            setPoolConfigPda(coreDataResult.poolConfigPda);
            setTotalPoolValueScaled(fetchedConfig.currentTotalPoolValueScaled);
            setWlqiSupply(coreDataResult.wlqiSupply);
            setWlqiDecimals(coreDataResult.wlqiDecimals);
            // console.log("usePoolData: Core states updated. TotalPoolValue:", fetchedConfig.currentTotalPoolValueScaled?.toString());

            const supportedTokensDataResult = await fetchSupportedTokensPublicData(
                currentConnection,
                currentProgram.programId,
                fetchedConfig.supportedTokens,
                rateLimitedFetch as RateLimitedFetchFn
            );
            // console.log("usePoolData: Supported tokens data fetched.", supportedTokensDataResult.dynamicData ? `DynamicData Count: ${supportedTokensDataResult.dynamicData.size}` : 'DynamicData FAIL', supportedTokensDataResult.error ? `Error: ${supportedTokensDataResult.error}` : '');

            if (supportedTokensDataResult.error) {
                const tokenDataErrorMsg = supportedTokensDataResult.error ?? "Error fetching token dynamic/historical data.";
                // console.error("usePoolData: Error with supported tokens data:", tokenDataErrorMsg);
                if (!isBackground) {
                     setError(prevError => prevError ? `${prevError}; ${tokenDataErrorMsg}` : tokenDataErrorMsg);
                }
                // If dynamic data fails on a full refresh, we might still have core data.
                // Set loading to false. Decide if historical/dynamic should be cleared.
                if (!isBackground) setIsLoadingPublicData(false); // Allow UI to update even if only partial data.
                // We're not returning here, so dynamic/historical will be set below, possibly to empty maps.
            }
            
            setDynamicData(supportedTokensDataResult.dynamicData as Map<string, DynamicTokenData> || new Map()); 
            setHistoricalData(supportedTokensDataResult.historicalData || new Map());

            if (!isBackground) {
                hasFetchedPublicData.current = true; // Mark success for full refresh
                // console.log("usePoolData: Full refresh SUCCESS. hasFetchedPublicData.current = true.");
            }
            // console.log("usePoolData: fetchPublicPoolData successful (end of try block).");
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            // console.error(`usePoolData: CATCH block error (background: ${isBackground}):`, errorMessage);
            if (!isBackground) {
                setError(`Failed to load public pool data: ${errorMessage}`);
                // Ensure state is reset cleanly on major error for non-background
                setPoolConfig(null); setPoolConfigPda(null); setWlqiSupply(null); setWlqiDecimals(null);
                setDynamicData(new Map()); setHistoricalData(new Map()); setTotalPoolValueScaled(null);
            }
        } finally {
            if (!isBackground) {
                isLoadingFullDataRef.current = false; // Reset on completion or error for non-background fetches
                setIsLoadingPublicData(false);
                // console.log("usePoolData: setIsLoadingPublicData(false) and isLoadingFullDataRef.current=false in FINALLY (full refresh).");
            }
            // console.log(`usePoolData: fetchPublicPoolData END. hasFetchedPublicData.current: ${hasFetchedPublicData.current}, isLoadingFullDataRef: ${isLoadingFullDataRef.current}`);
        }
    }, [program, provider, readOnlyProvider, connection, rateLimitedFetch]);

    const triggerFullPublicDataRefresh = useCallback(() => {
        // console.log("usePoolData: Manual refresh triggered (triggerFullPublicDataRefresh).");
        // For manual refresh, explicitly set hasFetched to false so it behaves like initial load
        // if we want to show skeletons etc. Or, keep it true and just re-fetch.
        // For now, let's ensure it re-triggers the loading state fully.
        hasFetchedPublicData.current = false; 
        fetchPublicPoolData({ isBackgroundRefresh: false });
    }, [fetchPublicPoolData]);

    const handleSubscriptionUpdate = useCallback(() => {
        // console.log("usePoolData: Subscription triggered background data refresh.");
        fetchPublicPoolData({ isBackgroundRefresh: true });
    }, [fetchPublicPoolData]);

    const refreshPublicData = useCallback(() => {
        triggerFullPublicDataRefresh();
    }, [triggerFullPublicDataRefresh]);

    const refreshUserData = useCallback(async () => {
        await refreshUserDataFromHook();
    }, [refreshUserDataFromHook]);

    const refreshAllData = useCallback(() => {
        // console.log("usePoolData: refreshAllData triggered.");
        // This will set isLoadingPublicData true via fetchPublicPoolData directly
        hasFetchedPublicData.current = false; // Ensure it acts like a full refresh trigger
        fetchPublicPoolData({ isBackgroundRefresh: false }).then(() => {
            refreshUserDataFromHook();
        });
    }, [fetchPublicPoolData, refreshUserDataFromHook]);

    const wLqiValueScaled = useMemo(() => {
        // Minimal logging here unless an issue is suspected
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
        // console.log("usePoolData: Calculating memoizedNewProcessedData. Relevant states:", { hasPoolConfig: !!poolConfig, dynamicDataSize: dynamicData.size, hasOracleData: !!oracleData?.data, hasTotalPoolValue: !!totalPoolValueScaled });
        if (!poolConfig || !dynamicData || dynamicData.size === 0 || !historicalData || !oracleData?.data || totalPoolValueScaled === null) {
            // console.log("usePoolData: memoizedNewProcessedData returning null (missing dependencies).");
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
                    return processSingleToken({ mintAddress, data: { vaultBalance: data.vaultBalance, priceFeedInfo: data.priceFeedInfo, decimals: data.decimals, userBalance: userBalanceForToken }, tokenConfig, oracleInfo, history, currentTvlFromState: totalPoolValueScaled, userBalance: userBalanceForToken });
                }).filter((data): data is ProcessedTokenData => data !== null);
            // console.log("usePoolData: memoizedNewProcessedData SUCCESS, result count:", result.length);
            return result;
        } catch (e) {
            // console.error("usePoolData: Error processing token data:", e);
            console.error("usePoolData: Error in memoizedNewProcessedData:", e);
            setError(prev => prev ? prev + "; Failed to process token data" : "Failed to process token data");
            return null;
        }
    }, [poolConfig, dynamicData, historicalData, oracleData?.data, userTokenBalances, totalPoolValueScaled]);
    
    useEffect(() => {
        // console.log(`usePoolData: Effect for processedTokenData. isLoadingPublic: ${isLoadingPublicData}, isLoadingUser: ${isLoadingUserData}, memoizedDataIsNull: ${memoizedNewProcessedData === null}`);
        if (isLoadingPublicData || isLoadingUserData) {
            // console.log("usePoolData: ProcessedTokenData update bailed (main data loading).");
            return;
        }
        if (memoizedNewProcessedData === null) {
            if (processedTokenData !== null) {
                // console.log("usePoolData: Setting processedTokenData to null.");
                 setProcessedTokenData(null);
            }
            return;
        }
        if (JSON.stringify(processedTokenData) !== JSON.stringify(memoizedNewProcessedData)) {
            // console.log("usePoolData: Updating processedTokenData.");
            setProcessedTokenData(memoizedNewProcessedData);
        }
    }, [memoizedNewProcessedData, isLoadingPublicData, isLoadingUserData, processedTokenData]);

    useEffect(() => {
        // console.log(`usePoolData: Initial fetch effect check. Program: ${!!program}, Connection: ${!!connection}, HasFetched: ${hasFetchedPublicData.current}, IsLoadingFull: ${isLoadingFullDataRef.current}`);
        if (program && connection && !hasFetchedPublicData.current) {
            if (!isLoadingFullDataRef.current) { // Check if a full fetch is already running
                // console.log(`usePoolData: Initial fetch RUNNING (condition met: not fetched yet and no full fetch in progress).`);
                fetchPublicPoolData({ isBackgroundRefresh: false });
            } else {
                // console.log(`usePoolData: Initial fetch SKIPPED (condition met: not fetched yet BUT a full fetch is already in progress).`);
            }
        } else if (program && connection && hasFetchedPublicData.current) {
            // console.log(`usePoolData: Initial fetch SKIPPED (already fetched successfully).`);
        } else {
            // console.log(`usePoolData: Initial fetch SKIPPED (program or connection not ready, or other condition not met).`);
        }
    }, [program, connection, fetchPublicPoolData]); // fetchPublicPoolData is a dependency because it's called.

    // --- CENTRALIZED SUBSCRIPTIONS ---
    useSubscriptions({
        connection,
        poolConfig,
        poolConfigPda,
        userPublicKey: wallet.publicKey,
        refreshPublicData: handleSubscriptionUpdate, // Changed from refreshPublicData
        refreshOracleData, // Assuming oracle data refresh can be handled similarly or is less disruptive
        setUserWlqiBalance,
        setUserTokenBalances,
    });

    // Combine public data error and user data error for a general error display if needed by UI
    const combinedError = [error, userDataError].filter(Boolean).join('; ');

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
        error: combinedError || null,
        refreshPublicData,
        refreshUserData,
        refreshAllData,
    };
} 