import React from 'react';
import { Program } from '@coral-xyz/anchor';
import {
    PublicKey,
    ComputeBudgetProgram,
    Connection,
    Transaction,
    TransactionInstruction,
    TransactionError,
    VersionedTransaction
} from '@solana/web3.js';
import toast from "react-hot-toast";
import i18next from 'i18next';

import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool';
import { handleTransactionError } from '@/utils/solana/transactionErrorHandling';
import { TRANSACTION_COMPUTE_UNITS, EXPLORER_CLUSTER, DEFAULT_EXPLORER_OPTIONS, DEFAULT_PREFERRED_EXPLORER } from '@/utils/core/constants';

const t = i18next.t.bind(i18next);

// Internal or utility functions first
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

const showSuccessToast = (toastId: string, txid: string, action: 'Deposit' | 'Withdrawal', preferredExplorer: string, explorerOptions: typeof DEFAULT_EXPLORER_OPTIONS) => {
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

const confirmTransactionInternal = async (
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

const handleTransactionErrorWithToastInternal = async (
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

// Exported functions
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
    return { txid, blockhash: transaction.recentBlockhash!, lastValidBlockHeight: 0 }; // lastValidBlockHeight might not be available directly, set to 0 or fetch if needed by consumer
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
    const confirmationResult = await confirmTransactionInternal(
        connection,
        txid,
        blockhash,
        lastValidBlockHeight,
        toastId,
        action
    );

    if (!(await handleTransactionConfirmation(confirmationResult, program, connection, txid, toastId, action))) {
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
    await handleTransactionErrorWithToastInternal(error, program, connection, toastId, action);
    setIsLoading(false);
}; 