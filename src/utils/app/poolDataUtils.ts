import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { getMint } from '@solana/spl-token';
import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool';
import { PoolConfig, SupportedToken, DynamicTokenData, HistoricalTokenDataDecoded } from '@/utils/core/types';
import { findPoolConfigPDA, findHistoricalTokenDataPDA } from '@/utils/solana/pda';
import { decodeHistoricalTokenData, decodeTokenAccountAmountBN } from '@/utils/solana/accounts';

// Type for the rateLimitedFetch function passed from usePoolData
export type RateLimitedFetchFn = <T>(
    fetchFn: () => Promise<T>,
    errorMessage: string
) => Promise<T | null>;

interface CorePoolConfigAndWLQIResult {
    poolConfig: PoolConfig | null;
    poolConfigPda: PublicKey | null;
    wlqiSupply: string | null;
    wlqiDecimals: number | null;
    wLqiMint: PublicKey | null;
    error?: string;
}

/**
 * Fetches the core pool configuration, wLQI mint address, wLQI supply, and wLQI decimals.
 */
export async function fetchCorePoolConfigAndWLQI(
    program: Program<WLiquifyPool> | null,
    connection: Connection | null, // Connection can be null if provider is not ready
    rateLimitedFetch: RateLimitedFetchFn
): Promise<CorePoolConfigAndWLQIResult> {
    if (!program) {
        return { poolConfig: null, poolConfigPda: null, wlqiSupply: null, wlqiDecimals: null, wLqiMint: null, error: "Program not initialized." };
    }
    if (!connection) {
        return { poolConfig: null, poolConfigPda: null, wlqiSupply: null, wlqiDecimals: null, wLqiMint: null, error: "Connection not available." };
    }

    try {
        const programId = program.programId;
        const configPda = findPoolConfigPDA(programId);

        const fetchedConfig = await rateLimitedFetch(
            () => program.account.poolConfig.fetch(configPda) as Promise<PoolConfig>,
            "Failed to fetch pool config"
        );

        if (!fetchedConfig) {
            return { poolConfig: null, poolConfigPda: configPda, wlqiSupply: null, wlqiDecimals: null, wLqiMint: null, error: "Failed to fetch pool config." };
        }

        const wlqiMintAddress = fetchedConfig.wliMint;

        const [wlqiSupplyData, wlqiMintData] = await Promise.all([
            rateLimitedFetch(
                () => connection.getTokenSupply(wlqiMintAddress),
                "Failed to fetch wLQI supply"
            ),
            rateLimitedFetch(
                () => getMint(connection, wlqiMintAddress),
                "Failed to fetch wLQI mint data"
            )
        ]);

        if (!wlqiSupplyData || !wlqiMintData) {
            let errorMsg = "Failed to fetch wLQI details: ";
            if (!wlqiSupplyData) errorMsg += "Supply data missing. ";
            if (!wlqiMintData) errorMsg += "Mint data missing.";
            return { poolConfig: fetchedConfig, poolConfigPda: configPda, wlqiSupply: null, wlqiDecimals: null, wLqiMint: wlqiMintAddress, error: errorMsg.trim() };
        }

        const fetchedWlqiSupply = wlqiSupplyData.value.amount;
        const fetchedWlqiDecimals = wlqiMintData.decimals;

        return {
            poolConfig: fetchedConfig,
            poolConfigPda: configPda,
            wlqiSupply: fetchedWlqiSupply,
            wlqiDecimals: fetchedWlqiDecimals,
            wLqiMint: wlqiMintAddress,
        };

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("fetchCorePoolConfigAndWLQI Error:", errorMessage);
        return { poolConfig: null, poolConfigPda: null, wlqiSupply: null, wlqiDecimals: null, wLqiMint: null, error: `Failed to load core pool/wLQI data: ${errorMessage}` };
    }
}

// Placeholder for the next utility function
// export async function fetchSupportedTokensPublicData(...)

interface SupportedTokensPublicDataResult {
    dynamicData: Map<string, Pick<DynamicTokenData, 'vaultBalance' | 'priceFeedInfo' | 'decimals' | 'userBalance'> >; // UserBalance will be null initially
    historicalData: Map<string, HistoricalTokenDataDecoded | null>;
    error?: string;
}

interface TokenProcessingInfoInternal {
    mint: PublicKey;
    vault: PublicKey;
    priceFeed: PublicKey; // Can be SystemProgram.programId if not set
    vaultIndex: number;
    priceFeedIndex?: number;
    historyPdaIndex: number;
    mintDecimals: number;
}

/**
 * Fetches public data for supported tokens (excluding wLQI).
 * This includes vault balances, price feed account info (if available),
 * mint decimals, and historical data.
 */
