'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Connection, PublicKey, SystemProgram, AccountInfo } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { useAnchorProgram } from '@/hooks/useAnchorProgram';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
    POOL_CONFIG_SEED,
    POOL_AUTHORITY_SEED,
    USD_SCALE
} from '@/utils/constants';
import { Buffer } from 'buffer';
import { getAssociatedTokenAddressSync, getMint, getAccount, MintLayout, AccountLayout } from '@solana/spl-token';
import {
    calculateTotalPoolValue,
    calculateWLqiValue,
    decodePriceData,
    ProcessedTokenData,
    DecodedPriceData,
    formatScaledBnToDollarString,
    formatRawAmountString,
    calculateTokenValueUsdScaled,
    calculateTotalTargetDominance,
    calculateTargetPercentageScaled,
    calculateActualPercentageScaled
} from '@/utils/calculations';
import { TokenTable } from './TokenTable';
import { PoolConfig } from '@/types';
import { usePoolInteractions } from '@/hooks/usePoolInteractions';
import { findPoolConfigPDA } from '@/utils/pda';

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

// Helper
function bytesToString(bytes: Uint8Array | number[]): string {
    const buffer = Buffer.from(bytes);
    const firstNull = buffer.indexOf(0);
    return new TextDecoder("utf-8").decode(firstNull === -1 ? buffer : buffer.subarray(0, firstNull));
}

