'use client';

import { useCallback, useState } from 'react';
import React from 'react';
import { BN, Program } from '@coral-xyz/anchor';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
    PublicKey, 
    SystemProgram, 
    SYSVAR_RENT_PUBKEY, 
    ComputeBudgetProgram,
    LAMPORTS_PER_SOL,
    Transaction,
    TransactionInstruction,
    Connection,
    TransactionError,
    VersionedTransaction
} from '@solana/web3.js'; 
import { 
    TOKEN_PROGRAM_ID, 
    ASSOCIATED_TOKEN_PROGRAM_ID, 
    getAssociatedTokenAddressSync, 
    createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
import { parseUnits } from 'ethers'; // Or your preferred BN library
import { PoolConfig } from '@/utils/types'; // Update import path
import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool'; // Update import path
import toast from "react-hot-toast";
import { findPoolAuthorityPDA, findPoolVaultPDA } from "../utils/pda"; // Use relative path
import { useSettings } from '@/contexts/SettingsContext'; // ADDED: Import useSettings
import { handleTransactionError } from '@/utils/transactionErrorHandling';
import { TRANSACTION_COMPUTE_UNITS, MIN_SOL_BALANCE_LAMPORTS } from '@/utils/constants';

interface UsePoolInteractionsProps {
    program: Program<WLiquifyPool> | null;
    poolConfig: PoolConfig | null;
    poolConfigPda: PublicKey | null; // Address of the PoolConfig account
    oracleData: { data: { address: string; priceFeedId: string }[] } | null;
    wLqiDecimals: number | null; // ADDED: To pass wLQI decimals
    onTransactionSuccess: (affectedMintAddress?: string) => Promise<void>;
    onClearInput: (mintAddress: string, action: 'deposit' | 'withdraw') => void;
}

// Update the helper function with proper typing
const handleTransactionConfirmation = async (
    confirmation: { value: { err: TransactionError | null } },
    program: Program<WLiquifyPool> | null,
    connection: Connection,
    txid: string,
    _toastId: string, 
    _action: 'Deposit' | 'Withdrawal'
) => {
    if (confirmation.value.err) {
        console.error(`${_action} Confirmation Error:`, confirmation.value.err);
        const errorMessage = await handleTransactionError({ 
            error: new Error(`${_action} transaction failed confirmation: ${JSON.stringify(confirmation.value.err)}`),
            program,
            connection,
            txid
        });
        toast.error(`${_action} failed: ${errorMessage}`, { 
            id: _toastId,
            style: {
                maxWidth: '90vw',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap'
            }
        });
        return false;
    }
    return true;
};

// Add this helper function after handleTransactionConfirmation
const showSuccessToast = (toastId: string, txid: string, action: 'Deposit' | 'Withdrawal') => {
    toast.success(
        React.createElement('div', null, [
            React.createElement('div', { key: 'message' }, `${action} successful!`),
            React.createElement('a', {
                key: 'link',
                href: `https://solscan.io/tx/${txid}?cluster=devnet`,
                target: '_blank',
                rel: 'noopener noreferrer',
                style: { color: '#4CAF50', textDecoration: 'underline' }
            }, 'View on Solscan')
        ]),
        { 
            id: toastId,
            style: {
                maxWidth: '90vw',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap'
            }
        }
    );
};

// Update the helper function to use the imported constant
const checkSolBalance = async (
    connection: Connection,
    publicKey: PublicKey,
    minSolBalanceLamports: number = MIN_SOL_BALANCE_LAMPORTS // Use imported constant
): Promise<boolean> => {
    try {
        const balance = await connection.getBalance(publicKey);
        if (balance < minSolBalanceLamports) {
            toast.error(`Insufficient SOL balance for transaction fees. Need ~${minSolBalanceLamports / LAMPORTS_PER_SOL} SOL.`);
            console.error(`Insufficient SOL balance: ${balance} lamports. Need ${minSolBalanceLamports} lamports.`);
            return false;
        }
        return true;
    } catch (balanceError) {
        toast.error("Could not verify SOL balance.");
        console.error("Failed to fetch SOL balance:", balanceError);
        return false;
    }
};

// Add this helper function after checkSolBalance
const validatePriceFeed = (
    tokenInfo: { mint: PublicKey; priceFeed: PublicKey } | undefined,
    mint: PublicKey,
    toastId: string,
    action: 'Deposit' | 'Withdrawal'
): boolean => {
    if (!tokenInfo || !tokenInfo.priceFeed || tokenInfo.priceFeed.equals(SystemProgram.programId)) {
        const errorMsg = `Price feed account not found or configured for ${action.toLowerCase()} token ${mint.toBase58()} in PoolConfig`;
        console.error(errorMsg);
        toast.error(errorMsg, { id: toastId });
        return false;
    }
    return true;
};

// Update the helper function to use the single constant
const buildTransactionWithComputeBudget = (
    connection: Connection,
    instructions: TransactionInstruction[],
    publicKey: PublicKey,
    priorityFee: number,
    computeUnits: number = TRANSACTION_COMPUTE_UNITS // Use single constant as default
): Promise<{ transaction: Transaction; blockhash: string; lastValidBlockHeight: number }> => {
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnits
    });
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFee
    });

    return new Promise(async (resolve, reject) => {
        try {
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            const transaction = new Transaction().add(
                modifyComputeUnits,
                addPriorityFee,
                ...instructions
            );
            transaction.feePayer = publicKey;
            transaction.recentBlockhash = blockhash;
            resolve({ transaction, blockhash, lastValidBlockHeight });
        } catch (error) {
            reject(error);
        }
    });
};