export async function fetchSupportedTokensPublicData(
    connection: Connection,
    programId: PublicKey,
    // Already fetched PoolConfig, we only need its supportedTokens array
    supportedTokensFromConfig: SupportedToken[], 
    rateLimitedFetch: RateLimitedFetchFn
): Promise<SupportedTokensPublicDataResult> {
    const initialDynamicData = new Map<string, Pick<DynamicTokenData, 'vaultBalance' | 'priceFeedInfo' | 'decimals' | 'userBalance'> >();
    const initialHistoricalData = new Map<string, HistoricalTokenDataDecoded | null>();
    const processingErrorAccumulator: string[] = [];

    try {
        const publicAddressesToFetch: PublicKey[] = [];
        const tokenInfoMap = new Map<string, Partial<TokenProcessingInfoInternal>>();

        // 1. Get all mint decimals first
        const allConfiguredMints = supportedTokensFromConfig
            .map(st => st.mint)
            .filter((mint): mint is PublicKey => mint !== null);

        const mintInfoPromises = allConfiguredMints.map((mint: PublicKey) => 
            rateLimitedFetch(
                () => getMint(connection, mint),
                `Failed to get mint info for ${mint.toBase58()}`
            ).catch(err => {
                console.warn(`fetchSupportedTokensPublicData: Failed to get mint info for ${mint.toBase58()}: ${err.message}`);
                processingErrorAccumulator.push(`Mint info fetch failed for ${mint.toBase58()}`);
                return null;
            })
        );
        const mintInfos = await Promise.all(mintInfoPromises);
        const decimalsMap = new Map<string, number>();
        mintInfos.forEach((mintInfo, index) => {
            if (mintInfo) {
                decimalsMap.set(allConfiguredMints[index].toBase58(), mintInfo.decimals);
            }
        });

        // 2. Prepare addresses to fetch
        supportedTokensFromConfig.forEach(supportedToken => {
            const mint = supportedToken.mint;
            if (!mint) {
                console.warn("fetchSupportedTokensPublicData: Skipping token in config with null mint address.");
                processingErrorAccumulator.push("Skipped token with null mint");
                return;
            }
            const mintAddress = mint.toBase58();
            const priceFeedAddress = supportedToken.priceFeed;
            const vault = supportedToken.vault;
            const decimals = decimalsMap.get(mintAddress);

            if (!vault) {
                console.error(`fetchSupportedTokensPublicData: Vault address missing for mint ${mintAddress}.`);
                processingErrorAccumulator.push(`Vault missing for ${mintAddress}`);
                return;
            }
            if (typeof decimals !== 'number') {
                console.warn(`fetchSupportedTokensPublicData: Decimals not found for ${mintAddress}.`);
                processingErrorAccumulator.push(`Decimals missing for ${mintAddress}`);
                return;
            }

            const currentVaultIndex = publicAddressesToFetch.length;
            publicAddressesToFetch.push(vault);

            let currentPriceFeedIndex: number | undefined = undefined;
            if (priceFeedAddress && !priceFeedAddress.equals(SystemProgram.programId)) {
                currentPriceFeedIndex = publicAddressesToFetch.length;
                publicAddressesToFetch.push(priceFeedAddress);
            } else {
                // console.warn(`fetchSupportedTokensPublicData: Price feed missing or system program ID for mint ${mintAddress}.`);
            }

            const historyPda = findHistoricalTokenDataPDA(mint, programId);
            const currentHistoryPdaIndex = publicAddressesToFetch.length;
            publicAddressesToFetch.push(historyPda);

            tokenInfoMap.set(mintAddress, {
                mint: mint,
                vault: vault,
                priceFeed: priceFeedAddress ?? SystemProgram.programId,
                vaultIndex: currentVaultIndex,
                priceFeedIndex: currentPriceFeedIndex,
                historyPdaIndex: currentHistoryPdaIndex,
                mintDecimals: decimals,
            });
        });

        // 3. Batch fetch all public accounts
        const ACCOUNTS_BATCH_SIZE = 99;
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

        const resultsFromBatches = await Promise.all(batchPromises);
        resultsFromBatches.forEach(batchResult => {
            if (batchResult) {
                allFetchedAccountsInfo = allFetchedAccountsInfo.concat(batchResult);
            }
        });

        // 4. Process fetched accounts
        supportedTokensFromConfig.forEach(supportedToken => {
            const mint = supportedToken.mint;
            if (!mint) return;
            const mintAddress = mint.toBase58();
            const info = tokenInfoMap.get(mintAddress) as TokenProcessingInfoInternal | undefined; // Cast as we expect it to be full if present

            if (!info || info.vaultIndex === undefined || info.mintDecimals === undefined || info.historyPdaIndex === undefined) {
                // Error already logged or handled for missing decimals/vault, so just ensure we don't crash
                if (!processingErrorAccumulator.some(e => e.includes(mintAddress))) {
                     processingErrorAccumulator.push(`Skipping processing for ${mintAddress}, info/indices/decimals/history incomplete.`);
                }
                return;
            }

            const vaultInfo = allFetchedAccountsInfo[info.vaultIndex];
            const priceFeedInfoAcc = info.priceFeedIndex !== undefined ? allFetchedAccountsInfo[info.priceFeedIndex] : null;
            const historyInfo = allFetchedAccountsInfo[info.historyPdaIndex];

            initialDynamicData.set(mintAddress, {
                vaultBalance: vaultInfo ? decodeTokenAccountAmountBN(vaultInfo.data) : null,
                priceFeedInfo: priceFeedInfoAcc,
                decimals: info.mintDecimals,
                userBalance: null // User balance will be filled later by a separate fetch
            });

            const decodedHistory = decodeHistoricalTokenData(historyInfo);
            if (decodedHistory) {
                initialHistoricalData.set(mintAddress, decodedHistory);
            } else {
                // console.warn(`fetchSupportedTokensPublicData: Failed to decode HistoricalTokenData for ${mintAddress}`);
                initialHistoricalData.set(mintAddress, null);
                // Optionally add to processingErrorAccumulator if this is critical
            }
        });

        return {
            dynamicData: initialDynamicData,
            historicalData: initialHistoricalData,
            error: processingErrorAccumulator.length > 0 ? processingErrorAccumulator.join('; ') : undefined,
        };

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("fetchSupportedTokensPublicData Error:", errorMessage);
        return {
            dynamicData: initialDynamicData, // Return whatever was processed so far
            historicalData: initialHistoricalData,
            error: `Failed to load supported tokens public data: ${errorMessage}. Partial errors: ${processingErrorAccumulator.join('; ')}`,
        };
    }
}