export const PoolInfoDisplay = () => {
    const { program, provider } = useAnchorProgram();
    const { connection } = useConnection();
    const wallet = useWallet();
    const [poolConfig, setPoolConfig] = useState<PoolConfig | null>(null);
    const [poolConfigPda, setPoolConfigPda] = useState<PublicKey | null>(null);
    const [oracleData, setOracleData] = useState<AggregatedOracleDataDecoded | null>(null);
    const [dynamicData, setDynamicData] = useState<Map<string, DynamicTokenData>>(new Map());
    const [wLqiSupply, setWlqiSupply] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processedTokenData, setProcessedTokenData] = useState<ProcessedTokenData[] | null>(null);
    const [totalPoolValueScaled, setTotalPoolValueScaled] = useState<BN | null>(null);
    const [wLqiValueScaled, setWlqiValueScaled] = useState<BN | null>(null);
    const [wLqiDecimals, setWlqiDecimals] = useState<number | null>(null);
    const [userWlqiBalance, setUserWlqiBalance] = useState<BN | null>(null);
    const [subscriptionIds, setSubscriptionIds] = useState<number[]>([]);

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
            const userWlqiInfo = accountsInfo[0]; // Always the first one
            const newWlqiBalance = userWlqiInfo ? decodeTokenAccountAmountBN(userWlqiInfo.data) : new BN(0);
            console.log(`  Refreshed wLQI balance: ${newWlqiBalance.toString()}`);
            setUserWlqiBalance(newWlqiBalance);

            // Process Affected Token Balance
            if (affectedMintAddress && affectedTokenAta && accountsInfo.length > 1) {
                const affectedTokenInfo = accountsInfo[1];
                const newTokenBalance = affectedTokenInfo ? decodeTokenAccountAmountBN(affectedTokenInfo.data) : new BN(0);
                console.log(`  Refreshed token ${affectedMintAddress} balance: ${newTokenBalance.toString()}`);
                setDynamicData(prevMap => {
                    const newMap = new Map(prevMap);
                    const existingData = newMap.get(affectedMintAddress);
                    if (existingData) {
                        newMap.set(affectedMintAddress, { ...existingData, userBalance: newTokenBalance });
                        console.log(`  Updated dynamicData for ${affectedMintAddress}`);
                    }
                    return newMap;
                });
            }
        } catch (error) {
            console.error("Error refreshing user balances:", error);
            // Optionally show a toast error here
        }

    }, [wallet.publicKey, connection, poolConfig, setDynamicData, setUserWlqiBalance]);
    // --- END ADD --- 

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
        onTransactionSuccess: refreshUserBalances // Pass the refresh function
    });

    // Make disabled handlers async
    const disabledDeposit = useCallback(async () => { alert('Pool data loading...'); }, []);
    const disabledWithdraw = useCallback(async () => { alert('Pool data loading...'); }, []);
    const interactionsReady = !!program && !!wallet.publicKey && !!poolConfig && !!poolConfigPda && !!oracleData;

    // --- Decoding Helpers ---
    const decodeTokenAccountAmountBN = (buffer: Buffer): BN => {
        try { return new BN(AccountLayout.decode(buffer).amount.toString()); }
        catch (e) { console.error("Decode Account BN Error:", e); return new BN(0); }
    };
    const decodeMintAccountSupplyString = (buffer: Buffer): string => {
        try { return MintLayout.decode(buffer).supply.toString(); }
        catch (e) { console.error("Decode Mint String Error:", e); return '0'; }
    };

    // --- Combined Initial Data Fetch --- 
    const fetchInitialData = useCallback(async () => {
        if (!program || !provider) return;
        setIsLoading(true);
        setError(null);
        console.log("Fetching initial data...");
        let fetchedConfig: PoolConfig | null = null;
        let decodedOracleData: AggregatedOracleDataDecoded | null = null;
        const newDynamicData = new Map<string, DynamicTokenData>();
        let fetchedWlqiSupply: string | null = null;
        let fetchedWlqiDecimals: number | null = null;
        let processingError = false;
        const userPublicKey = wallet.publicKey;
        let userWlqiAtaIndex: number | null = null;

        try {
            // 1. Fetch Config
            const pda = findPoolConfigPDA(program.programId);
            setPoolConfigPda(pda);
            fetchedConfig = await program.account.poolConfig.fetch(pda) as PoolConfig;
            setPoolConfig(fetchedConfig);

            // 2. Fetch Oracle Data & Decode
            const oracleAggregatorAddress = fetchedConfig.oracleAggregatorAccount;
            if (!oracleAggregatorAddress || oracleAggregatorAddress.equals(SystemProgram.programId)) throw new Error("Oracle Aggregator not set.");
            const oracleAccountInfo = await connection.getAccountInfo(oracleAggregatorAddress);
            if (!oracleAccountInfo) throw new Error("Oracle Aggregator not found.");
            // --- Start Oracle Decode --- (Filled in)
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
                // Fill push with actual decoding
                decodedTokens.push({
                    symbol: bytesToString(tokenSlice.subarray(0, 10)),
                    dominance: new BN(tokenSlice.subarray(10, 18), 'le').toString(), // Keep as string 
                    address: bytesToString(tokenSlice.subarray(18, 18 + 64)),
                    priceFeedId: bytesToString(tokenSlice.subarray(18 + 64, end))
                });
                offset = end;
            }
            decodedOracleData = { // Fill object
                authority: authorityPubkey.toBase58(),
                totalTokens: totalTokens,
                data: decodedTokens
            };
            // --- End Oracle Decode ---
            setOracleData(decodedOracleData);

            // 3. Fetch Dynamic Data
            // ... (fetch wLQI supply/decimals) ...
            fetchedWlqiSupply = (await connection.getTokenSupply(fetchedConfig.wliMint)).value.amount;
            fetchedWlqiDecimals = (await getMint(connection, fetchedConfig.wliMint)).decimals;
            setWlqiSupply(fetchedWlqiSupply);
            setWlqiDecimals(fetchedWlqiDecimals);
            
            // ... (prepare addresses to fetch) ...
            const [poolAuthorityPda] = PublicKey.findProgramAddressSync([POOL_AUTHORITY_SEED], program.programId);
            const addressesToFetch: PublicKey[] = [];
            const tokenInfoMap = new Map<string, { mint: PublicKey; vault: PublicKey; userAta?: PublicKey; priceFeed: PublicKey }>();

            if (userPublicKey) {
                const userWlqiAta = getAssociatedTokenAddressSync(fetchedConfig.wliMint, userPublicKey!, true);
                addressesToFetch.push(userWlqiAta);
                userWlqiAtaIndex = addressesToFetch.length - 1;
            } else {
                setUserWlqiBalance(null);
            }

            decodedOracleData.data.forEach(token => {
                try {
                    const mint = new PublicKey(token.address);
                    const vault = getAssociatedTokenAddressSync(mint, poolAuthorityPda, true);
                    const priceFeed = new PublicKey(token.priceFeedId);
                    const info: any = { mint, vault, priceFeed }; 
                    addressesToFetch.push(vault, priceFeed);
                    if (userPublicKey) {
                        const userAta = getAssociatedTokenAddressSync(mint, userPublicKey!, true);
                        info.userAta = userAta;
                        addressesToFetch.push(userAta);
                    }
                    tokenInfoMap.set(token.address, info);
                } catch (e) { processingError = true; console.error(`Error processing token ${token.symbol}:`, e); }
            });

            // ... (fetch accounts) ...
            const accountsInfo = await connection.getMultipleAccountsInfo(addressesToFetch);
            
            if (userPublicKey && userWlqiAtaIndex !== null) {
                const userWlqiInfo = accountsInfo[userWlqiAtaIndex];
                const balance = userWlqiInfo ? decodeTokenAccountAmountBN(userWlqiInfo.data) : new BN(0);
                setUserWlqiBalance(balance);
                console.log(`User wLQI Balance (${userWlqiAtaIndex}): ${balance.toString()}`);
            }

            // ... (process accounts into newDynamicData) ...
            let accountIndex = 0;
            if (userPublicKey && userWlqiAtaIndex !== null) {
                accountIndex++;
            }
            decodedOracleData.data.forEach(token => {
                const info = tokenInfoMap.get(token.address);
                if (!info) return; 
                const vaultInfo = accountsInfo[accountIndex++];
                const priceFeedInfo = accountsInfo[accountIndex++];
                const userInfo = userPublicKey ? accountsInfo[accountIndex++] : null;

                const vaultBalance = vaultInfo ? decodeTokenAccountAmountBN(vaultInfo.data) : new BN(0);
                const userBalance = userInfo ? decodeTokenAccountAmountBN(userInfo.data) : new BN(0);
                
                newDynamicData.set(token.address, {
                    vaultBalance,
                    priceFeedInfo,
                    decimals: null, // Placeholder
                    userBalance
                });
            });
            
            // Fetch decimals separately
            const mintDecimalsPromises = decodedOracleData!.data.map(token => getMint(connection, new PublicKey(token.address)));
            const mintInfos = await Promise.allSettled(mintDecimalsPromises);
            mintInfos.forEach((result, index) => {
                 const tokenAddress = decodedOracleData?.data[index]?.address;
                 if (!tokenAddress) return;
                 const dataEntry = newDynamicData.get(tokenAddress);
                 if(dataEntry && result.status === 'fulfilled') {
                     dataEntry.decimals = result.value.decimals;
                 } else if (result.status === 'rejected') {
                     console.error(`Failed fetch decimals ${tokenAddress}:`, result.reason);
                     processingError = true;
                     if(dataEntry) dataEntry.decimals = null;
                 }
             });

            setDynamicData(newDynamicData);
            if (processingError) setError("Errors occurred during initial data fetch.");

        } catch (error: any) { setError(error.message); }
         finally { setIsLoading(false); }
    }, [program, provider, connection, wallet.publicKey]);

    // ... (useEffect to trigger initial fetch) ...
    useEffect(() => { fetchInitialData(); }, [fetchInitialData]); 

    // --- Setup WebSocket Subscriptions --- 
    useEffect(() => {
        if (!connection || !poolConfig || !program || isLoading) return;
        let active = true;
        const currentSubscriptionIds: number[] = [];
        console.log("Setting up WS subs...");

        // 1. Subscribe to wLQI Mint (Fill arguments)
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
            console.log(`Subscribed to wLQI Mint: ${poolConfig.wliMint.toBase58()}`);
        } catch (error) { console.error("wLQI Sub Error:", error); }

        // 2. Subscribe to Vaults
        poolConfig.supportedTokens.forEach(token => {
            if (!token.vault) return;
            try {
                const vaultSubId = connection.onAccountChange(
                    token.vault,
                    (accountInfo) => {
                         if (!active) return;
                         const newBalanceBN = decodeTokenAccountAmountBN(accountInfo.data);
                         console.log(`WS: Vault ${token.mint.toBase58()} Update: ${newBalanceBN.toString()}`);
                         setDynamicData(prevMap => {
                             const newMap = new Map(prevMap);
                             const existingData = newMap.get(token.mint.toBase58());
                             if (existingData) {
                                 newMap.set(token.mint.toBase58(), { ...existingData, vaultBalance: newBalanceBN });
                             }
                             return newMap;
                         });
                     },
                    "confirmed"
                );
                currentSubscriptionIds.push(vaultSubId);
                console.log(`Subscribed to Vault: ${token.vault.toBase58()}`);
            } catch (error) { console.error(`Vault Sub Error (${token.mint.toBase58()}):`, error); }
        });

        setSubscriptionIds(currentSubscriptionIds);
        // Cleanup
        return () => {
            active = false;
            console.log("Cleaning up WS subs:", currentSubscriptionIds);
            currentSubscriptionIds.forEach(id => connection.removeAccountChangeListener(id));
            setSubscriptionIds([]);
        };

    }, [connection, poolConfig, program, isLoading]);

    // --- Process Dynamic Data --- 
    useEffect(() => {
        // ... (processing logic remains the same) ...
         if (!oracleData || dynamicData.size === 0) {
            setProcessedTokenData(null);
            return;
        }
        const processed: ProcessedTokenData[] = [];
        oracleData.data.forEach(token => {
            const dd = dynamicData.get(token.address);
            if (dd) {
                processed.push({
                    mintAddress: token.address,
                    symbol: token.symbol,
                    targetDominance: new BN(token.dominance),
                    vaultBalance: dd.vaultBalance,
                    priceData: decodePriceData(dd.priceFeedInfo),
                    decimals: dd.decimals,
                    userBalance: dd.userBalance
                });
            } else { console.warn(`Missing dynamic data for ${token.symbol}.`); }
        });
        setProcessedTokenData(processed);
    }, [oracleData, dynamicData]);

    // --- Perform Calculations --- 
    useEffect(() => {
        // ... (calculation logic remains the same) ...
        if (!processedTokenData) {
            setTotalPoolValueScaled(null);
            setWlqiValueScaled(null);
            return;
        }
        const totalValue = calculateTotalPoolValue(processedTokenData);
        setTotalPoolValueScaled(totalValue);
        if (totalValue && wLqiSupply && wLqiDecimals !== null) {
            const wLqiValue = calculateWLqiValue(totalValue, wLqiSupply, wLqiDecimals);
            setWlqiValueScaled(wLqiValue);
        } else { setWlqiValueScaled(null); }
    }, [processedTokenData, wLqiSupply, wLqiDecimals]);

    // --- Prepare data for TokenTable --- 
    const tableData = useMemo((): ProcessedTokenData[] => { // Return ProcessedTokenData[]
        if (!processedTokenData) return [];
        // Return the processed data directly
        return processedTokenData; 
    }, [processedTokenData]);

    // --- Faucet Button Handler ---
    const openFaucet = () => {
        window.open('https://i-jac.github.io/faucet-frontend/', '_blank', 'noopener,noreferrer');
    };

    // Render Logic
    if (isLoading) return <div className="text-center p-4">Loading Pool Info...</div>;
    if (error) return <div className="text-center p-4 text-red-500">Error: {error}</div>;
    if (!poolConfig || !poolConfigPda || !oracleData) return <div className="text-center p-4">Pool data not fully loaded.</div>;

    // Ensure formatters receive correct types (BN needs .toString() for formatRawAmountString if it expects string)
    const formattedWlqiSupply = formatRawAmountString(wLqiSupply, wLqiDecimals, true, 2);
    const formattedWlqiValue = formatScaledBnToDollarString(wLqiValueScaled, USD_SCALE); 
    const formattedTvl = formatScaledBnToDollarString(totalPoolValueScaled, USD_SCALE); 

    return (
        <div className="bg-gray-800 text-white p-6 rounded-lg shadow-md max-w-4xl mx-auto mt-10 font-[family-name:var(--font-geist-mono)] relative">
             {/* Faucet Button Top Left */}
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
                <TokenTable
                    tokenData={tableData} 
                    totalPoolValueScaled={totalPoolValueScaled} 
                    wLqiValueScaled={wLqiValueScaled}
                    wLqiDecimals={wLqiDecimals}
                    userWlqiBalance={userWlqiBalance}
                    onDeposit={interactionsReady ? actualHandleDeposit : disabledDeposit}
                    onWithdraw={interactionsReady ? actualHandleWithdraw : disabledWithdraw}
                    isDepositing={isDepositing}
                    isWithdrawing={isWithdrawing}
                />
            </div>
        </div>
    );
};