// Update the helper function's parameter type
const signAndSendTransaction = async (
    connection: Connection,
    transaction: Transaction,
    signTransaction: ((transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>) | undefined,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _toastId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _action: 'Deposit' | 'Withdrawal'
): Promise<{ txid: string; blockhash: string; lastValidBlockHeight: number }> => {
    if (!signTransaction) {
        throw new Error('Wallet does not support signing transactions');
    }
    const signedTransaction = await signTransaction(transaction);
    const txid = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: true,
    });
    return { txid, blockhash: transaction.recentBlockhash!, lastValidBlockHeight: 0 };
};

// Update the helper function's return type
const confirmTransaction = async (
    connection: Connection,
    txid: string,
    blockhash: string,
    lastValidBlockHeight: number,
    toastId: string,
    action: 'Deposit' | 'Withdrawal'
): Promise<{ value: { err: TransactionError | null } }> => {
    toast.loading(`Confirming ${action.toLowerCase()}... Tx: ${txid.substring(0, 8)}...`, { id: toastId });
    const confirmation = await connection.confirmTransaction({
        signature: txid,
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight
    }, 'confirmed');
    return confirmation;
};

// Add this helper function after confirmTransaction
const handleTransactionErrorWithToast = async (
    error: unknown,
    program: Program<WLiquifyPool> | null,
    connection: Connection,
    toastId: string,
    action: 'Deposit' | 'Withdrawal'
): Promise<void> => {
    console.error(`${action} failed Raw:`, error);
    const errorMessage = await handleTransactionError({ 
        error, 
        program,
        connection
    });
    toast.error(`${action} failed: ${errorMessage}`, { 
        id: toastId,
        style: {
            maxWidth: '90vw',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap'
        }
    });
};

// Update the helper function to remove signTransaction check
const validatePreFlightChecks = (
    program: Program<WLiquifyPool> | null,
    publicKey: PublicKey | null,
    poolConfig: PoolConfig | null,
    poolConfigPda: PublicKey | null,
    oracleData: { data: { address: string; priceFeedId: string }[] } | null,
    amountString?: string,
    isFullDelistedWithdraw: boolean = false
): { isValid: boolean; poolConfig: PoolConfig | null } => {
    if (!program || !publicKey || !poolConfig || !poolConfigPda || !oracleData) {
        toast.error("Program, wallet, or pool config not available.");
        console.error("Prerequisites not met:", { program:!!program, publicKey:!!publicKey, poolConfig:!!poolConfig, poolConfigPda:!!poolConfigPda });
        return { isValid: false, poolConfig: null };
    }

    if (!isFullDelistedWithdraw && (!amountString || parseFloat(amountString) <= 0)) {
        alert('Please enter a valid amount.');
        return { isValid: false, poolConfig: null };
    }

    return { isValid: true, poolConfig };
};

