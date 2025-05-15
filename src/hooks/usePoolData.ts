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
        enabled: enabled,
    });

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

            if (isMaintainerUpdateScenario) {
                console.log("usePoolData: Maintainer update detected (total value changed, wLQI supply same). Skipping token vault data refresh.");
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
                    if (!isBackground) setIsLoadingPublicData(false);
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

    const refreshPublicData = useCallback(() => {
        triggerFullPublicDataRefresh();
    }, [triggerFullPublicDataRefresh]);

    const refreshUserData = useCallback(async () => {
        await refreshUserDataFromHook();
    }, [refreshUserDataFromHook]);

    const refreshAllData = useCallback(() => {
        hasFetchedPublicData.current = false;
        fetchPublicPoolData({ isBackgroundRefresh: false }).then(() => {
            refreshUserDataFromHook();
        });
    }, [fetchPublicPoolData, refreshUserDataFromHook]);

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
                    return processSingleToken({ mintAddress, data: { vaultBalance: data.vaultBalance, priceFeedInfo: data.priceFeedInfo, decimals: data.decimals, userBalance: userBalanceForToken }, tokenConfig, oracleInfo, history, currentTvlFromState: totalPoolValueScaled, userBalance: userBalanceForToken });
                }).filter((data): data is ProcessedTokenData => data !== null);
            return result;
        } catch (e) {
            console.error("usePoolData: Error processing token data:", e);
            setError(prev => prev ? prev + "; Failed to process token data" : "Failed to process token data");
            return null;
        }
    }, [poolConfig, dynamicData, historicalData, oracleData?.data, userTokenBalances, totalPoolValueScaled]);
    
    useEffect(() => {
        if (isLoadingPublicData || isLoadingUserData) {
            return;
        }
        if (memoizedNewProcessedData === null) {
            if (processedTokenData !== null) {
                 setProcessedTokenData(null);
            }
            return;
        }
        if (JSON.stringify(processedTokenData) !== JSON.stringify(memoizedNewProcessedData)) {
            setProcessedTokenData(memoizedNewProcessedData);
        }
    }, [memoizedNewProcessedData, isLoadingPublicData, isLoadingUserData, processedTokenData]);

    useEffect(() => {
        if (program && connection && !hasFetchedPublicData.current) {
            if (!isLoadingFullDataRef.current) {
                fetchPublicPoolData({ isBackgroundRefresh: false });
            }
        } else if (program && connection && hasFetchedPublicData.current) {
        } else {
        }
    }, [program, connection, fetchPublicPoolData]);

    // --- CENTRALIZED SUBSCRIPTIONS ---
    useSubscriptions({
        connection,
        poolConfig,
        poolConfigPda,
        userPublicKey: wallet.publicKey,
        refreshPublicData: handleSubscriptionUpdate,
        refreshOracleData,
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