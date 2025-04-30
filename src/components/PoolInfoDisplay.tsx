'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { PublicKey, SystemProgram, AccountInfo } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useAnchorProgram } from '@/hooks/useAnchorProgram';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
    POOL_AUTHORITY_SEED,
    USD_SCALE
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
    const [userTokenBalances, setUserTokenBalances] = useState<Map<string, BN | null>>(new Map()); // State for other token balances
    const [depositAmounts, setDepositAmounts] = useState<Record<string, string>>({}); // Add state for deposit amounts
    const [withdrawAmounts, setWithdrawAmounts] = useState<Record<string, string>>({}); // Add state for withdraw amounts
    const hasFetchedUserData = useRef(false); // Ref to track user data fetch status
    const hasFetchedPublicData = useRef(false); // Ref to track public data fetch status

    // --- Callback to handle amount input changes ---
    const handleAmountChange = useCallback((mintAddress: string, action: 'deposit' | 'withdraw', amount: string) => {
        // Basic validation could go here (e.g., allow only numbers/decimals)
        if (action === 'deposit') {
            setDepositAmounts(prev => ({ ...prev, [mintAddress]: amount }));
        } else {
            setWithdrawAmounts(prev => ({ ...prev, [mintAddress]: amount }));
        }
    }, []); // Empty dependency array as it only uses setters

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
        catch (e) { 
             // Fix any type
             const errorMessage = e instanceof Error ? e.message : String(e);
             console.error("Decode Account BN Error:", errorMessage); 
             return new BN(0); 
        }
    };
    const decodeMintAccountSupplyString = (buffer: Buffer): string => {
        try { return MintLayout.decode(buffer).supply.toString(); }
        catch (e) { 
            // Fix any type
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error("Decode Mint String Error:", errorMessage); 
            return '0'; 
        }
    };

    // --- Fetch Public Pool Data ---
    const fetchPublicPoolData = useCallback(async () => {
        const activeProvider = provider || readOnlyProvider;
        if (!program || !activeProvider || !connection) {
            return;
        }
        setIsLoadingPublicData(true);
        setError(null);
        setPoolConfig(null); // Reset state on refetch
        setOracleData(null);
        setWlqiSupply(null);
        setWlqiDecimals(null);
        setDynamicData(new Map()); // Clear dynamic data except user balances

        let fetchedConfig: PoolConfig | null = null;
        let decodedOracleData: AggregatedOracleDataDecoded | null = null;

        try {
            // 1. Fetch Config
            const pda = findPoolConfigPDA(program.programId);
            setPoolConfigPda(pda);
            fetchedConfig = await program.account.poolConfig.fetch(pda) as PoolConfig;
            setPoolConfig(fetchedConfig); // Set config state

            // 2. Fetch Oracle Data & Decode
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
            decodedOracleData = {
                authority: authorityPubkey.toBase58(),
                totalTokens: totalTokens,
                data: decodedTokens
            };
            setOracleData(decodedOracleData); // Set oracle state

            // 3. Fetch wLQI Supply & Decimals
            const fetchedWlqiSupply = (await connection.getTokenSupply(fetchedConfig.wliMint)).value.amount;
            const fetchedWlqiDecimals = (await getMint(connection, fetchedConfig.wliMint)).decimals;
            setWlqiSupply(fetchedWlqiSupply); // Set state
            setWlqiDecimals(fetchedWlqiDecimals); // Set state

            // 4. Fetch Public Dynamic Data (Vaults, Price Feeds, Mint Decimals)
            const [poolAuthorityPda] = PublicKey.findProgramAddressSync([POOL_AUTHORITY_SEED], program.programId);
            const publicAddressesToFetch: PublicKey[] = [];
            const tokenInfoMap = new Map<string, Partial<TokenProcessingInfo>>(); // Use Partial temporarily

             // --- Start: Fetch Mint Decimals Concurrently ---
             const mintPubkeys = decodedOracleData.data.map(token => new PublicKey(token.address));
             const mintInfoPromises = mintPubkeys.map(mint => getMint(connection, mint));
             const mintInfos = await Promise.all(mintInfoPromises);
             const decimalsMap = new Map<string, number>();
             mintInfos.forEach((mintInfo, index) => {
                 decimalsMap.set(mintPubkeys[index].toBase58(), mintInfo.decimals);
             });
             // --- End: Fetch Mint Decimals Concurrently ---

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
                        vaultIndex: publicAddressesToFetch.length - 2, // Index in public fetch array
                        priceFeedIndex: publicAddressesToFetch.length - 1, // Index in public fetch array
                        mintDecimals: decimals,
                        userAta: undefined, // Not fetching user data here
                        userAtaIndex: undefined // Not fetching user data here
                    });
                } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    console.error(`Error preparing public fetch for token ${token.symbol}:`, errorMessage);
                    // Continue processing other tokens if possible
                }
            });

            const publicAccountsInfo = await connection.getMultipleAccountsInfo(publicAddressesToFetch);

            // Process public data into dynamicData state
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
                    priceFeedInfo: priceFeedInfo, // Store the raw AccountInfo<Buffer>
                    decimals: info.mintDecimals,
                    userBalance: null // Initialize user balance to null
                });
            });

            setDynamicData(initialDynamicData); // Set dynamic data (without user balances yet)
            if (processingError) {
                 setError("Errors occurred processing some public token data.");
            }

            // Mark public data as fetched
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
        // Guard: Ensure wallet connected, public data loaded (poolConfig needed for wLQI mint)
        if (!wallet.connected || !wallet.publicKey || !connection || !poolConfig) {
            console.log("Skipping user data fetch: Wallet not connected or public data not ready.");
             // Ensure user balances are null if wallet disconnects or public data fails
             setUserWlqiBalance(null);
              // Also clear the separate user token balance map
             setUserTokenBalances(new Map()); 
             // Clear dynamic data user balances (this loop might be redundant now)
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
        const tokenMintMapForUserFetch = new Map<string, PublicKey>(); // Map index in fetch array to mint address string

        try {
            // 1. Prepare user wLQI ATA
            const userWlqiAta = getAssociatedTokenAddressSync(poolConfig.wliMint, userPublicKey, true);
            userAddressesToFetch.push(userWlqiAta);

            // 2. Prepare user ATAs for supported tokens based on poolConfig
            poolConfig.supportedTokens.forEach(tokenConfig => {
                try {
                    const mint = tokenConfig.mint;
                    if (!mint.equals(poolConfig.wliMint)) {
                         const userAta = getAssociatedTokenAddressSync(mint, userPublicKey, true);
                         userAddressesToFetch.push(userAta);
                         tokenMintMapForUserFetch.set((userAddressesToFetch.length - 1).toString(), mint);
                    }
                 } catch (e) { 
                     const errorMessage = e instanceof Error ? e.message : String(e);
                     console.error(`Error deriving user ATA for mint ${tokenConfig.mint.toBase58()}:`, errorMessage);
                 }
            });

            // 3. Fetch user accounts
            const userAccountsInfo = await connection.getMultipleAccountsInfo(userAddressesToFetch);

            // 4. Process user accounts
            const userWlqiInfo = userAccountsInfo[0];
            const newWlqiBalance = userWlqiInfo ? decodeTokenAccountAmountBN(userWlqiInfo.data) : new BN(0);
            setUserWlqiBalance(newWlqiBalance);
            console.log(`  Fetched user wLQI balance: ${newWlqiBalance.toString()}`);

            // Process other token balances into a separate map
            const newUserTokenBalancesMap = new Map<string, BN | null>();
            userAccountsInfo.slice(1).forEach((accInfo, index) => {
                const mapKey = (index + 1).toString();
                const mint = tokenMintMapForUserFetch.get(mapKey);
                
                if (mint) {
                    const mintAddressStr = mint.toBase58();
                    const newUserBalance = accInfo ? decodeTokenAccountAmountBN(accInfo.data) : new BN(0);
                    newUserTokenBalancesMap.set(mintAddressStr, newUserBalance);
                    const tokenSymbol = oracleData?.data.find(t => t.address === mintAddressStr)?.symbol;
                    console.log(`  Fetched user ${tokenSymbol ?? mintAddressStr} balance: ${newUserBalance.toString()}`);
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

    // --- Effect to calculate derived values when dynamic data changes ---
    // eslint-disable-next-line react-hooks/exhaustive-deps 
    useEffect(() => {
        if (!dynamicData || dynamicData.size === 0 || !oracleData || !wLqiSupply || wLqiDecimals === null) {
            console.log("Calculation skipped, missing data");
            // Ensure derived state is reset if inputs are missing
            if (processedTokenData !== null) setProcessedTokenData(null);
            if (totalPoolValueScaled !== null) setTotalPoolValueScaled(null);
            if (wLqiValueScaled !== null) setWlqiValueScaled(null);
            return;
        }
        console.log("Calculating derived values...");
        const processedData: ProcessedTokenData[] = [];

        oracleData.data.forEach(token => {
            const dynamic = dynamicData.get(token.address);
            if (!dynamic || dynamic.vaultBalance === null || dynamic.priceFeedInfo === null || dynamic.decimals === null) {
                console.warn(`Skipping calculation for ${token.symbol}: Missing dynamic data`);
                return;
            }
            const decodedPrice = decodePriceData(dynamic.priceFeedInfo);
            if (!decodedPrice) {
                console.warn(`Skipping calculation for ${token.symbol}: Could not decode price`);
                return;
            }
            processedData.push({
                symbol: token.symbol,
                mintAddress: token.address,
                targetDominance: new BN(token.dominance),
                priceFeedId: token.priceFeedId,
                vaultBalance: dynamic.vaultBalance,
                decimals: dynamic.decimals,
                priceData: decodedPrice,
                // User balance is now sourced from userTokenBalances state
                userBalance: null // Keep as null here, will be merged later if needed
            });
        });

        const totalValue = calculateTotalPoolValue(processedData);
        const wLqiValue = calculateWLqiValue(totalValue, wLqiSupply, wLqiDecimals);

        console.log("Total Pool Value Scaled:", totalValue.toString());
        console.log("wLQI Supply:", wLqiSupply);
        console.log("wLQI Decimals:", wLqiDecimals);
        console.log("wLQI Value Scaled:", wLqiValue?.toString());
        console.log("Processed Data:", processedData);
        setProcessedTokenData(processedData);
        setTotalPoolValueScaled(totalValue);
        setWlqiValueScaled(wLqiValue);

    // Remove states set *in* this effect from dependency array to prevent infinite loop
    }, [dynamicData, oracleData, wLqiSupply, wLqiDecimals]);

    // --- Setup WebSocket Subscriptions ---
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!connection || !poolConfig || !program || isLoadingPublicData) return;
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

        // Cleanup
        return () => {
            active = false;
            console.log("Cleaning up WS subs:", currentSubscriptionIds);
            currentSubscriptionIds.forEach(id => connection.removeAccountChangeListener(id));
        };

    }, [connection, poolConfig, program, isLoadingPublicData]);

    // --- Effect to TRIGGER Public Data Fetch (Runs ONCE) ---
    useEffect(() => {
        const activeProvider = provider || readOnlyProvider;
        if (program && activeProvider && connection && !hasFetchedPublicData.current) {
             fetchPublicPoolData();
        }
    }, [program, provider, readOnlyProvider, connection, fetchPublicPoolData]); 

    // --- Effect to TRIGGER User Data Fetch ---
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        // Trigger fetch ONLY ONCE when wallet connects AND public data is loaded
        if (wallet.connected && wallet.publicKey && poolConfig && !hasFetchedUserData.current) {
            console.log("Wallet connected and public data ready, fetching user data (first time)...", { hasFetched: hasFetchedUserData.current });
            fetchUserAccountData();
        } 
        // Don't clear balances here anymore, handle in reset effect
    }, [wallet.connected, wallet.publicKey, connection, poolConfig]); 

    // --- Effect to Reset User Data Fetch Flag on Disconnect --- 
    useEffect(() => {
        if (!wallet.connected) {
            console.log("Wallet disconnected, resetting user data fetch flag and balances.");
            hasFetchedUserData.current = false;
             // Explicitly clear user balances on disconnect
             setUserWlqiBalance(null);
             setUserTokenBalances(new Map()); // Clear separate token balances state
        }
    }, [wallet.connected]); // Only depends on connection status

    // --- Prepare data for TokenTable --- 
    const tableData = useMemo((): ProcessedTokenData[] => {
        if (!processedTokenData) return [];
        // Add user balances from the separate state
        return processedTokenData.map(token => ({
            ...token,
            userBalance: userTokenBalances.get(token.mintAddress) ?? null,
        }));
    }, [processedTokenData, userTokenBalances]);

    // --- Faucet Button Handler ---
    const openFaucet = () => {
        window.open('https://i-jac.github.io/faucet-frontend/', '_blank', 'noopener,noreferrer');
    };

    // Render Logic
    if (isLoadingPublicData) {
        return (
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-md max-w-4xl mx-auto mt-10 font-[family-name:var(--font-geist-mono)] relative">
                {/* Skeleton for Faucet Button - Optional */}
                {/* <SkeletonBlock className="absolute top-4 left-4 h-7 w-24" /> */}

                <h2 className="text-2xl font-bold mb-4 text-center border-b border-gray-600 pb-2">
                     {/* Pool Information - could also skeletonize this text */}
                     Pool Information
                </h2>
                {/* Skeleton for Top Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mb-6 bg-gray-700 p-4 rounded">
                    <div><SkeletonBlock className="h-6 w-3/4 mx-auto mb-1" /> <SkeletonBlock className="h-6 w-1/2 mx-auto" /></div>
                    <div><SkeletonBlock className="h-6 w-3/4 mx-auto mb-1" /> <SkeletonBlock className="h-6 w-1/2 mx-auto" /></div>
                    <div><SkeletonBlock className="h-6 w-3/4 mx-auto mb-1" /> <SkeletonBlock className="h-6 w-1/2 mx-auto" /></div>
                </div>
                {/* Skeleton for Token Table */}
                <div className="mt-6 border-t border-gray-600 pt-4">
                     <h3 className="text-lg font-semibold text-center text-yellow-400 mb-3">
                         Token Details & Interactions
                     </h3>
                    <SkeletonTokenTable rowCount={5} /> {/* Show 5 placeholder rows */}
                </div>
            </div>
        );
    }

    // Show Error if occurred
    if (error) return <div className="text-center p-4 text-red-500">Error: {error}</div>;
    
    // Show "Not Fully Loaded" if public data fetch finished but failed partially
    // Note: Might need refinement based on how errors are handled
    if (!poolConfig || !oracleData) return <div className="text-center p-4">Pool data could not be loaded.</div>;

    // --- Render Actual Data (when loaded and no error) --- 
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
                    onWithdraw={interactionsReady ? (mint, amount) => actualHandleWithdraw(mint, amount) : disabledWithdraw}
                    isDepositing={isDepositing}
                    isWithdrawing={isWithdrawing}
                    depositAmounts={depositAmounts}
                    withdrawAmounts={withdrawAmounts}
                    handleAmountChange={handleAmountChange}
                />
            </div>
        </div>
    );
};