// Update the helper function's parameter type
const validateSignTransaction = (signTransaction: ((transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>) | undefined): boolean => {
    if (!signTransaction) {
        alert('Wallet does not support signing transactions.');
        console.error("Wallet adapter does not provide signTransaction method.");
        return false;
    }
    return true;
};

// Add this helper function after signAndSendTransaction
const createAtaIfNeeded = async (
    connection: Connection,
    publicKey: PublicKey,
    mint: PublicKey,
    preInstructions: TransactionInstruction[]
): Promise<void> => {
    const ata = getAssociatedTokenAddressSync(mint, publicKey);
    try {
        await connection.getAccountInfo(ata);
    } catch {
        // Assuming error means account not found
        console.log("ATA not found, creating:", ata.toBase58());
        preInstructions.push(
            createAssociatedTokenAccountInstruction(
                publicKey,           // Payer
                ata,                 // ATA address
                publicKey,           // Owner of the ATA
                mint                 // Mint
            )
        );
    }
};

// Add this helper function after logTransactionDetails
const handleTransactionSuccess = async (
    connection: Connection,
    txid: string,
    blockhash: string,
    lastValidBlockHeight: number,
    program: Program<WLiquifyPool> | null,
    toastId: string,
    action: 'Deposit' | 'Withdrawal',
    mintAddress: string | null,
    onTransactionSuccess: (affectedMintAddress?: string) => Promise<void>,
    onClearInput: (mintAddress: string, action: 'deposit' | 'withdraw') => void,
    setIsLoading: (value: boolean) => void
): Promise<boolean> => {
    const confirmation = await confirmTransaction(
        connection,
        txid,
        blockhash,
        lastValidBlockHeight,
        toastId,
        action
    );

    if (!await handleTransactionConfirmation(confirmation, program, connection, txid, toastId, action)) {
        setIsLoading(false);
        return false;
    }

    showSuccessToast(toastId, txid, action);
    
    if (mintAddress) {
        await onTransactionSuccess(mintAddress);
        onClearInput(mintAddress, action.toLowerCase() as 'deposit' | 'withdraw');
    } else {
        await onTransactionSuccess();
    }
    
    setIsLoading(false);
    return true;
};

// Add this helper function after handleTransactionSuccess
const handleTransactionErrorAndCleanup = async (
    error: unknown,
    program: Program<WLiquifyPool> | null,
    connection: Connection,
    toastId: string,
    action: 'Deposit' | 'Withdrawal',
    setIsLoading: (value: boolean) => void
): Promise<void> => {
    await handleTransactionErrorWithToast(error, program, connection, toastId, action);
    setIsLoading(false);
};

export function usePoolInteractions({ program, poolConfig, poolConfigPda, oracleData, wLqiDecimals, onTransactionSuccess, onClearInput }: UsePoolInteractionsProps) {
    const { connection } = useConnection();
    const wallet = useWallet();
    const { publicKey, signTransaction } = wallet;
    const { priorityFee } = useSettings(); // ADDED: Get priorityFee from context
    const [isDepositing, setIsDepositing] = useState(false);
    const [isWithdrawing, setIsWithdrawing] = useState(false);

    const handleDeposit = useCallback(async (mintAddress: string, amountString: string, decimals: number | null) => {
        if (!validateSignTransaction(signTransaction as ((transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>) | undefined)) {
            return;
        }

        // --- Pre-flight Checks ---
        const { isValid, poolConfig: validPoolConfig } = validatePreFlightChecks(
            program, 
            publicKey, 
            poolConfig, 
            poolConfigPda, 
            oracleData, 
            amountString
        );
        if (!isValid || !validPoolConfig) {
            return;
        }
        if (decimals === null) {
            toast.error("Token decimals not available.");
            return;
        }

        // --- Check SOL Balance ---
        if (!await checkSolBalance(connection, publicKey!)) {
            return;
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
            const userWliAta = getAssociatedTokenAddressSync(validPoolConfig!.wliMint, publicKey!);

            // Create user's wLQI ATA if it doesn't exist
            const preInstructions: TransactionInstruction[] = [];
            await createAtaIfNeeded(connection, publicKey!, validPoolConfig!.wliMint, preInstructions);

            // Find the specific price feed for the deposit mint
            const depositTokenInfo = validPoolConfig.supportedTokens.find(st => st.mint.equals(depositMint!));
            if (!validatePriceFeed(depositTokenInfo, depositMint!, toastId, 'Deposit')) {
                setIsDepositing(false);
                return;
            }
            const depositPriceFeedAccount = depositTokenInfo!.priceFeed;

            // --- Build Instructions (Compute Budget + Deposit) ---
            const depositInstruction = await program!.methods
                .deposit(amountBn)
                .accounts({ 
                    user: publicKey!,
                    userSourceAta: userSourceAta,
                    // @ts-expect-error // Keep suppression for deposit poolConfig if needed
                    poolConfig: poolConfigPda!,
                    poolAuthority: findPoolAuthorityPDA(),
                    wliMint: validPoolConfig!.wliMint,
                    userWliAta: userWliAta,
                    ownerFeeAccount: getAssociatedTokenAddressSync(validPoolConfig!.wliMint, validPoolConfig!.feeRecipient, true),
                    depositMint: depositMint,
                    targetTokenVaultAta: targetTokenVaultAta,
                    oracleAggregatorAccount: validPoolConfig!.oracleAggregatorAccount,
                    depositPriceFeed: depositPriceFeedAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY,
                })
                .instruction();

            // --- Create Transaction (Not Versioned) --- 
            const { transaction, blockhash, lastValidBlockHeight } = await buildTransactionWithComputeBudget(
                connection,
                [...preInstructions, depositInstruction],
                publicKey!,
                priorityFee,
                TRANSACTION_COMPUTE_UNITS // Use single constant
            );

            const { txid } = await signAndSendTransaction(
                connection,
                transaction,
                signTransaction,
                toastId,
                'Deposit'
            );

            if (!await handleTransactionSuccess(
                connection,
                txid,
                blockhash,
                lastValidBlockHeight,
                program,
                toastId,
                'Deposit',
                depositMint?.toBase58() ?? null,
                onTransactionSuccess,
                onClearInput,
                setIsDepositing
            )) {
                return;
            }

        } catch (error: unknown) {
            await handleTransactionErrorAndCleanup(
                error,
                program,
                connection,
                toastId,
                'Deposit',
                setIsDepositing
            );
        }
    }, [program, publicKey, poolConfig, poolConfigPda, oracleData, connection, signTransaction, onTransactionSuccess, priorityFee, onClearInput]);

    // --- handleWithdraw ---
    const handleWithdraw = useCallback(async (
        outputMintAddress: string, // Mint address of the token the user WANTS to receive
        wliAmountString: string,   // Amount of wLQI the user wants to BURN (or "0" for full delisted)
        isFullDelistedWithdraw: boolean = false, // ADDED: Flag for new mode
    ) => {
        if (!validateSignTransaction(signTransaction as ((transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>) | undefined)) {
            return;
        }

        // --- Pre-flight Checks ---
        const { isValid, poolConfig: validPoolConfig } = validatePreFlightChecks(
            program, 
            publicKey, 
            poolConfig, 
            poolConfigPda, 
            oracleData, 
            wliAmountString, 
            isFullDelistedWithdraw
        );
        if (!isValid || !validPoolConfig) {
            return;
        }

        // --- Check SOL Balance ---
        if (!await checkSolBalance(connection, publicKey!)) {
            return;
        }

        setIsWithdrawing(true);
        const toastId = toast.loading("Processing withdrawal...");
        let outputMint: PublicKey | null = null; // Keep track of the output mint

        try {
            outputMint = new PublicKey(outputMintAddress);

            // Use wLqiDecimals from props
            if (wLqiDecimals === null) {
                toast.error("wLQI decimals not available for withdrawal processing.");
                setIsWithdrawing(false); // Ensure loading state is reset
                return;
            }
            const wliAmountBn = isFullDelistedWithdraw ? new BN(0) : new BN(parseUnits(wliAmountString, wLqiDecimals).toString());

            // --- Find the specific token info for the OUTPUT mint ---
            const outputTokenInfo = validPoolConfig.supportedTokens.find(st => st.mint.equals(outputMint!));
            if (!validatePriceFeed(outputTokenInfo, outputMint!, toastId, 'Withdrawal')) {
                setIsWithdrawing(false);
                return;
            }
            const outputPriceFeedAccount = outputTokenInfo!.priceFeed;

            // --- Derive PDAs and ATAs ---
            const poolAuthorityPda = findPoolAuthorityPDA();
            const userWliAta = getAssociatedTokenAddressSync(validPoolConfig.wliMint, publicKey!);
            const userDestinationAta = getAssociatedTokenAddressSync(outputMint, publicKey!); // User's ATA for the output token
            const sourceTokenVaultAta = findPoolVaultPDA(poolAuthorityPda, outputMint); // Pool's vault for the output token
            const ownerFeeAccount = getAssociatedTokenAddressSync(validPoolConfig.wliMint, validPoolConfig.feeRecipient, true);

            // Create user's destination ATA if it doesn't exist
            const preInstructions: TransactionInstruction[] = [];
            await createAtaIfNeeded(connection, publicKey!, outputMint, preInstructions);

            // --- Build Instructions (Compute Budget + Withdraw) ---
            const withdrawInstruction = await program!.methods
                .withdraw(wliAmountBn, isFullDelistedWithdraw)
                .accounts({
                    user: publicKey!,
                    userWliAta: userWliAta,
                    // @ts-expect-error // IDL vs generated type mismatch for user_destination_ata key
                    user_destination_ata: userDestinationAta, // Use snake_case from IDL
                    feeRecipient: validPoolConfig.feeRecipient,
                    // Removed unused @ts-expect-error for pool_config
                    pool_config: poolConfigPda!, 
                    poolAuthority: poolAuthorityPda,
                    wliMint: validPoolConfig.wliMint,
                    ownerFeeAccount: ownerFeeAccount,
                    withdrawMint: outputMint, // Renamed
                    sourceTokenVaultAta: sourceTokenVaultAta,
                    oracleAggregatorAccount: validPoolConfig.oracleAggregatorAccount, // Added
                    withdrawPriceFeed: outputPriceFeedAccount, // Use output token's feed
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY,
                })
                .instruction();

            // --- Create Transaction (Standard Transaction) ---
            const { transaction, blockhash, lastValidBlockHeight } = await buildTransactionWithComputeBudget(
                connection,
                [...preInstructions, withdrawInstruction],
                publicKey!,
                priorityFee,
                TRANSACTION_COMPUTE_UNITS // Use single constant
            );

            const { txid } = await signAndSendTransaction(
                connection,
                transaction,
                signTransaction,
                toastId,
                'Withdrawal'
            );

            if (!await handleTransactionSuccess(
                connection,
                txid,
                blockhash,
                lastValidBlockHeight,
                program,
                toastId,
                'Withdrawal',
                outputMint?.toBase58() ?? null,
                onTransactionSuccess,
                onClearInput,
                setIsWithdrawing
            )) {
                return;
            }

        } catch (error: unknown) {
            await handleTransactionErrorAndCleanup(
                error,
                program,
                connection,
                toastId,
                'Withdrawal',
                setIsWithdrawing
            );
        }
    }, [program, publicKey, poolConfig, poolConfigPda, oracleData, connection, signTransaction, onTransactionSuccess, priorityFee, onClearInput, wLqiDecimals]); // Replaced wallet with publicKey, signTransaction, ADDED wLqiDecimals

    return {
        handleDeposit,
        handleWithdraw,
        isDepositing,
        isWithdrawing,
    };
} 