import React from 'react';
import { Program } from '@coral-xyz/anchor';
import {
    PublicKey,
    SystemProgram,
    ComputeBudgetProgram,
    LAMPORTS_PER_SOL,
    Transaction,
    TransactionInstruction,
    Connection,
    TransactionError,
    VersionedTransaction
} from '@solana/web3.js';
import {
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddressSync
} from '@solana/spl-token';
import toast from "react-hot-toast";
import i18next from 'i18next';

import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool';
import { PoolConfig } from '@/utils/types';
import { handleTransactionError } from '@/utils/transactionErrorHandling';
import { TRANSACTION_COMPUTE_UNITS, MIN_SOL_BALANCE_LAMPORTS, EXPLORER_CLUSTER, DEFAULT_EXPLORER_OPTIONS, DEFAULT_PREFERRED_EXPLORER } from '@/utils/constants';

const t = i18next.t.bind(i18next);

export const handleTransactionConfirmation = async (
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
        toast.error(t('poolInteractions.failed', { action: _action, errorMessage }), {
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

export const showSuccessToast = (toastId: string, txid: string, action: 'Deposit' | 'Withdrawal', preferredExplorer: string, explorerOptions: typeof DEFAULT_EXPLORER_OPTIONS) => {
    const explorerInfo = explorerOptions[preferredExplorer] || explorerOptions[DEFAULT_PREFERRED_EXPLORER];
    const clusterQueryParam = explorerInfo.getClusterQueryParam(EXPLORER_CLUSTER);
    const explorerUrl = explorerInfo.urlTemplate
        .replace('{txId}', txid)
        .replace('{cluster}', clusterQueryParam);

    toast.success(
        React.createElement('div', null, [
            React.createElement('div', { key: 'message' }, t('poolInteractions.success', { action })),
            React.createElement('a', {
                key: 'link',
                href: explorerUrl,
                target: '_blank',
                rel: 'noopener noreferrer',
                style: { color: '#4CAF50', textDecoration: 'underline' }
            }, t('poolInteractions.viewOnExplorer', { explorerName: explorerInfo.name }))
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

export const checkSolBalance = async (
    connection: Connection,
    publicKey: PublicKey,
    minSolBalanceLamports: number = MIN_SOL_BALANCE_LAMPORTS
): Promise<boolean> => {
    try {
        const balance = await connection.getBalance(publicKey);
        if (balance < minSolBalanceLamports) {
            toast.error(t('poolInteractions.insufficientSol', { amount: minSolBalanceLamports / LAMPORTS_PER_SOL }));
            console.error(`Insufficient SOL balance: ${balance} lamports. Need ${minSolBalanceLamports} lamports.`);
            return false;
        }
        return true;
    } catch (balanceError) {
        toast.error(t('poolInteractions.couldNotVerifySol'));
        console.error('Failed to fetch SOL balance:', balanceError);
        return false;
    }
};

export const validatePriceFeed = (
    tokenInfo: { mint: PublicKey; priceFeed: PublicKey } | undefined,
    mint: PublicKey,
    toastId: string,
    action: 'Deposit' | 'Withdrawal'
): boolean => {
    if (!tokenInfo || !tokenInfo.priceFeed || tokenInfo.priceFeed.equals(SystemProgram.programId)) {
        const errorMsg = t('poolInteractions.priceFeedNotFound', { action, mint: mint.toBase58() });
        console.error(errorMsg);
        toast.error(errorMsg, { id: toastId });
        return false;
    }
    return true;
};

export const buildTransactionWithComputeBudget = (
    connection: Connection,
    instructions: TransactionInstruction[],
    publicKey: PublicKey,
    priorityFee: number,
    computeUnits: number = TRANSACTION_COMPUTE_UNITS
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

export const signAndSendTransaction = async (
    connection: Connection,
    transaction: Transaction,
    signTransaction: ((transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>) | undefined
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

export const confirmTransaction = async (
    connection: Connection,
    txid: string,
    blockhash: string,
    lastValidBlockHeight: number,
    toastId: string,
    action: 'Deposit' | 'Withdrawal'
): Promise<{ value: { err: TransactionError | null } }> => {
    const actionKey = action === 'Deposit' ? 'depositAction' : 'withdrawalAction';
    toast.loading(t('poolInteractions.confirming', { action: t(`poolInteractions.${actionKey}`), txid: txid.substring(0, 8) }), { id: toastId });
    const confirmation = await connection.confirmTransaction({
        signature: txid,
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight
    }, 'confirmed');
    return confirmation;
};

export const handleTransactionErrorWithToast = async (
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
    toast.error(t('poolInteractions.failed', { action, errorMessage }), {
        id: toastId,
        style: {
            maxWidth: '90vw',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap'
        }
    });
};

export const validatePreFlightChecks = (
    program: Program<WLiquifyPool> | null,
    publicKey: PublicKey | null,
    poolConfig: PoolConfig | null,
    poolConfigPda: PublicKey | null,
    oracleData: { data: { address: string; priceFeedId: string }[] } | null,
    amountString?: string,
    isFullDelistedWithdraw: boolean = false
): { isValid: boolean; poolConfig: PoolConfig | null } => {
    if (!program || !publicKey || !poolConfig || !poolConfigPda || !oracleData) {
        toast.error(t('poolInteractions.programWalletPoolConfigMissing'));
        console.error('Prerequisites not met:', { program:!!program, publicKey:!!publicKey, poolConfig:!!poolConfig, poolConfigPda:!!poolConfigPda });
        return { isValid: false, poolConfig: null };
    }

    if (!isFullDelistedWithdraw && (!amountString || parseFloat(amountString) <= 0)) {
        alert(t('poolInteractions.enterValidAmount'));
        return { isValid: false, poolConfig: null };
    }

    return { isValid: true, poolConfig };
};

export const validateSignTransaction = (signTransaction: ((transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>) | undefined): boolean => {
    if (!signTransaction) {
        alert(t('poolInteractions.walletNoSign'));
        console.error('Wallet adapter does not provide signTransaction method.');
        return false;
    }
    return true;
};

export const createAtaIfNeeded = async (
    connection: Connection,
    publicKey: PublicKey,
    mint: PublicKey,
    preInstructions: TransactionInstruction[]
): Promise<void> => {
    const ata = getAssociatedTokenAddressSync(mint, publicKey);
    try {
        const accountInfo = await connection.getAccountInfo(ata);
        if (accountInfo === null) { // Explicitly check for null, as getAccountInfo can return null for non-existent accounts
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
    } catch (e) {
         // Catching errors if getAccountInfo fails for reasons other than non-existence (though typically it returns null)
        console.log("Error checking ATA, assuming it doesn't exist and creating:", ata.toBase58(), e);
        preInstructions.push(
            createAssociatedTokenAccountInstruction(
                publicKey,
                ata,
                publicKey,
                mint
            )
        );
    }
};

export const handleTransactionSuccess = async (
    connection: Connection,
    txid: string,
    blockhash: string,
    lastValidBlockHeight: number,
    program: Program<WLiquifyPool> | null,
    toastId: string,
    action: 'Deposit' | 'Withdrawal',
    mintAddress: string | null,
    onTransactionSuccessFn: (affectedMintAddress?: string) => Promise<void>,
    onClearInput: (mintAddress: string, action: 'deposit' | 'withdraw') => void,
    setIsLoading: (value: boolean) => void,
    preferredExplorer: string,
    explorerOptions: typeof DEFAULT_EXPLORER_OPTIONS
): Promise<boolean> => {
    const confirmationResult = await confirmTransaction( // Renamed to avoid conflict
        connection,
        txid,
        blockhash,
        lastValidBlockHeight,
        toastId,
        action
    );

    if (!await handleTransactionConfirmation(confirmationResult, program, connection, txid, toastId, action)) {
        setIsLoading(false);
        return false;
    }

    showSuccessToast(toastId, txid, action, preferredExplorer, explorerOptions);

    if (mintAddress) {
        await onTransactionSuccessFn(mintAddress);
        onClearInput(mintAddress, action.toLowerCase() as 'deposit' | 'withdraw');
    } else {
        await onTransactionSuccessFn();
    }

    setIsLoading(false);
    return true;
};

export const handleTransactionErrorAndCleanup = async (
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