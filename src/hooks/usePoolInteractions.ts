'use client';

import { useCallback, useState } from 'react';
import { BN, Program } from '@coral-xyz/anchor';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
    PublicKey, 
    SystemProgram, 
    SYSVAR_RENT_PUBKEY, 
    Transaction,
    TransactionInstruction,
    VersionedTransaction
} from '@solana/web3.js'; 
import { 
    TOKEN_PROGRAM_ID, 
    ASSOCIATED_TOKEN_PROGRAM_ID, 
    getAssociatedTokenAddressSync, 
} from '@solana/spl-token';
import { parseUnits } from 'ethers';
import { PoolConfig } from '@/utils/core/types';
import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool';
import toast from "react-hot-toast";
import { findPoolAuthorityPDA, findPoolVaultPDA } from "@/utils/solana/pda";
import { useSettings } from '@/contexts/SettingsContext';
import { TRANSACTION_COMPUTE_UNITS } from '@/utils/core/constants';
import i18next from 'i18next';

import {
    checkSolBalance,
    validatePriceFeed,
    buildTransactionWithComputeBudget,
    signAndSendTransaction,
    validatePreFlightChecks,
    validateSignTransaction,
    createAtaIfNeeded,
    handleTransactionSuccess,
    handleTransactionErrorAndCleanup
} from '@/utils/solana/interactionUtils';

interface UsePoolInteractionsProps {
    program: Program<WLiquifyPool> | null;
    poolConfig: PoolConfig | null;
    poolConfigPda: PublicKey | null;
    oracleData: { data: { address: string; priceFeedId: string }[] } | null;
    wLqiDecimals: number | null;
    onTransactionSuccess: (affectedMintAddress?: string) => Promise<void>;
    onClearInput: (mintAddress: string, action: 'deposit' | 'withdraw') => void;
}

const t = i18next.t.bind(i18next);

export function usePoolInteractions({ program, poolConfig, poolConfigPda, oracleData, wLqiDecimals, onTransactionSuccess, onClearInput }: UsePoolInteractionsProps) {
    const { connection } = useConnection();
    const wallet = useWallet();
    const { publicKey, signTransaction } = wallet;
    const { priorityFee, preferredExplorer, explorerOptions } = useSettings();
    const [isDepositing, setIsDepositing] = useState(false);
    const [isWithdrawing, setIsWithdrawing] = useState(false);

    const handleDeposit = useCallback(async (mintAddress: string, amountString: string, decimals: number | null) => {
        if (!validateSignTransaction(signTransaction as ((transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>) | undefined)) {
            return;
        }

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
            toast.error(t('poolInteractions.tokenDecimalsMissing'));
            return;
        }

        if (!await checkSolBalance(connection, publicKey!)) {
            return;
        }

        setIsDepositing(true);
        const toastId = toast.loading(t('poolInteractions.processingDeposit'));
        let depositMint: PublicKey | null = null;

        try {
            depositMint = new PublicKey(mintAddress);
            const amountBn = new BN(parseUnits(amountString, decimals!).toString());

            const poolAuthorityPda = findPoolAuthorityPDA();
            const userSourceAta = getAssociatedTokenAddressSync(depositMint, publicKey!);
            const targetTokenVaultAta = findPoolVaultPDA(poolAuthorityPda, depositMint);
            const userWliAta = getAssociatedTokenAddressSync(validPoolConfig!.wliMint, publicKey!);

            const preInstructions: TransactionInstruction[] = [];
            await createAtaIfNeeded(connection, publicKey!, validPoolConfig!.wliMint, preInstructions);

            const depositTokenInfo = validPoolConfig.supportedTokens.find(st => st.mint.equals(depositMint!));
            if (!validatePriceFeed(depositTokenInfo, depositMint!, toastId, 'Deposit')) {
                setIsDepositing(false);
                return;
            }
            const depositPriceFeedAccount = depositTokenInfo!.priceFeed;

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

            const { transaction, blockhash, lastValidBlockHeight } = await buildTransactionWithComputeBudget(
                connection,
                [...preInstructions, depositInstruction],
                publicKey!,
                priorityFee,
                TRANSACTION_COMPUTE_UNITS
            );

            const { txid } = await signAndSendTransaction(
                connection,
                transaction,
                signTransaction
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
                setIsDepositing,
                preferredExplorer,
                explorerOptions
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
    }, [program, publicKey, poolConfig, poolConfigPda, oracleData, connection, signTransaction, onTransactionSuccess, priorityFee, onClearInput, preferredExplorer, explorerOptions]);

    const handleWithdraw = useCallback(async (
        outputMintAddress: string,
        wliAmountString: string,
        isFullDelistedWithdraw: boolean = false,
    ) => {
        if (!validateSignTransaction(signTransaction as ((transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>) | undefined)) {
            return;
        }

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

        if (!await checkSolBalance(connection, publicKey!)) {
            return;
        }

        setIsWithdrawing(true);
        const toastId = toast.loading(t('poolInteractions.processingWithdrawal'));
        let outputMint: PublicKey | null = null;

        try {
            outputMint = new PublicKey(outputMintAddress);

            if (wLqiDecimals === null) {
                toast.error(t('poolInteractions.wlqiDecimalsMissing'));
                setIsWithdrawing(false);
                return;
            }
            const wliAmountBn = isFullDelistedWithdraw ? new BN(0) : new BN(parseUnits(wliAmountString, wLqiDecimals).toString());

            const outputTokenInfo = validPoolConfig.supportedTokens.find(st => st.mint.equals(outputMint!));
            if (!validatePriceFeed(outputTokenInfo, outputMint!, toastId, 'Withdrawal')) {
                setIsWithdrawing(false);
                return;
            }
            const outputPriceFeedAccount = outputTokenInfo!.priceFeed;

            const poolAuthorityPda = findPoolAuthorityPDA();
            const userWliAta = getAssociatedTokenAddressSync(validPoolConfig.wliMint, publicKey!);
            const userDestinationAta = getAssociatedTokenAddressSync(outputMint, publicKey!);
            const sourceTokenVaultAta = findPoolVaultPDA(poolAuthorityPda, outputMint);
            const ownerFeeAccount = getAssociatedTokenAddressSync(validPoolConfig.wliMint, validPoolConfig.feeRecipient, true);

            const preInstructions: TransactionInstruction[] = [];
            await createAtaIfNeeded(connection, publicKey!, outputMint, preInstructions);

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
                    withdrawMint: outputMint,
                    sourceTokenVaultAta: sourceTokenVaultAta,
                    oracleAggregatorAccount: validPoolConfig.oracleAggregatorAccount,
                    withdrawPriceFeed: outputPriceFeedAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY,
                })
                .instruction();

            const { transaction, blockhash, lastValidBlockHeight } = await buildTransactionWithComputeBudget(
                connection,
                [...preInstructions, withdrawInstruction],
                publicKey!,
                priorityFee,
                TRANSACTION_COMPUTE_UNITS
            );

            const { txid } = await signAndSendTransaction(
                connection,
                transaction,
                signTransaction
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
                setIsWithdrawing,
                preferredExplorer,
                explorerOptions
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
    }, [program, publicKey, poolConfig, poolConfigPda, oracleData, connection, signTransaction, onTransactionSuccess, priorityFee, onClearInput, preferredExplorer, explorerOptions, wLqiDecimals]);

    return {
        handleDeposit,
        handleWithdraw,
        isDepositing,
        isWithdrawing,
    };
} 