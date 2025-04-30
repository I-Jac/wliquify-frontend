'use client';

import { useCallback, useState } from 'react';
import { BN, Program } from '@coral-xyz/anchor';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
    PublicKey, 
    SystemProgram, 
    SYSVAR_RENT_PUBKEY, 
    AccountMeta,
    TransactionMessage, // Import necessary types for VersionedTransaction
    VersionedTransaction, 
    ComputeBudgetProgram, // Import ComputeBudgetProgram
    LAMPORTS_PER_SOL // Import LAMPORTS_PER_SOL
} from '@solana/web3.js'; 
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getMint } from '@solana/spl-token';
import { parseUnits } from 'ethers'; // Or your preferred BN library
import { PoolConfig, SupportedToken } from '@/types'; // Local types import - OK
import { WLiquifyPool } from '@/types/w_liquify_pool';
import { POOL_AUTHORITY_SEED, TOKEN_HISTORY_SEED } from '@/utils/constants';
import { useAnchorProgram } from "./useAnchorProgram"; // CORRECTED: Import renamed hook
import toast from "react-hot-toast";
import { findPoolAuthorityPDA, findPoolVaultPDA, findTokenHistoryPDA } from "../utils/pda"; // Use relative path
import { useSettings } from '@/contexts/SettingsContext'; // ADDED: Import useSettings

// Define the structure matching the Rust PoolConfig if not imported
// interface PoolConfig {
//     admin: PublicKey;
//     feeRecipient: PublicKey;
//     wliMint: PublicKey;
//     poolAuthorityBump: number;
//     oracleProgramId: PublicKey;
//     oracleAggregatorAccount: PublicKey;
//     addressLookupTable: PublicKey;
//     supportedTokens: { mint: PublicKey; vault: PublicKey; tokenHistory: PublicKey; priceFeed: PublicKey }[];
// }

interface UsePoolInteractionsProps {
    program: Program<WLiquifyPool> | null;
    poolConfig: PoolConfig | null;
    poolConfigPda: PublicKey | null; // Address of the PoolConfig account
    oracleData: { data: { address: string; priceFeedId: string }[] } | null;
    onTransactionSuccess: (affectedMintAddress?: string) => Promise<void>;
}

