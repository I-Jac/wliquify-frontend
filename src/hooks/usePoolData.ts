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
    const fetchPublicPoolData = useCallback(async () => {
        const activeProvider = provider || readOnlyProvider;
        const currentProgram = program;
        const currentConnection = activeProvider?.connection ?? connection;

        if (!currentProgram || !currentConnection) {
            console.warn("usePoolData Hook: Fetch public data skipped: Program or Connection not ready.");
            setIsLoadingPublicData(false);
            return;
        }
        setIsLoadingPublicData(true);
        setError(null);
        setPoolConfig(null);
        setPoolConfigPda(null);
        setWlqiSupply(null);
        setWlqiDecimals(null);
        setDynamicData(new Map());
        setHistoricalData(new Map());
        setTotalPoolValueScaled(null);
        hasFetchedPublicData.current = false;

        try {
            const coreDataResult = await fetchCorePoolConfigAndWLQI(
                currentProgram,
                currentConnection,
                rateLimitedFetch as RateLimitedFetchFn 
            );
            if (coreDataResult.error || !coreDataResult.poolConfig || !coreDataResult.poolConfigPda || coreDataResult.wlqiSupply === null || coreDataResult.wlqiDecimals === null || !coreDataResult.wLqiMint) {
                setError(coreDataResult.error || "Failed to load essential pool configuration or wLQI data.");
                setPoolConfig(coreDataResult.poolConfig || null);
                setPoolConfigPda(coreDataResult.poolConfigPda || null);
                setWlqiSupply(coreDataResult.wlqiSupply || null);
                setWlqiDecimals(coreDataResult.wlqiDecimals || null);
                setIsLoadingPublicData(false);
                return;
            }
            const fetchedConfig = coreDataResult.poolConfig;
            setPoolConfig(fetchedConfig);
            setPoolConfigPda(coreDataResult.poolConfigPda);
            setTotalPoolValueScaled(fetchedConfig.currentTotalPoolValueScaled);
            setWlqiSupply(coreDataResult.wlqiSupply);
            setWlqiDecimals(coreDataResult.wlqiDecimals);

            const supportedTokensDataResult = await fetchSupportedTokensPublicData(
                currentConnection,
                currentProgram.programId,
                fetchedConfig.supportedTokens,
                rateLimitedFetch as RateLimitedFetchFn
            );
            if (supportedTokensDataResult.error) {
                setError(prevError => prevError ? `${prevError}; ${supportedTokensDataResult.error}` : (supportedTokensDataResult.error ?? null));
            }
            setDynamicData(supportedTokensDataResult.dynamicData as Map<string, DynamicTokenData>); 
            setHistoricalData(supportedTokensDataResult.historicalData);
            hasFetchedPublicData.current = true;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("usePoolData Hook: Error fetching public pool data:", errorMessage);
            setError(`Failed to load public pool data: ${errorMessage}`);
            setPoolConfig(null); setPoolConfigPda(null); setWlqiSupply(null); setWlqiDecimals(null);
            setDynamicData(new Map()); setHistoricalData(new Map()); setTotalPoolValueScaled(null);
        } finally {
            setIsLoadingPublicData(false);
        }
    }, [program, provider, readOnlyProvider, connection, rateLimitedFetch]);

    // --- Refresh Functions ---
    const refreshPublicData = useCallback(() => {
        hasFetchedPublicData.current = false;
        fetchPublicPoolData();
    }, [fetchPublicPoolData]);

    const refreshUserData = useCallback(async () => {
        await refreshUserDataFromHook();
    }, [refreshUserDataFromHook]);

    const refreshAllData = useCallback(() => {
        hasFetchedPublicData.current = false;
        fetchPublicPoolData().then(() => {
            refreshUserDataFromHook();
        });
    }, [fetchPublicPoolData, refreshUserDataFromHook]);

    // --- Calculate Derived Values ---

    const wLqiValueScaled = useMemo(() => {
        if (totalPoolValueScaled === null || wLqiSupply === null || wLqiDecimals === null) {
            return null;
        }
        try {
            return calculateWLqiValue(totalPoolValueScaled, wLqiSupply, wLqiDecimals);
        } catch (e) {
            console.error("usePoolData Hook: Error calculating wLqiValueScaled:", e);
            setError(prev => prev ? prev + "; Failed to calculate wLQI value" : "Failed to calculate wLQI value");
            return null;
        }
    }, [totalPoolValueScaled, wLqiSupply, wLqiDecimals]);

    const memoizedNewProcessedData = useMemo(() => {
        if (!poolConfig || !dynamicData || dynamicData.size === 0 || !historicalData || historicalData.size === 0 || !oracleData?.data || totalPoolValueScaled === null) {
            return null;
        }

        try {
            const oracleTokenMap = new Map<string, ParsedOracleTokenInfo>(oracleData.data.map(info => [info.address, info]));
            
            return Array.from(dynamicData.entries())
                .map(([mintAddress, data]) => {
                    const tokenConfig = poolConfig.supportedTokens.find((st: SupportedToken) => st.mint?.toBase58() === mintAddress);
                    const oracleInfo = oracleTokenMap.get(mintAddress);
                    const history = historicalData.get(mintAddress);
                    const userBalanceForToken = userTokenBalances.get(mintAddress) ?? null;

                    if (!tokenConfig || history === undefined || data.decimals === null) {
                        return null;
                    }

                    return processSingleToken({
                        mintAddress,
                        data: {
                            vaultBalance: data.vaultBalance,
                            priceFeedInfo: data.priceFeedInfo,
                            decimals: data.decimals,
                            userBalance: userBalanceForToken,
                        },
                        tokenConfig,
                        oracleInfo,
                        history,
                        currentTvlFromState: totalPoolValueScaled,
                        userBalance: userBalanceForToken,
                    });
                })
                .filter((data): data is ProcessedTokenData => data !== null);
        } catch (e) {
            console.error("usePoolData Hook: Error memoizing newProcessedData:", e);
            setError(prev => prev ? prev + "; Failed to process token data" : "Failed to process token data");
            return null;
        }
    }, [poolConfig, dynamicData, historicalData, oracleData?.data, userTokenBalances, totalPoolValueScaled]);
    
    useEffect(() => {
        if (isLoadingPublicData || isLoadingUserData) {
            // Don't update processedTokenData while main data is loading; it will keep its previous state.
            // wLqiValueScaled will also update independently via its useMemo when its deps are ready.
            return;
        }

        // If memoizedNewProcessedData is null (due to its own guards or error), set processedTokenData to null
        if (memoizedNewProcessedData === null) {
            setProcessedTokenData(null);
            // If wLqiValueScaled calculation also resulted in null, ensure error state reflects potential issues.
            if (wLqiValueScaled === null && (!wLqiSupply || wLqiDecimals === null || totalPoolValueScaled === null)) {
                // This condition might be too specific or redundant if useMemo for wLqiValueScaled already sets an error.
            }
            return;
        }

        setProcessedTokenData(prevProcessedTokenData => {
            if (JSON.stringify(prevProcessedTokenData) !== JSON.stringify(memoizedNewProcessedData)) {
                return memoizedNewProcessedData;
            }
            return prevProcessedTokenData;
        });

    }, [memoizedNewProcessedData, isLoadingPublicData, isLoadingUserData, wLqiValueScaled, wLqiSupply, wLqiDecimals, totalPoolValueScaled]);

    // --- Effect for Initial Public Data Fetch ---
    useEffect(() => {
        if (program && (provider || readOnlyProvider) && connection && !hasFetchedPublicData.current) {
            fetchPublicPoolData();
        }
    }, [program, provider, readOnlyProvider, connection, fetchPublicPoolData]);

    // --- CENTRALIZED SUBSCRIPTIONS ---
    useSubscriptions({
        connection,
        poolConfig,
        poolConfigPda,
        userPublicKey: wallet.publicKey,
        refreshPublicData,
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