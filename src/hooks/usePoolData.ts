'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { PublicKey, SystemProgram, Connection } from '@solana/web3.js';
import { BN, Program, AnchorProvider } from '@coral-xyz/anchor';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { Buffer } from 'buffer';
import { getAssociatedTokenAddressSync, getMint } from '@solana/spl-token';
import {
    calculateWLqiValue,
} from '@/utils/calculations';
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
import { bytesToString } from '@/utils/helpers';
import { useOracleData } from './useOracleData';
import { createRateLimitedFetch } from '@/utils/hookUtils';
import { processSingleToken } from '@/utils/singleTokenProcessing';

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

    const processTokenDataWithCache = useCallback((mintAddress: string, data: DynamicTokenData, tokenConfig: SupportedToken, oracleInfo: ParsedOracleTokenInfo | undefined, history: HistoricalTokenDataDecoded | null, currentTvlFromState: BN, calculatedWlqiValue: BN, wLqiDecimals: number, userBalance: BN | null) => {
        return processSingleToken({
            mintAddress,
            data,
            tokenConfig,
            oracleInfo,
            history,
            currentTvlFromState,
            userBalance
        });
    }, []);

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

            // Fetch all accounts at once with retry
            const publicAccountsInfo = await rateLimitedFetch(
                () => connection.getMultipleAccountsInfo(publicAddressesToFetch),
                "Failed to fetch public accounts"
            );

            // Process fetched accounts
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

                const vaultInfo = publicAccountsInfo[info.vaultIndex];
                const priceFeedInfo = info.priceFeedIndex !== undefined ? publicAccountsInfo[info.priceFeedIndex] : null;
                const historyInfo = publicAccountsInfo[info.historyPdaIndex];

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

            // console.log("usePoolData Hook: Fetching multiple user accounts:", userAddressesToFetch.length);
            const userAccountsInfo = await connection.getMultipleAccountsInfo(userAddressesToFetch);

            // Process wLQI balance
            const userWlqiInfo = userAccountsInfo[0];
            const newWlqiBalance = userWlqiInfo ? decodeTokenAccountAmountBN(userWlqiInfo.data) : new BN(0);
            setUserWlqiBalance(newWlqiBalance);
            // console.log("usePoolData Hook: User wLQI Balance set:", newWlqiBalance.toString());

            // Process other token balances
            const newUserTokenBalancesMap = new Map<string, BN | null>();
            userAccountsInfo.slice(1).forEach((accInfo, index) => {
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
            // console.log("usePoolData Hook: User Token Balances set:", newUserTokenBalancesMap);

            hasFetchedUserData.current = true;
            // console.log("usePoolData Hook: [fetchUserAccountData] Set hasFetchedUserData flag to true.");

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("usePoolData Hook: Error fetching user account data:", errorMessage);
            setError(`Failed to load user account data: ${errorMessage}`); // Set specific error
            setUserWlqiBalance(null);
            setUserTokenBalances(new Map());
        } finally {
            setIsLoadingUserData(false);
        }
    }, [wallet.connected, wallet.publicKey, connection, poolConfig]); // Dependencies for user data fetch

    // --- NEW: Targeted function to fetch only oracle data ---
    const fetchAndSetOracleData = useCallback(async () => {
        if (!connection || !poolConfig || !poolConfig.oracleAggregatorAccount || poolConfig.oracleAggregatorAccount.equals(SystemProgram.programId)) {
            console.warn("usePoolData Hook: fetchAndSetOracleData skipped - connection or oracleAggregatorAccount in poolConfig not ready.");
            return;
        }

        const oracleAggregatorAddress = poolConfig.oracleAggregatorAccount;
        // console.log("usePoolData Hook: Fetching ONLY oracle data for:", oracleAggregatorAddress.toBase58());

        try {
            const oracleAccountInfo = await connection.getAccountInfo(oracleAggregatorAddress);
            if (!oracleAccountInfo) {
                console.error(`usePoolData Hook: fetchAndSetOracleData - Oracle Aggregator account (${oracleAggregatorAddress.toBase58()}) not found.`);
                // Consider setting a specific error or leaving oracleData as is if it disappears temporarily
                // For now, let's update the error state and potentially clear/stale the oracleData
                setError(prevError => prevError ? `${prevError}, Oracle account for subscription not found` : "Oracle account for subscription not found");
                return;
            }

            // --- Manual Deserialization Logic (adapted from fetchPublicPoolData) ---
            const oracleDataBuffer = Buffer.from(oracleAccountInfo.data.slice(8)); // Skip discriminator
            let offset = 0;
            offset += 32; // Skip authority
            offset += 4; // Skip totalTokens
            const vecLen = oracleDataBuffer.readUInt32LE(offset); offset += 4;

            const tokenInfoSize = 10 + 8 + 64 + 64 + 8; // symbol[10], dominance u64, address[64], feedId[64], timestamp i64

            const decodedTokens: ParsedOracleTokenInfo[] = [];
            for (let i = 0; i < vecLen; i++) {
                const start = offset;
                const end = start + tokenInfoSize;
                if (end > oracleDataBuffer.length) {
                    console.error(`usePoolData Hook: fetchAndSetOracleData - Oracle buffer overflow reading token ${i + 1}.`);
                    setError(prevError => prevError ? `${prevError}, Oracle data buffer overflow on refresh` : "Oracle data buffer overflow on refresh");
                    return;
                }
                const tokenSlice = oracleDataBuffer.subarray(start, end);

                const symbol = bytesToString(tokenSlice.subarray(0, 10));
                const dominance = new BN(tokenSlice.subarray(10, 18), 'le').toString();
                const address = bytesToString(tokenSlice.subarray(18, 18 + 64));
                const priceFeedId = bytesToString(tokenSlice.subarray(18 + 64, 18 + 64 + 64));
                const timestamp = new BN(tokenSlice.subarray(18 + 64 + 64, end), 'le').toString();

                decodedTokens.push({ symbol, dominance, address, priceFeedId, timestamp });
                offset = end;
            }

            refreshOracleData(); // Update oracle data
            // console.log("usePoolData Hook: Updated Oracle Data via fetchAndSetOracleData");
            // Avoid clearing general error, unless specifically an oracle error is resolved.
            // setError(null); 
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("usePoolData Hook: Error in fetchAndSetOracleData:", errorMessage);
            setError(prevError => prevError ? `${prevError}, Failed to refresh oracle data: ${errorMessage}` : `Failed to refresh oracle data: ${errorMessage}`);
            // Don't null out oracleData here necessarily, might want to keep stale data on transient network error
        }
    }, [connection, poolConfig, refreshOracleData, setError]); // bytesToString is a stable import

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

                    return processTokenDataWithCache(
                        mintAddress,
                        data,
                        tokenConfig,
                        oracleInfo,
                        history,
                        currentTvlFromState,
                        calculatedWlqiValue,
                        wLqiDecimals,
                        userBalance
                    );
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
    }, [poolConfig, dynamicData, historicalData, oracleData, wLqiSupply, wLqiDecimals, userTokenBalances, wallet.connected, totalPoolValueScaled, isLoadingPublicData, isLoadingUserData, processTokenDataWithCache]);

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

    // --- Effect to Subscribe to PoolConfig Changes --- 
    useEffect(() => {
        if (!connection || !poolConfigPda) { 
            return;
        }

        const subscriptionId = connection.onAccountChange(
            poolConfigPda,
            () => { 
                console.log("PoolConfig account changed via subscription, refreshing public data...");
                refreshPublicData();
            },
            "confirmed"
        );

        return () => {
            connection.removeAccountChangeListener(subscriptionId).catch(err => {
                console.error("Error removing PoolConfig listener:", err);
            });
        };

    }, [connection, poolConfigPda, refreshPublicData]);

    // --- Effect to Subscribe to Oracle Aggregator Account Changes ---
    useEffect(() => {
        if (!connection || !poolConfig || !poolConfig.oracleAggregatorAccount || poolConfig.oracleAggregatorAccount.equals(SystemProgram.programId)) {
            return;
        }

        const oracleAggregatorAddress = poolConfig.oracleAggregatorAccount;

        const subscriptionId = connection.onAccountChange(
            oracleAggregatorAddress,
            () => {
                console.log(`Oracle Aggregator account (${oracleAggregatorAddress.toBase58()}) changed via subscription, refreshing ONLY oracle data...`);
                fetchAndSetOracleData();
            },
            "confirmed"
        );

        return () => {
            connection.removeAccountChangeListener(subscriptionId).catch(err => {
                console.error(`Error removing Oracle Aggregator listener for ${oracleAggregatorAddress.toBase58()}:`, err);
            });
        };
    }, [connection, poolConfig, fetchAndSetOracleData]);

    // --- Effect to fetch W-LQI Mint address from Pool Config ---
    useEffect(() => {
        if (poolConfig) {
            setWLqiMint(poolConfig.wliMint);
        }
    }, [poolConfig]);

    // --- Effect for Subscribing to User Token Account Changes ---
    const userAccountSubscriptionIdsRef = useRef<number[]>([]);
    useEffect(() => {
        if (!connection || !wallet.publicKey || !poolConfig || !wLqiMint || !poolConfig.supportedTokens) {
            return;
        }

        const publicKey = wallet.publicKey;
        const tokenMints = poolConfig.supportedTokens.map(t => t.mint);
        const allMints = [wLqiMint, ...tokenMints];
        const currentSubs = userAccountSubscriptionIdsRef.current;

        // Cleanup existing subscriptions
        if (currentSubs.length > 0) {
            currentSubs.forEach(subId => {
                connection.removeAccountChangeListener(subId).catch(err => {
                    console.error("Error removing user account listener:", err);
                });
            });
            userAccountSubscriptionIdsRef.current = [];
        }

        const newSubIds: number[] = [];

        allMints.forEach(mint => {
            if (!mint) return;
            try {
                const userAta = getAssociatedTokenAddressSync(mint, publicKey, true);
                const subId = connection.onAccountChange(
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
                    },
                    'confirmed'
                );
                newSubIds.push(subId);
            } catch (err) {
                console.error(`Error getting ATA or subscribing for mint ${mint.toBase58()}:`, err);
            }
        });

        userAccountSubscriptionIdsRef.current = newSubIds;

        return () => {
            const subsToRemove = userAccountSubscriptionIdsRef.current;
            subsToRemove.forEach(subId => {
                connection.removeAccountChangeListener(subId).catch(err => {
                    console.error("Error removing user account listener during cleanup:", err);
                });
            });
            userAccountSubscriptionIdsRef.current = [];
        };

    }, [connection, wallet.publicKey, poolConfig, wLqiMint]);

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