export function usePoolInteractions({ program, poolConfig, poolConfigPda, oracleData, onTransactionSuccess }: UsePoolInteractionsProps) {
    const { connection } = useConnection();
    const wallet = useWallet();
    const { publicKey, sendTransaction, signTransaction } = wallet;
    const { priorityFee } = useSettings(); // ADDED: Get priorityFee from context
    const [isDepositing, setIsDepositing] = useState(false);
    const [isWithdrawing, setIsWithdrawing] = useState(false);

    const handleDeposit = useCallback(async (mintAddress: string, amountString: string, decimals: number | null) => {
        // --- Pre-flight Checks ---
        if (!program || !publicKey || !poolConfig || !poolConfigPda || !oracleData || decimals === null) {
            toast.error("Program, wallet, or pool config not available.");
            console.error("Deposit prerequisites not met:", { program, wallet, poolConfig, poolConfigPda });
            return;
        }
        if (!amountString || parseFloat(amountString) <= 0) {
            alert('Please enter a valid deposit amount.');
            return;
        }
        if (!poolConfig.addressLookupTable || poolConfig.addressLookupTable.equals(SystemProgram.programId)) {
             alert('Address Lookup Table not configured in pool settings.');
             console.error("PoolConfig missing addressLookupTable");
             return;
        }
        if (!signTransaction) {
             alert('Wallet does not support signing versioned transactions needed for this pool.');
             console.error("Wallet adapter does not provide signTransaction method.");
             return;
        }

        // --- Check SOL Balance ---
        const minSolBalanceLamports = 100000; // 0.0001 SOL - adjust as needed
        try {
            const balance = await connection.getBalance(publicKey!); 
            if (balance < minSolBalanceLamports) {
                toast.error(`Insufficient SOL balance for transaction fees. Need ~${minSolBalanceLamports / LAMPORTS_PER_SOL} SOL.`);
                console.error(`Insufficient SOL balance: ${balance} lamports. Need ${minSolBalanceLamports} lamports.`);
                return;
            }
        } catch (balanceError) {
            toast.error("Could not verify SOL balance.");
            console.error("Failed to fetch SOL balance:", balanceError);
            return; // Prevent proceeding if balance check fails
        }

        setIsDepositing(true);
        const toastId = toast.loading("Processing deposit...");
        let depositMint: PublicKey | null = null; // Keep track of the mint

        try {
            depositMint = new PublicKey(mintAddress);
            const amountBn = new BN(parseUnits(amountString, decimals!).toString());

            // --- Derive PDAs and ATAs ---
            const poolAuthorityPda = findPoolAuthorityPDA();
            const userSourceAta = getAssociatedTokenAddressSync(depositMint, publicKey!);
            const targetTokenVaultAta = findPoolVaultPDA(poolAuthorityPda, depositMint);
            const historicalTokenDataPda = findTokenHistoryPDA(depositMint);
            const poolConfigAddress = poolConfigPda!;

            console.log("Depositing:", {
                user: publicKey!.toBase58(),
                poolConfig: poolConfigAddress.toBase58(),
                poolAuthority: poolAuthorityPda.toBase58(),
                tokenMint: depositMint.toBase58(),
                poolVault: targetTokenVaultAta.toBase58(),
                userTokenAccount: userSourceAta.toBase58(),
                tokenHistoryAccount: historicalTokenDataPda.toBase58(),
                amount: amountBn.toString(),
            });

            // --- Prepare Remaining Accounts ---
            const remainingAccounts: AccountMeta[] = poolConfig.supportedTokens.flatMap((st: SupportedToken) => {
                const tokenMint = st.mint;
                const oracleTokenInfo = oracleData.data.find(ot => ot.address === tokenMint.toBase58());
                if (!oracleTokenInfo) {
                     const errorMsg = `Oracle data not found for supported token ${tokenMint.toBase58()}`;
                     console.error(errorMsg);
                     throw new Error(errorMsg);
                 }
                 const priceFeedAddress = new PublicKey(oracleTokenInfo.priceFeedId);
                
                 const vaultAddress = st.vault;
                 if (!vaultAddress) {
                    const errorMsg = `Vault address missing for supported token ${tokenMint.toBase58()} in PoolConfig`;
                    console.error(errorMsg);
                    throw new Error(errorMsg);
                 }
                 
                 const history = findTokenHistoryPDA(tokenMint);

                return [
                    { pubkey: vaultAddress, isSigner: false, isWritable: true }, 
                    { pubkey: history, isSigner: false, isWritable: false },
                    { pubkey: priceFeedAddress, isSigner: false, isWritable: false }
                ];
            });

             console.log("Remaining Accounts Count:", remainingAccounts.length);

            // --- Build Instructions (Compute Budget + Deposit) ---
            const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
                units: 1200000 // Ensure ample CUs
            });
            const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
                microLamports: priorityFee // Use fee from settings context
            });

            const depositInstruction = await program!.methods
                .deposit(amountBn)
                .accounts({ 
                    user: publicKey!,
                    userSourceAta: userSourceAta,
                    poolConfig: poolConfigPda!,
                    poolAuthority: findPoolAuthorityPDA(),
                    wliMint: poolConfig!.wliMint,
                    userWliAta: getAssociatedTokenAddressSync(poolConfig!.wliMint, publicKey!),
                    ownerFeeAccount: getAssociatedTokenAddressSync(poolConfig!.wliMint, poolConfig!.feeRecipient, true),
                    depositMint: depositMint,
                    targetTokenVaultAta: targetTokenVaultAta,
                    oracleAggregatorAccount: poolConfig!.oracleAggregatorAccount,
                    historicalTokenData: historicalTokenDataPda,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY,
                })
                .remainingAccounts(remainingAccounts)
                .instruction();

            // --- Fetch ALT --- 
            console.log(`Fetching ALT: ${poolConfig.addressLookupTable.toBase58()}`);
            const lookupTableAccount = await connection
                .getAddressLookupTable(poolConfig.addressLookupTable)
                .then((res) => res.value);

            if (!lookupTableAccount) {
                throw new Error("Address lookup table not found.");
            }
            console.log("ALT fetched successfully.");

            // --- Create Versioned Transaction --- 
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            const messageV0 = new TransactionMessage({
                payerKey: publicKey!,
                recentBlockhash: blockhash,
                instructions: [
                    modifyComputeUnits, // Add CU limit instruction
                    addPriorityFee,     // Add priority fee instruction
                    depositInstruction  // The main deposit instruction
                ], 
            }).compileToV0Message([lookupTableAccount]);

            const transactionV0 = new VersionedTransaction(messageV0);
            console.log("Versioned transaction created with increased CU limit.");

            // --- Sign and Send --- 
            console.log("Signing transaction...");
            const signedTransaction = await signTransaction(transactionV0);
            console.log("Sending transaction...");
            const txid = await connection.sendTransaction(signedTransaction, {
                skipPreflight: true, // Keep skipPreflight for complex txns
            });
            console.log("Transaction sent, signature:", txid);

            // --- Confirm Transaction --- 
            console.log("Confirming transaction...");
            toast.loading(`Confirming deposit... Tx: ${txid.substring(0, 8)}...`, { id: toastId });
            const confirmation = await connection.confirmTransaction({
                signature: txid,
                blockhash: blockhash,
                lastValidBlockHeight: lastValidBlockHeight // Use fetched height
             }, 'confirmed');

            if (confirmation.value.err) {
                console.error('Transaction Confirmation Error:', confirmation.value.err);
                // Attempt to fetch transaction logs even on confirmation error
                try {
                    const failedTx = await connection.getTransaction(txid, { maxSupportedTransactionVersion: 0 });
                    console.error('Failed Transaction Logs:', failedTx?.meta?.logMessages);
                } catch (logError) {
                    console.error('Could not fetch logs for failed transaction:', logError);
                }
                throw new Error(`Transaction failed confirmation: ${JSON.stringify(confirmation.value.err)}`);
            }

            console.log('Deposit successful!');
            toast.success(`Deposit successful! Tx: ${txid.substring(0, 8)}...`, { id: toastId });
            // --- ADDED: Trigger balance refresh --- 
            if (depositMint) {
                await onTransactionSuccess(depositMint.toBase58());
            } else {
                 await onTransactionSuccess(); // Refresh wLQI at least
            }
            // --- END ADD --- 

        } catch (error: any) {
            console.error("Deposit failed Raw:", error); // Log the whole error object
            if (error.logs) { // Logs might be attached directly to the error by Wallet Adapter
                console.error("Deposit Transaction Logs (from error object):", error.logs);
            } 
            // Add detailed error message to toast
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            toast.error(`Deposit failed: ${errorMessage.substring(0, 60)}${errorMessage.length > 60 ? '...' : ''}`, { id: toastId });

        } finally {
            setIsDepositing(false);
        }
    }, [program, poolConfig, poolConfigPda, oracleData, publicKey, connection, signTransaction, onTransactionSuccess, priorityFee]);

    // --- handleWithdraw --- 
    const handleWithdraw = useCallback(async (mintAddress: string, amountString: string, decimals: number | null) => {
        // --- Pre-flight Checks ---
        if (!program || !publicKey || !poolConfig || !poolConfigPda || !oracleData) {
           toast.error("Program, wallet, or pool config not available for withdrawal.");
           console.error("Withdraw prerequisites not met:", { program, wallet, poolConfig, poolConfigPda });
           return;
        }
        // Check amountString validity
        if (!amountString || parseFloat(amountString) <= 0) {
           alert('Please enter a valid withdraw amount (in wLQI).');
           return;
        }
        if (!poolConfig.addressLookupTable || poolConfig.addressLookupTable.equals(SystemProgram.programId)) {
             alert('Address Lookup Table not configured in pool settings.');
             console.error("PoolConfig missing addressLookupTable");
             return;
        }
        if (!signTransaction) {
             alert('Wallet does not support signing versioned transactions needed for this pool.');
             console.error("Wallet adapter does not provide signTransaction method.");
             return;
        }

       setIsWithdrawing(true);
       const toastId = toast.loading("Processing withdrawal...");
       let withdrawMint: PublicKey | null = null; // Keep track of the mint

        try {
            withdrawMint = new PublicKey(mintAddress);
            let wLqiDecimals: number;
            try {
                const wliMintInfo = await getMint(connection, poolConfig.wliMint);
                wLqiDecimals = wliMintInfo.decimals;
            } catch (e) {
                console.error("Failed to fetch wLQI mint info:", e);
                toast.error("Could not fetch wLQI token details. Cannot proceed with withdrawal.");
                setIsWithdrawing(false);
                return;
            }
            
            const wLqiAmountBn = new BN(parseUnits(amountString, wLqiDecimals).toString());
            const poolAuthorityPda = findPoolAuthorityPDA();
            const sourceTokenVaultAta = getAssociatedTokenAddressSync(withdrawMint, poolAuthorityPda, true);
            const userDestAta = getAssociatedTokenAddressSync(withdrawMint, publicKey!);
            const userWliAta = getAssociatedTokenAddressSync(poolConfig.wliMint, publicKey!);
            const historicalTokenDataPda = findTokenHistoryPDA(withdrawMint);
            const poolConfigAddress = poolConfigPda!;

            console.log("Withdrawing:", {
                user: publicKey!.toBase58(),
                poolConfig: poolConfigAddress.toBase58(),
                poolAuthority: poolAuthorityPda.toBase58(),
                tokenMint: withdrawMint.toBase58(),
                poolSourceVault: sourceTokenVaultAta.toBase58(),
                userDestinationAccount: userDestAta.toBase58(),
                userWliAccount: userWliAta.toBase58(),
                tokenHistoryAccount: historicalTokenDataPda.toBase58(),
                wLqiAmount: wLqiAmountBn.toString(),
                wLqiDecimals: wLqiDecimals,
            });

             // --- Prepare Remaining Accounts (Similar to deposit) ---
             const remainingAccounts: AccountMeta[] = poolConfig.supportedTokens.flatMap((st: SupportedToken) => {
                const tokenMint = st.mint;
                const oracleTokenInfo = oracleData.data.find(ot => ot.address === tokenMint.toBase58());
                if (!oracleTokenInfo) {
                    throw new Error(`Oracle data missing for ${tokenMint.toBase58()}`);
                }
                const priceFeedAddress = new PublicKey(oracleTokenInfo.priceFeedId);
                const vaultAddress = st.vault;
                if (!vaultAddress) {
                    throw new Error(`Vault missing for ${tokenMint.toBase58()}`);
                }
                const history = findTokenHistoryPDA(tokenMint);
                return [
                    { pubkey: vaultAddress, isSigner: false, isWritable: false },
                    { pubkey: history, isSigner: false, isWritable: false },
                    { pubkey: priceFeedAddress, isSigner: false, isWritable: false }
                ];
            });
            console.log("Withdraw Remaining Accounts Count:", remainingAccounts.length);

            // --- Build Instructions (Compute Budget + Withdraw) ---
            const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 1200000 }); // Ensure ample CUs
            const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
                microLamports: priorityFee // Use fee from settings context
            });

            const withdrawInstruction = await program!.methods
                .withdraw(wLqiAmountBn, withdrawMint)
                .accounts({ 
                    user: publicKey!,
                    userWliAta: userWliAta,
                    userDestAta: userDestAta,
                    feeRecipient: poolConfig!.feeRecipient,
                    poolConfig: poolConfigPda!,
                    poolAuthority: poolAuthorityPda,
                    wliMint: poolConfig!.wliMint,
                    ownerFeeAccount: getAssociatedTokenAddressSync(poolConfig!.wliMint, poolConfig!.feeRecipient, true),
                    desiredTokenMint: withdrawMint,
                    sourceTokenVaultAta: sourceTokenVaultAta,
                    oracleAggregatorAccount: poolConfig!.oracleAggregatorAccount,
                    historicalTokenData: historicalTokenDataPda,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY,
                })
                .remainingAccounts(remainingAccounts)
                .instruction();

            // --- Fetch ALT, Create Txn, Sign, Send, Confirm (Similar to Deposit) ---
            console.log(`Fetching ALT: ${poolConfig.addressLookupTable.toBase58()}`);
            const lookupTableAccount = await connection.getAddressLookupTable(poolConfig.addressLookupTable).then(res => res.value);
            if (!lookupTableAccount) throw new Error("ALT not found.");

            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            const messageV0 = new TransactionMessage({
                payerKey: publicKey!,
                recentBlockhash: blockhash,
                instructions: [modifyComputeUnits, addPriorityFee, withdrawInstruction],
            }).compileToV0Message([lookupTableAccount]);
            const transactionV0 = new VersionedTransaction(messageV0);

            console.log("Signing withdrawal transaction...");
            const signedTransaction = await signTransaction(transactionV0);
            console.log("Sending withdrawal transaction...");
            const txid = await connection.sendTransaction(signedTransaction, { skipPreflight: true });
            console.log("Withdrawal transaction sent, signature:", txid);

            console.log("Confirming withdrawal transaction...");
            toast.loading(`Confirming withdrawal... Tx: ${txid.substring(0, 8)}...`, { id: toastId });
            const confirmation = await connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, 'confirmed');

            if (confirmation.value.err) {
                console.error('Withdrawal Confirmation Error:', confirmation.value.err);
                try {
                    const failedTx = await connection.getTransaction(txid, { maxSupportedTransactionVersion: 0 });
                    console.error('Failed Withdrawal Logs:', failedTx?.meta?.logMessages);
                } catch (logError) {
                    console.error('Could not fetch logs for failed withdrawal:', logError);
                }
                throw new Error(`Withdrawal failed confirmation: ${JSON.stringify(confirmation.value.err)}`);
            }

            toast.success(`Withdrawal successful! Tx: ${txid.substring(0, 8)}...`, { id: toastId });
            // --- ADDED: Trigger balance refresh --- 
            if (withdrawMint) {
                await onTransactionSuccess(withdrawMint.toBase58());
            } else {
                await onTransactionSuccess(); // Refresh wLQI at least
            }
            // --- END ADD --- 

        } catch (error: any) {
            console.error("Withdrawal failed Raw:", error);
             if (error.logs) { 
                console.error("Withdrawal Transaction Logs (from error object):", error.logs);
            }
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            toast.error(`Withdrawal failed: ${errorMessage.substring(0, 60)}${errorMessage.length > 60 ? '...' : ''}`, { id: toastId });
        } finally {
            setIsWithdrawing(false);
        }

    }, [program, poolConfig, poolConfigPda, oracleData, publicKey, connection, signTransaction, onTransactionSuccess, priorityFee]);


    return {
        handleDeposit,
        handleWithdraw,
        isDepositing,
        isWithdrawing,
    };
} 