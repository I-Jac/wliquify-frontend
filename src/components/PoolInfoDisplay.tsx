'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { PublicKey, SystemProgram, AccountInfo, Connection } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useAnchorProgram } from '@/hooks/useAnchorProgram';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
    POOL_AUTHORITY_SEED,
    USD_SCALE,
} from '@/utils/constants';
import { Buffer } from 'buffer';
import { getAssociatedTokenAddressSync, getMint, MintLayout, AccountLayout } from '@solana/spl-token';
import {
    calculateTotalPoolValue,
    calculateWLqiValue,
    decodePriceData,
    ProcessedTokenData,
    formatScaledBnToDollarString,
    formatRawAmountString,
} from '@/utils/calculations';
import { TokenTable } from './TokenTable';
import { PoolConfig } from '@/types';
import { usePoolInteractions } from '@/hooks/usePoolInteractions';
import { findPoolConfigPDA } from '@/utils/pda';
import { SkeletonBlock } from './SkeletonBlock';
import { SkeletonTokenTable } from './SkeletonTokenTable';

// Define BASE_FEE_BPS locally if not exported
const BASE_FEE_BPS = 10;

// --- Interfaces --- (Assume these match expectations)
interface TokenInfoDecoded {
    symbol: string;
    dominance: string;
    address: string;
    priceFeedId: string;
}
interface AggregatedOracleDataDecoded {
    authority: string;
    totalTokens: number;
    data: TokenInfoDecoded[];
}
interface DynamicTokenData {
    vaultBalance: BN | null;
    priceFeedInfo: AccountInfo<Buffer> | null;
    decimals: number | null;
    userBalance: BN | null;
}

// ADD Interface for token processing info
interface TokenProcessingInfo {
    mint: PublicKey;
    vault: PublicKey;
    priceFeed: PublicKey;
    userAta?: PublicKey; // Optional user ATA
    vaultIndex: number;
    priceFeedIndex: number;
    userAtaIndex?: number; // Optional user ATA index
    mintDecimals: number;
}

// Helper
function bytesToString(bytes: Uint8Array | number[]): string {
    const buffer = Buffer.from(bytes);
    const firstNull = buffer.indexOf(0);
    return new TextDecoder("utf-8").decode(firstNull === -1 ? buffer : buffer.subarray(0, firstNull));
}

// Assuming GRT mint address - PLEASE VERIFY
const GRT_MINT_ADDRESS = "8u9cpEydfP4yF1uX37Qj1DQ3kT1tC9q3j7hNkqFQGRqR";
const KNOWN_SYMBOLS: Record<string, string> = {
    [GRT_MINT_ADDRESS]: 'GRT'
};
const DEFAULT_ICON = '/tokens/btc.png'; // Define default icon path

