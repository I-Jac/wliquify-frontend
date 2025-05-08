'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { PublicKey, SystemProgram, Connection } from '@solana/web3.js';
import { BN, Program, AnchorProvider } from '@coral-xyz/anchor';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { USD_SCALE } from '@/utils/constants';
import { Buffer } from 'buffer';
import { getAssociatedTokenAddressSync, getMint } from '@solana/spl-token';
import {
    calculateWLqiValue,
    decodePriceData,
    formatScaledBnToDollarString,
    estimateFeeBpsBN,
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

    // --- Effect to Calculate Derived Values (Moved from Component) ---
    useEffect(() => {
        // Update guard clause to ensure poolConfig exists
        if (!poolConfig || !dynamicData || dynamicData.size === 0 || !historicalData || historicalData.size === 0 || !oracleData || wLqiDecimals === null || !wLqiSupply) {
            // console.log("usePoolData Hook: Skipping derived value calculation - data not ready");
            setWlqiValueScaled(null);
            return;
        }

        // Also wait for user balances if they haven't been fetched yet after public data is ready
        // This prevents processing with null user balances initially
        if (!hasFetchedUserData.current && wallet.connected) {
            // console.log("usePoolData Hook: Skipping derived value calculation - user data not fetched yet.");
             // Keep previous processed data if available, but don't calculate new until user data arrives
             // setProcessedTokenData(null); // Optionally reset here too
             return;
        }

        // console.log("usePoolData Hook: Calculating derived values...");
        try {
            // REMOVED: let calculatedTvl = new BN(0);
            const oracleTokenMap = new Map<string, ParsedOracleTokenInfo>(oracleData.data.map(info => [info.address, info]));
            const DOMINANCE_SCALE_FACTOR_BN = new BN(10).pow(new BN(10));
            const USD_SCALE_FACTOR_BN = new BN(10).pow(new BN(USD_SCALE));
            
            // Use TVL from state (which comes from poolConfig)
            const currentTvlFromState = totalPoolValueScaled; // Use state which holds the config value
            if (currentTvlFromState === null) {
                throw new Error("TVL from state is null, cannot calculate derived values.");
            }

            // Calculate wLQI value using TVL from state/config
            const calculatedWlqiValue = calculateWLqiValue(currentTvlFromState, wLqiSupply, wLqiDecimals);
            setWlqiValueScaled(calculatedWlqiValue);
            // console.log("usePoolData Hook: Calculated wLQI Value (using config TVL):", calculatedWlqiValue.toString());

            const intermediateData = Array.from(dynamicData.entries()).map(([mintAddress, data]) => {
                const tokenConfig = poolConfig.supportedTokens.find((st: SupportedToken) => st.mint?.toBase58() === mintAddress);
                const oracleInfo = oracleTokenMap.get(mintAddress);
                const history = historicalData.get(mintAddress);

                if (!data.vaultBalance || data.decimals === null || !tokenConfig || history === undefined) {
                    console.warn(`usePoolData Hook: Skipping intermediate processing for ${mintAddress}, base data missing.`);
                    return null;
                }

                const priceData = data.priceFeedInfo ? decodePriceData(data.priceFeedInfo) : null;
                // Price data might be null for delisted tokens, which is okay for TVL calculation (value is 0)
                // Only warn if an *active* token is missing price data
                if (!priceData && oracleInfo) {
                    console.warn(`usePoolData Hook: Skipping value calculation for active token ${mintAddress}, missing price data.`);
                    // Don't return null here, just calculate value as 0
                }

                // Calculate individual token value (still needed for display)
                const tokenValueScaled = priceData ? data.vaultBalance
                    .mul(priceData.price)
                    .mul(USD_SCALE_FACTOR_BN)
                    .div(new BN(10).pow(new BN(data.decimals - priceData.expo))) : new BN(0);

                // REMOVED: calculatedTvl = calculatedTvl.add(tokenValueScaled);

                return {
                    mintAddress,
                    data,
                    tokenConfig,
                    oracleInfo,
                    history,
                    priceData,
                    tokenValueScaled,
                };
            }).filter(item => item !== null);

            // --- Process Tokens --- 
            const newProcessedData = intermediateData.map((item): ProcessedTokenData | null => {
                const { mintAddress, data, tokenConfig, oracleInfo, history, priceData, tokenValueScaled } = item!;

                const isDelisted = !oracleInfo;

                // --- Symbol Determination --- 
                let symbol: string;
                if (history?.symbol && history.symbol.length > 0 && !history.symbol.includes('\0')) {
                    symbol = history.symbol;
                } else if (oracleInfo?.symbol && oracleInfo.symbol.length > 0 && !oracleInfo.symbol.includes('\0')) {
                    symbol = oracleInfo.symbol;
                } else {
                    symbol = mintAddress.substring(0, 4) + '...';
                }

                // --- Target Dominance --- 
                const targetDominanceBN = isDelisted ? new BN(0) : new BN(oracleInfo!.dominance); // Use BN from oracle data
                const targetDominancePercent = isDelisted ? 0 : targetDominanceBN.mul(new BN(100 * 10000)).div(DOMINANCE_SCALE_FACTOR_BN).toNumber() / 10000;
                const targetDominanceDisplay = isDelisted ? "0%" : `${targetDominancePercent.toFixed(4)}%`;

                // --- Actual Dominance --- 
                 // Use TVL from state/config for calculation
                const actualDominancePercent = currentTvlFromState.isZero()
                    ? 0
                    : tokenValueScaled.mul(new BN(100 * 10000)).div(currentTvlFromState).toNumber() / 10000;

                // --- Fee/Bonus BPS --- 
                // Pass TVL from state/config to the estimator
                const estimatedDepositFeeBpsBN = estimateFeeBpsBN(
                    isDelisted,
                    true, // isDeposit
                    tokenValueScaled, // Use individual token value
                    currentTvlFromState, // Pass TVL from state/config
                    targetDominanceBN, // Use BN from oracle
                    null, 
                    calculatedWlqiValue, 
                    wLqiDecimals, 
                    undefined
                );
                const estimatedWithdrawFeeBpsBN = estimateFeeBpsBN(
                    isDelisted,
                    false, // isDeposit
                    tokenValueScaled, // Use individual token value
                    currentTvlFromState, // Pass TVL from state/config
                    targetDominanceBN, // Use BN from oracle
                    null, 
                    calculatedWlqiValue, 
                    wLqiDecimals, 
                    undefined // Withdraw amount string not available here, estimate based on zero amount
                );
                
                // --- Icon --- 
                let icon = '@/public/tokens/unknown.png'; // Use a default unknown icon
                if (symbol && !symbol.includes('...')) { 
                    // Basic sanitization for filename
                    const sanitizedSymbol = symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
                    icon = `/tokens/${sanitizedSymbol}.png`;
                }

                return {
                    mintAddress,
                    symbol: symbol,
                    icon: icon,
                    poolValueUSD: formatScaledBnToDollarString(tokenValueScaled, USD_SCALE),
                    actualDominancePercent: actualDominancePercent,
                    targetDominance: targetDominanceBN,
                    targetDominancePercent: targetDominancePercent,
                    targetDominanceDisplay: targetDominanceDisplay,
                    decimals: history?.decimals ?? data.decimals!,
                    isDelisted: isDelisted,
                    depositFeeOrBonusBps: estimatedDepositFeeBpsBN?.toNumber() ?? (isDelisted ? null : 10), // Example assignment
                    withdrawFeeOrBonusBps: estimatedWithdrawFeeBpsBN?.toNumber() ?? (isDelisted ? -500 : 10), // Example assignment
                    priceFeedId: tokenConfig!.priceFeed.toBase58(),
                    vaultBalance: data.vaultBalance!,
                    priceData: priceData!,
                    userBalance: userTokenBalances.get(mintAddress) ?? null,
                    timestamp: oracleInfo?.timestamp ?? '0', // Add timestamp from oracleInfo
                };
            }).filter((data): data is ProcessedTokenData => data !== null);

            // --- Use Functional Update for ProcessedTokenData with Comparison --- 
            setProcessedTokenData(prevProcessedTokenData => {
                // --- DEFER UPDATE DURING REFRESH --- 
                // If still loading public or user data, keep showing the previous state
                // This prevents intermediate renders with inconsistent data during refresh
                if (isLoadingPublicData || isLoadingUserData) {
                    // console.log("usePoolData Hook: Deferring processedTokenData update (still refreshing)");
                    return prevProcessedTokenData; 
                }

                // --- If not loading, proceed with comparison/update --- 
                // NOTE: newProcessedData is calculated outside using current hook scope values
                
                // --- Compare with Previous State --- 
                // 1. Handle initial run (this should only happen on first load now)
                if (!prevProcessedTokenData) {
                    // console.log(`usePoolData Hook: Updating state (first run - prev data null)`);
                    return newProcessedData;
                }

                // 2. Handle length mismatch
                if (prevProcessedTokenData.length !== newProcessedData.length) {
                    // console.log(`usePoolData Hook: Updating state (length mismatch - prev: ${prevProcessedTokenData.length}, new: ${newProcessedData.length})`);
                    return newProcessedData;
                }
                
                // --- 3. Lengths match & prev state exists: Perform detailed comparison --- 
                let changed = false;
                let fieldChanged = 'none'; 
                for (let i = 0; i < newProcessedData.length; i++) {
                    // NOTE: Now TS knows prevProcessedTokenData is not null here
                    const prevToken = prevProcessedTokenData[i]; 
                    const newToken = newProcessedData[i];

                    // Reset fieldChanged for each token comparison
                    fieldChanged = 'none'; 
                    // TODO: Refine comparison fields - include relevant ones like balances, values, fees
                    if (prevToken.mintAddress !== newToken.mintAddress) fieldChanged = 'mintAddress';
                    else if (!prevToken.vaultBalance?.eq(newToken.vaultBalance)) fieldChanged = 'vaultBalance'; // Compare vault balances
                    // else if (prevToken.poolValueUSD !== newToken.poolValueUSD) fieldChanged = 'poolValueUSD'; // Compare formatted string (less ideal)
                    else if (prevToken.actualDominancePercent !== newToken.actualDominancePercent) fieldChanged = 'actualDominancePercent';
                    else if (!prevToken.targetDominance?.eq(newToken.targetDominance)) fieldChanged = 'targetDominance'; // Compare target BN
                    else if (prevToken.isDelisted !== newToken.isDelisted) fieldChanged = 'isDelisted';
                    else if (prevToken.depositFeeOrBonusBps !== newToken.depositFeeOrBonusBps) fieldChanged = 'depositFeeOrBonusBps';
                    else if (prevToken.withdrawFeeOrBonusBps !== newToken.withdrawFeeOrBonusBps) fieldChanged = 'withdrawFeeOrBonusBps';
                    else if (!prevToken.userBalance?.eq(newToken.userBalance ?? new BN(0))) fieldChanged = 'userBalance'; // Compare user balances (handle null)
                    // Add price comparison if needed
                    // else if (prevToken.priceData?.price?.toString() !== newToken.priceData?.price?.toString()) fieldChanged = 'price'; // Compare price BN as string
                    
                    if (fieldChanged !== 'none') 
                    {
                        // console.log(`usePoolData Hook: Change detected for ${newToken.symbol} (${newToken.mintAddress.substring(0,4)}) - Field: ${fieldChanged}`);
                        changed = true;
                        break; // Exit loop early if change found
                    }
                }

                // --- 4. Return based on comparison result (only if not loading) ---
                if (changed) {
                    // console.log("usePoolData Hook: Updating state (data changed - refresh complete)");
                    return newProcessedData;
                } else {
                    // console.log("usePoolData Hook: Skipping state update (data unchanged - refresh complete)");
                    return prevProcessedTokenData; // Return the old state reference
                }
            }); // End functional update

            // console.log("usePoolData Hook: Processed Token Data:", newProcessedData); // Keep this outside if you want to see the calculated data always

        } catch (e) {
            console.error("usePoolData Hook: Error calculating derived values:", e);
            setError("Failed to process pool data.");
            setProcessedTokenData(null);
            // totalPoolValueScaled is set elsewhere
            setWlqiValueScaled(null);
        }
        // Update dependencies: Add poolConfig, totalPoolValueScaled, isLoadingPublicData, isLoadingUserData
    }, [poolConfig, dynamicData, historicalData, oracleData, wLqiSupply, wLqiDecimals, userTokenBalances, wallet.connected, totalPoolValueScaled, isLoadingPublicData, isLoadingUserData]); // Removed hasFetchedUserData.current 

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