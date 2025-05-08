'use client';

import { useCallback, useState } from 'react';
import { BN, Program } from '@coral-xyz/anchor';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
    PublicKey, 
    SystemProgram, 
    SYSVAR_RENT_PUBKEY, 
    ComputeBudgetProgram,
    LAMPORTS_PER_SOL,
    Transaction,
    TransactionInstruction
} from '@solana/web3.js'; 
import { 
    TOKEN_PROGRAM_ID, 
    ASSOCIATED_TOKEN_PROGRAM_ID, 
    getAssociatedTokenAddressSync, 
    getMint, 
    createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
import { parseUnits } from 'ethers'; // Or your preferred BN library
import { PoolConfig } from '@/utils/types'; // Update import path
import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool'; // Update import path
import toast from "react-hot-toast";
import { findPoolAuthorityPDA, findPoolVaultPDA } from "../utils/pda"; // Use relative path
import { useSettings } from '@/contexts/SettingsContext'; // ADDED: Import useSettings
import { handleTransactionError } from '@/utils/transactionErrorHandling';

interface UsePoolInteractionsProps {
    program: Program<WLiquifyPool> | null;
    poolConfig: PoolConfig | null;
    poolConfigPda: PublicKey | null; // Address of the PoolConfig account
    oracleData: { data: { address: string; priceFeedId: string }[] } | null;
    onTransactionSuccess: (affectedMintAddress?: string) => Promise<void>;
    onClearInput: (mintAddress: string, action: 'deposit' | 'withdraw') => void;
}

export function usePoolInteractions({ program, poolConfig, poolConfigPda, oracleData, onTransactionSuccess, onClearInput }: UsePoolInteractionsProps) {
    const { connection } = useConnection();
    const wallet = useWallet();
    const { publicKey, signTransaction } = wallet;
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
        if (!signTransaction) {
             alert('Wallet does not support signing transactions.');
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
            const poolConfigAddress = poolConfigPda!;

            console.log("Depositing:", {
                user: publicKey!.toBase58(),
                poolConfig: poolConfigAddress.toBase58(),
                poolAuthority: poolAuthorityPda.toBase58(),
                tokenMint: depositMint.toBase58(),
                poolVault: targetTokenVaultAta.toBase58(),
                userTokenAccount: userSourceAta.toBase58(),
                amount: amountBn.toString(),
            });

            // Find the specific price feed for the deposit mint
            const depositTokenInfo = poolConfig.supportedTokens.find(st => st.mint.equals(depositMint!));
            if (!depositTokenInfo || !depositTokenInfo.priceFeed || depositTokenInfo.priceFeed.equals(SystemProgram.programId)) {
                const errorMsg = `Price feed account not found or configured for deposit token ${depositMint.toBase58()} in PoolConfig`;
                console.error(errorMsg);
                toast.error(errorMsg, { id: toastId });
                setIsDepositing(false);
                throw new Error(errorMsg);
            }
            const depositPriceFeedAccount = depositTokenInfo.priceFeed;

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
                    // @ts-expect-error // Keep suppression for deposit poolConfig if needed
                    poolConfig: poolConfigPda!,
                    poolAuthority: findPoolAuthorityPDA(),
                    wliMint: poolConfig!.wliMint,
                    userWliAta: getAssociatedTokenAddressSync(poolConfig!.wliMint, publicKey!),
                    ownerFeeAccount: getAssociatedTokenAddressSync(poolConfig!.wliMint, poolConfig!.feeRecipient, true),
                    depositMint: depositMint,
                    targetTokenVaultAta: targetTokenVaultAta,
                    oracleAggregatorAccount: poolConfig!.oracleAggregatorAccount,
                    depositPriceFeed: depositPriceFeedAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY,
                })
                .instruction();

            // --- Create Transaction (Not Versioned) --- 
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            const transaction = new Transaction().add(
                modifyComputeUnits, // Add CU limit instruction
                addPriorityFee,     // Add priority fee instruction
                depositInstruction  // The main deposit instruction
            );
            transaction.feePayer = publicKey!;
            transaction.recentBlockhash = blockhash;

            console.log("Signing transaction...");

            // --- Sign and Send --- 
            const signedTransaction = await signTransaction(transaction);
            console.log("Sending transaction...");
            // Use sendRawTransaction for legacy Transaction
            const txid = await connection.sendRawTransaction(signedTransaction.serialize(), {
                skipPreflight: true, // Keep skipPreflight for potentially complex txns
            });
            // --- REMOVED connection.sendTransaction check for deposit --- 
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
                const errorMessage = await handleTransactionError({ 
                    error: new Error(`Transaction failed confirmation: ${JSON.stringify(confirmation.value.err)}`),
                    program,
                    connection,
                    txid
                });
                toast.error(`Deposit failed: ${errorMessage}`, { 
                    id: toastId,
                    style: {
                        maxWidth: '90vw',
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap'
                    }
                });
                setIsDepositing(false);
                return;
            }

            console.log('Deposit successful!');
            toast.success(`Deposit successful! Tx: ${txid.substring(0, 8)}...`, { 
                id: toastId,
                style: {
                    maxWidth: '90vw',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap'
                }
            });
            // --- ADDED: Trigger balance refresh and clear input --- 
            if (depositMint) {
                await onTransactionSuccess(depositMint.toBase58());
                onClearInput(depositMint.toBase58(), 'deposit'); // Clear deposit input
            } else {
                 await onTransactionSuccess(); // Refresh wLQI at least (shouldn't happen here)
            }
            // --- END ADD --- 

        } catch (error: unknown) {
            console.error("Deposit failed Raw:", error);
            const errorMessage = await handleTransactionError({ 
                error, 
                program,
                connection
            });
            toast.error(`Deposit failed: ${errorMessage}`, { 
                id: toastId,
                style: {
                    maxWidth: '90vw',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap'
                }
            });

        } finally {
            setIsDepositing(false);
        }
    }, [program, publicKey, poolConfig, poolConfigPda, oracleData, connection, signTransaction, onTransactionSuccess, priorityFee, wallet, onClearInput]);

    // --- handleWithdraw ---
    const handleWithdraw = useCallback(async (
        outputMintAddress: string, // Mint address of the token the user WANTS to receive
        wliAmountString: string,   // Amount of wLQI the user wants to BURN (or "0" for full delisted)
        // decimals: number | null // REMOVED - wLQI decimals are fetched from poolConfig
        isFullDelistedWithdraw: boolean = false, // ADDED: Flag for new mode
        // Removed erroneous oracleData parameter
    ) => {
        // --- Pre-flight Checks ---
        // FIX: Check base prerequisites first
        if (!program || !publicKey || !poolConfig || !poolConfigPda || !oracleData) {
            toast.error("Program, wallet, or pool config not available for withdrawal.");
            console.error("Withdraw prerequisites met:", { program:!!program, publicKey:!!publicKey, poolConfig:!!poolConfig, poolConfigPda:!!poolConfigPda });
            return;
        }
        // REFACTOR: Check wliAmountString ONLY if it's NOT a full delisted withdrawal
        if (!isFullDelistedWithdraw && (!wliAmountString || parseFloat(wliAmountString) <= 0)) {
            alert('Please enter a valid wLQI amount to withdraw.');
            return;
        }
        if (!signTransaction) {
             alert('Wallet does not support signing transactions.');
             console.error("Wallet adapter does not provide signTransaction method.");
             return;
        }

        // --- Check SOL Balance (same as deposit) ---
        const minSolBalanceLamports = 100000; 
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
            return;
        }


        setIsWithdrawing(true);
        const toastId = toast.loading("Processing withdrawal...");
        let outputMint: PublicKey | null = null; // Keep track of the output mint

        try {
            outputMint = new PublicKey(outputMintAddress);
            // FIX: Fetch wLQI decimals using getMint
            const wliMintInfo = await getMint(connection, poolConfig.wliMint);
            const wliDecimals = wliMintInfo.decimals;
            if (typeof wliDecimals !== 'number') { // Add check after fetching
                toast.error("Could not determine wLQI decimals.");
                throw new Error('wLQI decimals not found');
            }
            const wliAmountBn = isFullDelistedWithdraw ? new BN(0) : new BN(parseUnits(wliAmountString, wliDecimals).toString());

            // --- Find the specific token info for the OUTPUT mint ---
            const outputTokenInfo = poolConfig.supportedTokens.find(st => st.mint.equals(outputMint!));
            if (!outputTokenInfo || !outputTokenInfo.priceFeed || outputTokenInfo.priceFeed.equals(SystemProgram.programId)) {
                const errorMsg = `Price feed account not found or configured for output token ${outputMint.toBase58()} in PoolConfig`;
                console.error(errorMsg);
                toast.error(errorMsg, { id: toastId });
                setIsWithdrawing(false);
                throw new Error(errorMsg);
            }
            const outputPriceFeedAccount = outputTokenInfo.priceFeed;

            // --- Derive PDAs and ATAs ---
            const poolAuthorityPda = findPoolAuthorityPDA();
            const userWliAta = getAssociatedTokenAddressSync(poolConfig.wliMint, publicKey!);
            const userDestinationAta = getAssociatedTokenAddressSync(outputMint, publicKey!); // User's ATA for the output token
            const sourceTokenVaultAta = findPoolVaultPDA(poolAuthorityPda, outputMint); // Pool's vault for the output token
            const ownerFeeAccount = getAssociatedTokenAddressSync(poolConfig.wliMint, poolConfig.feeRecipient, true);
            const poolConfigAddress = poolConfigPda!;

            console.log("Withdrawing (wLQI):", {
                user: publicKey!.toBase58(),
                poolConfig: poolConfigAddress.toBase58(),
                poolAuthority: poolAuthorityPda.toBase58(),
                wLqiMint: poolConfig.wliMint.toBase58(),
                outputTokenMint: outputMint.toBase58(),
                userWliAta: userWliAta.toBase58(),
                userDestinationAta: userDestinationAta.toBase58(),
                poolTokenVault: sourceTokenVaultAta.toBase58(),
                wliAmountToBurn: wliAmountBn.toString(),
            });

            // --- Create User Destination ATA if it doesn't exist ---
            const preInstructions: TransactionInstruction[] = [];
            try {
                await connection.getAccountInfo(userDestinationAta);
            } catch {
                // Assuming error means account not found
                console.log("User destination ATA not found, creating:", userDestinationAta.toBase58());
                preInstructions.push(
                    createAssociatedTokenAccountInstruction(
                        publicKey!,           // Payer
                        userDestinationAta,   // ATA address
                        publicKey!,           // Owner of the ATA
                        outputMint            // Mint
                    )
                );
            }

            // --- Build Instructions (Compute Budget + Withdraw) ---
            const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
                units: 1400000 // Withdraw might need more than deposit
            });
            const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: priorityFee
            });

            const withdrawInstruction = await program!.methods
                .withdraw(wliAmountBn, isFullDelistedWithdraw) // Pass BOTH arguments
                .accounts({
                    user: publicKey!,
                    userWliAta: userWliAta,
                    // @ts-expect-error // IDL vs generated type mismatch for user_destination_ata key
                    user_destination_ata: userDestinationAta, // Use snake_case from IDL
                    feeRecipient: poolConfig.feeRecipient,
                    // Removed unused @ts-expect-error for pool_config
                    pool_config: poolConfigPda!, 
                    poolAuthority: poolAuthorityPda,
                    wliMint: poolConfig.wliMint,
                    ownerFeeAccount: ownerFeeAccount,
                    withdrawMint: outputMint, // Renamed
                    sourceTokenVaultAta: sourceTokenVaultAta,
                    oracleAggregatorAccount: poolConfig.oracleAggregatorAccount, // Added
                    withdrawPriceFeed: outputPriceFeedAccount, // Use output token's feed
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY,
                })
                .instruction();

            // --- Create Transaction (Standard Transaction) ---
            // REFACTOR: Use standard Transaction, remove LUT logic
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            const transaction = new Transaction();

            // Add pre-instructions first if any (e.g., create ATA)
            if (preInstructions.length > 0) {
                transaction.add(...preInstructions);
            }

            transaction.add(
                modifyComputeUnits,
                addPriorityFee,
                withdrawInstruction
            );
            transaction.feePayer = publicKey!;
            transaction.recentBlockhash = blockhash;

            console.log("Signing withdrawal transaction...");
            const signedTransaction = await signTransaction(transaction);
            console.log("Sending withdrawal transaction...");
            const txid = await connection.sendRawTransaction(signedTransaction.serialize(), {
                skipPreflight: true,
            });
            console.log("Withdrawal transaction sent, signature:", txid);

            // --- Confirm Transaction ---
            console.log("Confirming withdrawal transaction...");
            toast.loading(`Confirming withdrawal... Tx: ${txid.substring(0, 8)}...`, { id: toastId });
            const confirmation = await connection.confirmTransaction({
                signature: txid,
                blockhash: blockhash,
                lastValidBlockHeight: lastValidBlockHeight
             }, 'confirmed');

            if (confirmation.value.err) {
                console.error('Withdrawal Confirmation Error:', confirmation.value.err);
                const errorMessage = await handleTransactionError({ 
                    error: new Error(`Withdrawal transaction failed confirmation: ${JSON.stringify(confirmation.value.err)}`),
                    program,
                    connection,
                    txid
                });
                toast.error(`Withdrawal failed: ${errorMessage}`, { 
                    id: toastId,
                    style: {
                        maxWidth: '90vw',
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap'
                    }
                });
                setIsWithdrawing(false);
                return;
            }

            console.log('Withdrawal successful!');
            toast.success(`Withdrawal successful! Tx: ${txid.substring(0, 8)}...`, { 
                id: toastId,
                style: {
                    maxWidth: '90vw',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap'
                }
            });
            // --- ADDED: Trigger balance refresh and clear input --- 
            if (outputMint) {
                 await onTransactionSuccess(outputMint.toBase58());
                 onClearInput(outputMint.toBase58(), 'withdraw'); // Clear withdraw input for this token row
            } else {
                await onTransactionSuccess(); // Should always have mint, but refresh wLQI as fallback
            }
             // --- END ADD --- 

        } catch (error: unknown) {
            console.error("Withdrawal failed Raw:", error);
            const errorMessage = await handleTransactionError({ 
                error, 
                program,
                connection
            });
            toast.error(`Withdrawal failed: ${errorMessage}`, { 
                id: toastId,
                style: {
                    maxWidth: '90vw',
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap'
                }
            });

        } finally {
            setIsWithdrawing(false);
        }
        // REFACTOR: Update dependencies array
    }, [program, publicKey, poolConfig, poolConfigPda, oracleData, connection, signTransaction, onTransactionSuccess, priorityFee, onClearInput]); // Replaced wallet with publicKey, signTransaction

    return {
        handleDeposit,
        handleWithdraw,
        isDepositing,
        isWithdrawing,
    };
} 