export const PoolInfoDisplay = () => {
    const { program, provider, readOnlyProvider } = useAnchorProgram();
    const { connection } = useConnection();
    const wallet = useWallet();
    const [poolConfig, setPoolConfig] = useState<PoolConfig | null>(null);
    const [poolConfigPda, setPoolConfigPda] = useState<PublicKey | null>(null);
    const [oracleData, setOracleData] = useState<AggregatedOracleDataDecoded | null>(null);
    const [dynamicData, setDynamicData] = useState<Map<string, DynamicTokenData>>(new Map());
    const [wLqiSupply, setWlqiSupply] = useState<string | null>(null);
    const [isLoadingPublicData, setIsLoadingPublicData] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processedTokenData, setProcessedTokenData] = useState<ProcessedTokenData[] | null>(null);
    const [totalPoolValueScaled, setTotalPoolValueScaled] = useState<BN | null>(null);
    const [wLqiValueScaled, setWlqiValueScaled] = useState<BN | null>(null);
    const [wLqiDecimals, setWlqiDecimals] = useState<number | null>(null);
    const [userWlqiBalance, setUserWlqiBalance] = useState<BN | null>(null);
    const [userTokenBalances, setUserTokenBalances] = useState<Map<string, BN | null>>(new Map());
    const [depositAmounts, setDepositAmounts] = useState<Record<string, string>>({});
    const [withdrawAmounts, setWithdrawAmounts] = useState<Record<string, string>>({});
    const hasFetchedUserData = useRef(false);
    const hasFetchedPublicData = useRef(false);

    // --- Callback to handle amount input changes ---
    const handleAmountChange = useCallback((mintAddress: string, action: 'deposit' | 'withdraw', amount: string) => {
        if (action === 'deposit') {
            setDepositAmounts(prev => ({ ...prev, [mintAddress]: amount }));
        } else {
            setWithdrawAmounts(prev => ({ ...prev, [mintAddress]: amount }));
        }
    }, []);

    // --- ADD: Function to clear specific input amount ---
    const handleClearInput = useCallback((mintAddress: string, action: 'deposit' | 'withdraw') => {
        console.log(`Clearing input for ${action} on ${mintAddress}`);
        if (action === 'deposit') {
            setDepositAmounts(prev => ({ ...prev, [mintAddress]: '' }));
        } else {
            setWithdrawAmounts(prev => ({ ...prev, [mintAddress]: '' }));
        }
    }, []);

    // --- ADD: Function to refresh user balances --- 
    const refreshUserBalances = useCallback(async (affectedMintAddress?: string) => {
        if (!wallet.publicKey || !connection || !poolConfig?.wliMint) {
            console.log("Refresh skipped: Wallet not connected or pool config not loaded.");
            return;
        }
        console.log(`Refreshing user balances... Affected: ${affectedMintAddress ?? 'None (wLQI only)'}`);
        const userPublicKey = wallet.publicKey;
        const addressesToFetch: PublicKey[] = [];
        const tokenAddressesToUpdate: string[] = [];

        // 1. Always add user's wLQI ATA
        const userWlqiAta = getAssociatedTokenAddressSync(poolConfig.wliMint, userPublicKey, true);
        addressesToFetch.push(userWlqiAta);

        // 2. Add affected token's ATA if provided
        let affectedTokenAta: PublicKey | null = null;
        if (affectedMintAddress) {
            try {
                affectedTokenAta = getAssociatedTokenAddressSync(new PublicKey(affectedMintAddress), userPublicKey, true);
                addressesToFetch.push(affectedTokenAta);
                tokenAddressesToUpdate.push(affectedMintAddress);
            } catch (e) {
                console.error(`Error deriving ATA for affected mint ${affectedMintAddress}:`, e);
            }
        }

        try {
            const accountsInfo = await connection.getMultipleAccountsInfo(addressesToFetch);

            // Process wLQI Balance
            const userWlqiInfo = accountsInfo[0];
            const newWlqiBalance = userWlqiInfo ? decodeTokenAccountAmountBN(userWlqiInfo.data) : new BN(0);
            setUserWlqiBalance(newWlqiBalance);

            // Process Affected Token Balance
            if (affectedMintAddress && affectedTokenAta && accountsInfo.length > 1) {
                const affectedTokenInfo = accountsInfo[1];
                const newTokenBalance = affectedTokenInfo ? decodeTokenAccountAmountBN(affectedTokenInfo.data) : new BN(0);
                setUserTokenBalances(prevMap => {
                    const newMap = new Map(prevMap);
                    newMap.set(affectedMintAddress, newTokenBalance);
                    return newMap;
                });
            }
        } catch (error) {
            console.error("Error refreshing user balances:", error);
        }

    }, [wallet.publicKey, connection, poolConfig, setUserWlqiBalance, setUserTokenBalances]);

    // Pass correct props to usePoolInteractions, including the new callback
    const {
        handleDeposit: actualHandleDeposit,
        handleWithdraw: actualHandleWithdraw,
        isDepositing,
        isWithdrawing
    } = usePoolInteractions({ 
        program,
        poolConfig,
        poolConfigPda,
        oracleData,
        onTransactionSuccess: refreshUserBalances,
        onClearInput: handleClearInput
    });

    // Make disabled handlers async
    const disabledDeposit = useCallback(async () => { alert('Pool data loading...'); }, []);
    const disabledWithdraw = useCallback(async () => { alert('Pool data loading...'); }, []);
    const interactionsReady = !!program && !!wallet.publicKey && !!poolConfig && !!poolConfigPda && !!oracleData;

    // --- Decoding Helpers ---
    const decodeTokenAccountAmountBN = (buffer: Buffer): BN => {
        try { return new BN(AccountLayout.decode(buffer).amount.toString()); }
        catch (e) { 
             const errorMessage = e instanceof Error ? e.message : String(e);
             console.error("Decode Account BN Error:", errorMessage); 
             return new BN(0); 
        }
    };
    const decodeMintAccountSupplyString = (buffer: Buffer): string => {
        try { return MintLayout.decode(buffer).supply.toString(); }
        catch (e) { 
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error("Decode Mint String Error:", errorMessage); 
            return '0'; 
        }
    };

    // --- Fetch Public Pool Data ---
    const fetchPublicPoolData = useCallback(async () => {
        const activeProvider = provider || readOnlyProvider;
        if (!program || !activeProvider || !connection) {
            console.warn("Fetch public data skipped: Program or Provider/Connection not ready.");
            return;
        }
        setIsLoadingPublicData(true);
        setError(null);
        setPoolConfig(null);
        setOracleData(null);
        setWlqiSupply(null);
        setWlqiDecimals(null);
        setDynamicData(new Map());
        hasFetchedPublicData.current = false;

        let fetchedConfig: PoolConfig | null = null;

        try {
            if (!program) {
                 setError("Program not loaded, cannot fetch config.");
                 setIsLoadingPublicData(false);
                 return;
            }
            const programId = program.programId;
            const configPda = findPoolConfigPDA(programId);
            setPoolConfigPda(configPda);
            fetchedConfig = await program.account.poolConfig.fetch(configPda) as PoolConfig;
            setPoolConfig(fetchedConfig);
            console.log("Fetched Pool Config:", fetchedConfig);

            const oracleAggregatorAddress = fetchedConfig.oracleAggregatorAccount;
            if (!oracleAggregatorAddress || oracleAggregatorAddress.equals(SystemProgram.programId)) throw new Error("Oracle Aggregator not set.");
            const oracleAccountInfo = await connection.getAccountInfo(oracleAggregatorAddress);
            if (!oracleAccountInfo) throw new Error("Oracle Aggregator not found.");
            const oracleDataBuffer = Buffer.from(oracleAccountInfo.data.slice(8));
            let offset = 0;
            const authorityPubkey = new PublicKey(oracleDataBuffer.subarray(offset, offset + 32)); offset += 32;
            const totalTokens = oracleDataBuffer.readUInt32LE(offset); offset += 4;
            const vecLen = oracleDataBuffer.readUInt32LE(offset); offset += 4;
            const tokenInfoSize = 10 + 8 + 64 + 64;
            const decodedTokens: TokenInfoDecoded[] = [];
            for (let i = 0; i < vecLen; i++) {
                const start = offset;
                const end = start + tokenInfoSize;
                if (end > oracleDataBuffer.length) throw new Error(`Oracle buffer overflow reading token ${i + 1}.`);
                const tokenSlice = oracleDataBuffer.subarray(start, end);
                decodedTokens.push({
                    symbol: bytesToString(tokenSlice.subarray(0, 10)),
                    dominance: new BN(tokenSlice.subarray(10, 18), 'le').toString(),
                    address: bytesToString(tokenSlice.subarray(18, 18 + 64)),
                    priceFeedId: bytesToString(tokenSlice.subarray(18 + 64, end))
                });
                offset = end;
            }
            const decodedOracleData = {
                authority: authorityPubkey.toBase58(),
                totalTokens: totalTokens,
                data: decodedTokens
            };
            setOracleData(decodedOracleData);

            const fetchedWlqiSupply = (await connection.getTokenSupply(fetchedConfig.wliMint)).value.amount;
            const fetchedWlqiDecimals = (await getMint(connection, fetchedConfig.wliMint)).decimals;
            setWlqiSupply(fetchedWlqiSupply);
            setWlqiDecimals(fetchedWlqiDecimals);

            const [poolAuthorityPda] = PublicKey.findProgramAddressSync([POOL_AUTHORITY_SEED], program.programId);
            const publicAddressesToFetch: PublicKey[] = [];
            const tokenInfoMap = new Map<string, Partial<TokenProcessingInfo>>();

             const mintPubkeys = decodedOracleData.data.map(token => new PublicKey(token.address));
             const mintInfoPromises = mintPubkeys.map(mint => getMint(connection, mint));
             const mintInfos = await Promise.all(mintInfoPromises);
             const decimalsMap = new Map<string, number>();
             mintInfos.forEach((mintInfo, index) => {
                 decimalsMap.set(mintPubkeys[index].toBase58(), mintInfo.decimals);
             });

            decodedOracleData.data.forEach(token => {
                try {
                    const mint = new PublicKey(token.address);
                    const vault = getAssociatedTokenAddressSync(mint, poolAuthorityPda, true);
                    const priceFeed = new PublicKey(token.priceFeedId);
                    const decimals = decimalsMap.get(mint.toBase58());
                    if (typeof decimals !== 'number') throw new Error(`Decimals missing for ${token.symbol}`);

                    publicAddressesToFetch.push(vault, priceFeed);
                    tokenInfoMap.set(token.address, {
                        mint: mint,
                        vault: vault,
                        priceFeed: priceFeed,
                        vaultIndex: publicAddressesToFetch.length - 2,
                        priceFeedIndex: publicAddressesToFetch.length - 1,
                        mintDecimals: decimals,
                        userAta: undefined,
                        userAtaIndex: undefined
                    });
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    console.error(`Error preparing public fetch for token ${token.symbol}:`, errorMessage);
                }
            });

            const publicAccountsInfo = await connection.getMultipleAccountsInfo(publicAddressesToFetch);

            const initialDynamicData = new Map<string, DynamicTokenData>();
            let processingError = false;
            decodedOracleData.data.forEach(token => {
                const info = tokenInfoMap.get(token.address);
                if (!info || info.vaultIndex === undefined || info.priceFeedIndex === undefined || info.mintDecimals === undefined) {
                    console.warn(`Skipping processing public data for ${token.symbol}, info incomplete.`);
                    processingError = true;
                    return;
                }
                const vaultInfo = publicAccountsInfo[info.vaultIndex];
                const priceFeedInfo = publicAccountsInfo[info.priceFeedIndex];

                initialDynamicData.set(token.address, {
                    vaultBalance: vaultInfo ? decodeTokenAccountAmountBN(vaultInfo.data) : null,
                    priceFeedInfo: priceFeedInfo,
                    decimals: info.mintDecimals,
                    userBalance: null
                });
            });

            setDynamicData(initialDynamicData);
            if (processingError) {
                 setError("Errors occurred processing some public token data.");
            }

            hasFetchedPublicData.current = true;

        } catch (err) { 
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("Error fetching public pool data:", errorMessage);
            setError(`Failed to load public pool data: ${errorMessage}`);
            setPoolConfig(null);
            setOracleData(null);
            setWlqiSupply(null);
            setWlqiDecimals(null);
            setDynamicData(new Map());
        } finally {
            setIsLoadingPublicData(false);
        }
    }, [program, provider, readOnlyProvider, connection]);

    // --- Fetch User Account Data ---
    const fetchUserAccountData = useCallback(async () => {
        if (!wallet.connected || !wallet.publicKey || !connection || !poolConfig) {
            console.log("Skipping user data fetch: Wallet not connected or public data not ready.");
             setUserWlqiBalance(null);
              setUserTokenBalances(new Map()); 
             setDynamicData(prevMap => {
                 const newMap = new Map(prevMap);
                 newMap.forEach(data => { data.userBalance = null; });
                 return newMap;
             });
            return;
        }

        console.log("Fetching user account data...");
        const userPublicKey = wallet.publicKey;
        const userAddressesToFetch: PublicKey[] = [];
        const tokenMintMapForUserFetch = new Map<string, PublicKey>();

        try {
            const userWlqiAta = getAssociatedTokenAddressSync(poolConfig.wliMint, userPublicKey, true);
            userAddressesToFetch.push(userWlqiAta);

            poolConfig.supportedTokens.forEach(tokenConfig => {
                try {
                    const mint = tokenConfig.mint;
                    if (mint && !mint.equals(poolConfig.wliMint)) {
                         const userAta = getAssociatedTokenAddressSync(mint, userPublicKey, true);
                         userAddressesToFetch.push(userAta);
                         tokenMintMapForUserFetch.set((userAddressesToFetch.length - 1).toString(), mint);
                    } else if (!mint) {
                         console.warn("Skipping user ATA derivation: Token config has null mint.");
                    }
                 } catch (e) { 
                     const errorMessage = e instanceof Error ? e.message : String(e);
                     console.error(`Error deriving user ATA for mint ${tokenConfig.mint?.toBase58() ?? 'unknown'}:`, errorMessage);
                 }
            });

            const userAccountsInfo = await connection.getMultipleAccountsInfo(userAddressesToFetch);

            const userWlqiInfo = userAccountsInfo[0];
            const newWlqiBalance = userWlqiInfo ? decodeTokenAccountAmountBN(userWlqiInfo.data) : new BN(0);
            setUserWlqiBalance(newWlqiBalance);

            const newUserTokenBalancesMap = new Map<string, BN | null>();
            userAccountsInfo.slice(1).forEach((accInfo, index) => {
                const mapKey = (index + 1).toString();
                const mint = tokenMintMapForUserFetch.get(mapKey);
                
                if (mint) {
                    const mintAddressStr = mint.toBase58();
                    const newUserBalance = accInfo ? decodeTokenAccountAmountBN(accInfo.data) : new BN(0);
                    newUserTokenBalancesMap.set(mintAddressStr, newUserBalance);
                } else {
                     console.warn(`[fetchUserAccountData] Could not find mint in map for key ${mapKey}.`);
                }
            });
            setUserTokenBalances(newUserTokenBalancesMap);

            hasFetchedUserData.current = true;
            console.log("[fetchUserAccountData] Set hasFetchedUserData flag to true.");

        } catch (err) { 
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("Error fetching user account data:", errorMessage);
            setUserWlqiBalance(null);
            setUserTokenBalances(new Map());
        } 
    }, [wallet.connected, wallet.publicKey, connection, poolConfig]); 

    // --- Effect to Calculate Derived Values (TVL, wLQI Price, Processed Token Data) ---
    useEffect(() => {
        if (!dynamicData || dynamicData.size === 0 || !oracleData || !wLqiSupply || wLqiDecimals === null || !poolConfig) {
            setProcessedTokenData(null);
            setTotalPoolValueScaled(null);
            setWlqiValueScaled(null);
            return;
        }

        console.log("Calculating derived values with icons...");
        try {
            let calculatedTvl = new BN(0);
            const oracleTokenMap = new Map<string, TokenInfoDecoded>(oracleData.data.map(info => [info.address, info]));
            const DOMINANCE_SCALE_FACTOR_BN = new BN(10).pow(new BN(10));
            const USD_SCALE_FACTOR_BN = new BN(10).pow(new BN(USD_SCALE));

            const intermediateData = Array.from(dynamicData.entries()).map(([mintAddress, data]) => {
                const tokenConfig = poolConfig.supportedTokens.find(st => st.mint?.toBase58() === mintAddress);
                const oracleInfo = oracleTokenMap.get(mintAddress);

                if (!data.vaultBalance || !data.priceFeedInfo || data.decimals === null || !tokenConfig || !tokenConfig.mint || !tokenConfig.vault || !tokenConfig.priceFeed) {
                    return null;
                }

                const priceData = decodePriceData(data.priceFeedInfo);
                if (!priceData) {
                    return null;
                }

                const tokenValueScaled = data.vaultBalance
                    .mul(priceData.price)
                    .mul(USD_SCALE_FACTOR_BN)
                    .div(new BN(10).pow(new BN(data.decimals - priceData.expo)));

                 calculatedTvl = calculatedTvl.add(tokenValueScaled);

                return {
                    mintAddress,
                    data,
                    tokenConfig,
                    oracleInfo,
                    priceData,
                    tokenValueScaled,
                };
            }).filter(item => item !== null);

            const calculatedWlqiValue = calculateWLqiValue(calculatedTvl, wLqiSupply, wLqiDecimals);
            setWlqiValueScaled(calculatedWlqiValue);
            setTotalPoolValueScaled(calculatedTvl);

            const newProcessedData = intermediateData.map((item): ProcessedTokenData | null => {
                 const { mintAddress, data, tokenConfig, oracleInfo, priceData, tokenValueScaled } = item!;

                const isDelisted = !oracleInfo;
                const targetDominanceBN = isDelisted ? new BN(0) : new BN(oracleInfo!.dominance);
                const targetDominancePercent = isDelisted ? 0 : targetDominanceBN.mul(new BN(100)).div(DOMINANCE_SCALE_FACTOR_BN).toNumber();

                const actualDominancePercent = calculatedTvl.isZero()
                    ? 0
                    : tokenValueScaled.mul(new BN(100 * 10000)).div(calculatedTvl).toNumber() / 10000;

                const depositFeeOrBonusBps = isDelisted ? null : BASE_FEE_BPS;
                const withdrawFeeOrBonusBps = isDelisted ? -500 : BASE_FEE_BPS;

                let symbol: string;
                const knownSymbol = KNOWN_SYMBOLS[mintAddress];
                if (knownSymbol) {
                    symbol = knownSymbol;
                } else if (oracleInfo?.symbol && oracleInfo.symbol.length > 0 && oracleInfo.symbol.length <= 10 && !oracleInfo.symbol.includes('\0')) {
                    symbol = oracleInfo.symbol;
                } else {
                    symbol = mintAddress.substring(0, 4) + '...';
                }

                 let icon = DEFAULT_ICON;
                 if (!symbol.includes('...')) {
                     icon = `/tokens/${symbol.toLowerCase()}.png`;
                 }

                return {
                    mintAddress,
                    symbol: symbol,
                    icon: icon,
                    poolValueUSD: formatScaledBnToDollarString(tokenValueScaled, USD_SCALE),
                    actualDominancePercent: actualDominancePercent,
                    targetDominance: targetDominanceBN,
                    targetDominancePercent: targetDominancePercent,
                    targetDominanceDisplay: isDelisted ? "0%" : `${targetDominancePercent.toFixed(4)}%`,
                    decimals: data.decimals!,
                    isDelisted: isDelisted,
                    depositFeeOrBonusBps: depositFeeOrBonusBps,
                    withdrawFeeOrBonusBps: withdrawFeeOrBonusBps,
                    priceFeedId: tokenConfig!.priceFeed.toBase58(),
                    vaultBalance: data.vaultBalance!,
                    priceData: priceData!,
                    userBalance: userTokenBalances.get(mintAddress) ?? null,
                };
            }).filter((data): data is ProcessedTokenData => data !== null);

            setProcessedTokenData(newProcessedData);
            console.log("Processed Token Data (with icons):", newProcessedData);

        } catch (e) {
            console.error("Error calculating derived values:", e);
            setError("Failed to process pool data.");
            setProcessedTokenData(null);
            setTotalPoolValueScaled(null);
            setWlqiValueScaled(null);
        }

    }, [dynamicData, oracleData, wLqiSupply, wLqiDecimals, poolConfig, userTokenBalances]);

    // --- Setup WebSocket Subscriptions ---
    useEffect(() => {
        if (!connection || !poolConfig || !program || isLoadingPublicData) return;
        let active = true;
        const currentSubscriptionIds: number[] = [];

        try {
            const wLqiSubId = connection.onAccountChange(
                poolConfig.wliMint, 
                (accountInfo) => {
                    if (!active) return;
                    console.log("WS: wLQI Update");
                    setWlqiSupply(decodeMintAccountSupplyString(accountInfo.data));
                },
                "confirmed"
            );
            currentSubscriptionIds.push(wLqiSubId);
        } catch (error) { console.error("wLQI Sub Error:", error); }

        poolConfig.supportedTokens.forEach(token => {
            if (!token.vault) return;
            try {
                const vaultSubId = connection.onAccountChange(
                    token.vault,
                    (accountInfo) => {
                         if (!active) return;
                         const newBalanceBN = decodeTokenAccountAmountBN(accountInfo.data);
                         console.log(`WS: Vault ${token.mint?.toBase58()} Update: ${newBalanceBN.toString()}`);
                         if (token.mint) { 
                             setDynamicData(prevMap => {
                                 const newMap = new Map(prevMap);
                                 const existingData = newMap.get(token.mint!.toBase58());
                                 if (existingData) {
                                     newMap.set(token.mint!.toBase58(), { ...existingData, vaultBalance: newBalanceBN });
                                 }
                                 return newMap;
                             });
                         } else {
                             console.warn("WS: Vault update received for token with null mint address.");
                         }
                     },
                    "confirmed"
                );
                currentSubscriptionIds.push(vaultSubId);
            } catch (error) { console.error(`Vault Sub Error (${token.mint?.toBase58()}):`, error); }
        });

        return () => {
            active = false;
            console.log("Cleaning up WS subs:", currentSubscriptionIds);
            currentSubscriptionIds.forEach(id => connection.removeAccountChangeListener(id));
        };

    }, [connection, poolConfig, program, isLoadingPublicData]);

    useEffect(() => {
        const activeProvider = provider || readOnlyProvider;
        if (program && activeProvider && connection && !hasFetchedPublicData.current) {
             fetchPublicPoolData();
        }
    }, [program, provider, readOnlyProvider, connection, fetchPublicPoolData]); 

    useEffect(() => {
        if (wallet.connected && wallet.publicKey && poolConfig && !hasFetchedUserData.current) {
            console.log("Wallet connected and public data ready, fetching user data (first time)...", { hasFetched: hasFetchedUserData.current });
            fetchUserAccountData();
        } 
    }, [wallet.connected, wallet.publicKey, connection, poolConfig]); 

    useEffect(() => {
        if (!wallet.connected) {
            console.log("Wallet disconnected, resetting user data fetch flag and balances.");
            hasFetchedUserData.current = false;
             setUserWlqiBalance(null);
             setUserTokenBalances(new Map());
        }
    }, [wallet.connected]);

    const tableData = useMemo((): ProcessedTokenData[] => {
        if (!processedTokenData) return [];
        return processedTokenData.map(token => ({
            ...token,
            userBalance: userTokenBalances.get(token.mintAddress) ?? null,
        }));
    }, [processedTokenData, userTokenBalances]);

    const openFaucet = () => {
        window.open('https://i-jac.github.io/faucet-frontend/', '_blank', 'noopener,noreferrer');
    };

    useEffect(() => {
        if (!connection || !wallet.publicKey || !poolConfig || !poolConfig.wliMint) {
            console.log("WS: Skipping subscriptions (missing connection, user, poolConfig, or wLqiMint)");
            return;
        }

        console.log("WS: Setting up account subscriptions for user:", wallet.publicKey.toBase58());
        const subscriptionIds: number[] = [];

        const handleAccountUpdate = (accountInfo: AccountInfo<Buffer>, context: { slot: number }, mintAddress: string) => {
            try {
                const newBalance = decodeTokenAccountAmountBN(accountInfo.data);
                setUserTokenBalances(prevMap => {
                    const newMap = new Map(prevMap);
                    if (!prevMap.get(mintAddress)?.eq(newBalance)) {
                        newMap.set(mintAddress, newBalance);
                        return newMap;
                    }
                    return prevMap;
                });
            } catch (error) {
                console.error(`WS: Error processing account update for ${mintAddress}:`, error);
            }
        };

        poolConfig.supportedTokens.forEach(token => {
            try {
                const mintKey = token.mint;
                if (!mintKey) {
                    console.warn("WS: Skipping subscription for token with null mint address.");
                    return;
                }
                const userAta = getAssociatedTokenAddressSync(mintKey, wallet.publicKey);

                const subId = connection.onAccountChange(
                    userAta,
                    (accountInfo, context) => handleAccountUpdate(accountInfo, context, mintKey.toBase58()),
                    'confirmed'
                );
                subscriptionIds.push(subId);
            } catch (error) {
                console.error(`WS: Failed to get ATA or subscribe for token ${token.mint?.toBase58()}:`, error);
            }
        });

        try {
            const wLqiMintKey = poolConfig.wliMint;
            if (!wLqiMintKey) {
                console.error("WS: Cannot subscribe to wLQI, mint address is null in config.");
            } else {
                const userWlqiAta = getAssociatedTokenAddressSync(wLqiMintKey, wallet.publicKey);
                const wLqiSubId = connection.onAccountChange(
                    userWlqiAta,
                    (accountInfo, context) => handleAccountUpdate(accountInfo, context, wLqiMintKey.toBase58()),
                    'confirmed'
                );
                subscriptionIds.push(wLqiSubId);
            }
        } catch (error) {
             console.error(`WS: Failed to get ATA or subscribe for wLQI (${poolConfig.wliMint?.toBase58()}):`, error);
        }

        return () => {
            console.log("WS: Cleaning up account subscriptions...");
            subscriptionIds.forEach(id => {
                connection.removeAccountChangeListener(id)
                    .catch(err => console.error(`WS: Error unsubscribing ID ${id}:`, err));
            });
        };

    }, [connection, wallet.publicKey, poolConfig, setUserTokenBalances]); 

    if (isLoadingPublicData) {
        return (
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-md max-w-4xl mx-auto mt-10 font-[family-name:var(--font-geist-mono)] relative">
                <h2 className="text-2xl font-bold mb-4 text-center border-b border-gray-600 pb-2">
                     Pool Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mb-6 bg-gray-700 p-4 rounded">
                    <div><SkeletonBlock className="h-6 w-3/4 mx-auto mb-1" /> <SkeletonBlock className="h-6 w-1/2 mx-auto" /></div>
                    <div><SkeletonBlock className="h-6 w-3/4 mx-auto mb-1" /> <SkeletonBlock className="h-6 w-1/2 mx-auto" /></div>
                    <div><SkeletonBlock className="h-6 w-3/4 mx-auto mb-1" /> <SkeletonBlock className="h-6 w-1/2 mx-auto" /></div>
                </div>
                <div className="mt-6 border-t border-gray-600 pt-4">
                     <h3 className="text-lg font-semibold text-center text-yellow-400 mb-3">
                         Token Details & Interactions
                     </h3>
                    <SkeletonTokenTable rowCount={5} />
                </div>
            </div>
        );
    }
    if (error) return <div className="text-center p-4 text-red-500">Error: {error}</div>;
    if (processedTokenData === null) return <div className="text-center p-4">Pool data could not be fully processed.</div>;

    const formattedWlqiSupply = formatRawAmountString(wLqiSupply, wLqiDecimals, true, 2);
    const formattedWlqiValue = formatScaledBnToDollarString(wLqiValueScaled, USD_SCALE);
    const formattedTvl = formatScaledBnToDollarString(totalPoolValueScaled, USD_SCALE);

    return (
        <div className="bg-gray-800 text-white p-6 rounded-lg shadow-md max-w-4xl mx-auto mt-10 font-[family-name:var(--font-geist-mono)] relative">
            <button 
                onClick={openFaucet}
                className="absolute top-4 left-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm"
            >
                Dev Faucet
            </button>

            <h2 className="text-2xl font-bold mb-4 text-center border-b border-gray-600 pb-2">Pool Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mb-6 bg-gray-700 p-4 rounded">
                <div><h4 className="text-lg font-semibold text-purple-400">wLQI Token Value</h4><p className="text-xl font-bold">{formattedWlqiValue}</p></div>
                <div><h4 className="text-lg font-semibold text-green-400">wLQI Total Supply</h4><p className="text-xl font-bold">{formattedWlqiSupply}</p></div>
                <div><h4 className="text-lg font-semibold text-yellow-400">Total Pool Value (TVL)</h4><p className="text-xl font-bold">{formattedTvl}</p></div>
            </div>
            <div className="mt-6 border-t border-gray-600 pt-4">
                <h3 className="text-lg font-semibold text-center text-yellow-400 mb-3">Token Details & Interactions</h3>
                 {tableData.length > 0 ? (
                     <TokenTable
                         tokenData={tableData}
                         totalPoolValueScaled={totalPoolValueScaled}
                         wLqiValueScaled={wLqiValueScaled}
                         wLqiDecimals={wLqiDecimals}
                         userWlqiBalance={userWlqiBalance}
                         onDeposit={interactionsReady ? actualHandleDeposit : disabledDeposit}
                         onWithdraw={interactionsReady ? (mint, amount) => actualHandleWithdraw(mint, amount) : disabledWithdraw}
                         isDepositing={isDepositing}
                         isWithdrawing={isWithdrawing}
                         depositAmounts={depositAmounts}
                         withdrawAmounts={withdrawAmounts}
                         handleAmountChange={handleAmountChange}
                     />
                 ) : (
                     <div className="text-center text-gray-400 italic p-4">No token data found.</div>
                 )}
            </div>
        </div>
    );
};