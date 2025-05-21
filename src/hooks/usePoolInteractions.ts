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
import { PoolConfig, ProcessedTokenData, DecodedPriceData } from '@/utils/core/types';
import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool';
import toast from "react-hot-toast";
import { findPoolAuthorityPDA, findPoolVaultPDA } from "@/utils/solana/pda";
import { useSettings } from '@/contexts/SettingsContext';
import { TRANSACTION_COMPUTE_UNITS, BPS_SCALE } from '@/utils/core/constants';
import i18next from 'i18next';

import { createAtaIfNeeded } from '@/utils/solana/ataUtils';
import {
    checkSolBalance,
    validatePriceFeed,
    validatePreFlightChecks,
    validateSignTransaction
} from '@/utils/solana/transactionValidation';
import {
    buildTransactionWithComputeBudget,
    signAndSendTransaction,
    handleTransactionSuccess,
    handleTransactionErrorAndCleanup
} from '@/utils/solana/transactionLifecycle';
import { calculateTokenValueUsdScaled, calculateWLqiValue } from '@/utils/app/calculations';

interface UsePoolInteractionsProps {
    program: Program<WLiquifyPool> | null;
    poolConfig: PoolConfig | null;
    poolConfigPda: PublicKey | null;
    oracleData: { data: { address: string; priceFeedId: string }[] } | null;
    processedTokenData: ProcessedTokenData[] | null;
    wLqiDecimals: number | null;
    wLqiSupply: BN | null;
    onTransactionSuccess: (affectedMintAddress?: string) => Promise<void>;
    onClearInput: (mintAddress: string, action: 'deposit' | 'withdraw') => void;
}

const t = i18next.t.bind(i18next);

export function usePoolInteractions({ program, poolConfig, poolConfigPda, oracleData, processedTokenData, wLqiDecimals, wLqiSupply, onTransactionSuccess, onClearInput }: UsePoolInteractionsProps) {
    const { connection } = useConnection();
    const wallet = useWallet();
    const { publicKey, signTransaction } = wallet;
    const { priorityFee, preferredExplorer, explorerOptions, slippageBps } = useSettings();
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

        if (!(await checkSolBalance(connection, publicKey!))) {
            return;
        }

        setIsDepositing(true);
        const toastId = toast.loading(t('poolInteractions.processingDeposit'));
        let depositMint: PublicKey | null = null;
        let minimumLpTokensOutBn = new BN(0);

        try {
            depositMint = new PublicKey(mintAddress);
            const amountBn = new BN(parseUnits(amountString, decimals!).toString());

            if (wLqiDecimals === null) {
                toast.error(t('poolInteractions.wlqiDecimalsMissingForSlippage'));
                setIsDepositing(false);
                return;
            }

            console.log('[handleDeposit] Inputs for calculateWLqiValue:', {
                totalPoolValue: validPoolConfig.currentTotalPoolValueScaled.toString(),
                wLqiSupply: wLqiSupply ? wLqiSupply.toString() : '0',
                wLqiDecimals
            });

            const wLqiValueScaled = calculateWLqiValue(
                validPoolConfig.currentTotalPoolValueScaled,
                wLqiSupply ? wLqiSupply.toString() : '0',
                wLqiDecimals
            );

            if (!wLqiValueScaled || wLqiValueScaled.isZero()) {
                toast.error(t('poolInteractions.wLqiValueCalcError', { message: "Calculated wLQI value is zero or invalid" }));
                setIsDepositing(false);
                return;
            }

            console.log('[handleDeposit] Looking for depositMint:', depositMint?.toBase58());
            console.log('[handleDeposit] Available static supportedTokens (mints only):', JSON.stringify(validPoolConfig.supportedTokens.map(t => t.mint.toBase58()), null, 2));

            if (!processedTokenData) {
                toast.error(t('poolInteractions.processedTokenDataMissing'));
                setIsDepositing(false);
                return;
            }

            const depositTokenData = processedTokenData.find(st => st.mintAddress === depositMint!.toBase58());
            if (!depositTokenData || !depositTokenData.priceData) {
                toast.error(t('poolInteractions.priceDataMissing', { symbol: depositMint?.toBase58() }));
                setIsDepositing(false);
                return;
            }
            const depositTokenPriceData: DecodedPriceData = depositTokenData.priceData;

            const depositUsdValueScaled = calculateTokenValueUsdScaled(amountBn, decimals, depositTokenPriceData);
            if (!depositUsdValueScaled || depositUsdValueScaled.isZero()) {
                toast.error(t('poolInteractions.depositValueCalcError'));
                setIsDepositing(false);
                return;
            }
            
            const wLqiScalar = new BN(10).pow(new BN(wLqiDecimals!));
            const estimatedLpTokensOut = depositUsdValueScaled.mul(wLqiScalar).div(wLqiValueScaled);
            const slippageAmount = estimatedLpTokensOut.mul(new BN(slippageBps)).div(new BN(BPS_SCALE));
            minimumLpTokensOutBn = estimatedLpTokensOut.sub(slippageAmount);

            if (minimumLpTokensOutBn.isNeg() || minimumLpTokensOutBn.isZero()) {
                console.warn("[handleDeposit] Calculated minimumLpTokensOutBn is zero or negative, setting to zero.", { estimatedLpTokensOut: estimatedLpTokensOut.toString(), slippageBps, depositUsdValueScaled: depositUsdValueScaled.toString(), wLqiValueScaled: wLqiValueScaled.toString() });
                minimumLpTokensOutBn = new BN(0);
            }
            
            const poolAuthorityPda = findPoolAuthorityPDA();
            const userSourceAta = getAssociatedTokenAddressSync(depositMint, publicKey!);
            const targetTokenVaultAta = findPoolVaultPDA(poolAuthorityPda, depositMint);
            const userWliAta = getAssociatedTokenAddressSync(validPoolConfig!.wliMint, publicKey!);

            const preInstructions: TransactionInstruction[] = [];
            await createAtaIfNeeded(connection, publicKey!, validPoolConfig!.wliMint, preInstructions);

            const depositTokenInfoForValidation = validPoolConfig.supportedTokens.find(st => st.mint.equals(depositMint!));
            if (!validatePriceFeed(depositTokenInfoForValidation, depositMint!, toastId, 'Deposit')) {
                setIsDepositing(false);
                return;
            }
            const depositPriceFeedAccount = validPoolConfig.supportedTokens.find(st => st.mint.equals(depositMint!))!.priceFeed;

            const depositInstruction = await program!.methods
                .deposit(amountBn, minimumLpTokensOutBn)
                .accounts({ 
                    user: publicKey!,
                    userSourceAta: userSourceAta,
                    // @ts-expect-error // Suppressing to check runtime, likely IDL mismatch
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

            if (!(await handleTransactionSuccess(
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
            ))) {
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
    }, [program, publicKey, poolConfig, poolConfigPda, oracleData, processedTokenData, connection, signTransaction, onTransactionSuccess, priorityFee, onClearInput, preferredExplorer, explorerOptions, wLqiDecimals, wLqiSupply, slippageBps]);

    const handleWithdraw = useCallback(async (
        outputMintAddress: string,
        wliAmountString: string,
        minimumUnderlyingTokensOutString: string,
        outputTokenDecimals: number | null
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
            wliAmountString
        );
        if (!isValid || !validPoolConfig) {
            return;
        }

        if (!(await checkSolBalance(connection, publicKey!))) {
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
            const wliAmountBn = new BN(parseUnits(wliAmountString, wLqiDecimals).toString());

            if (outputTokenDecimals === null) {
                toast.error(t('poolInteractions.outputDecimalsMissing'));
                setIsWithdrawing(false);
                return;
            }
            const minimumUnderlyingTokensOutBn = new BN(parseUnits(minimumUnderlyingTokensOutString, outputTokenDecimals).toString());
            
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
            const tempWliqAta = validPoolConfig.tempWliqAta;
            if (!tempWliqAta) {
                toast.error(t('poolInteractions.tempWliqAtaMissing'));
                setIsWithdrawing(false);
                return;
            }

            const preInstructions: TransactionInstruction[] = [];
            await createAtaIfNeeded(connection, publicKey!, outputMint, preInstructions);

            const withdrawInstruction = await program!.methods
                .withdraw(wliAmountBn, minimumUnderlyingTokensOutBn)
                .accounts({
                    user: publicKey!,
                    userWliAta: userWliAta,
                    // @ts-expect-error // Suppressing to check runtime, likely IDL mismatch
                    userDestinationAta: userDestinationAta,
                    feeRecipient: validPoolConfig.feeRecipient,
                    poolConfig: poolConfigPda!,
                    poolAuthority: poolAuthorityPda,
                    wliMint: validPoolConfig.wliMint,
                    tempWliqAta: validPoolConfig.tempWliqAta,
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

            if (!(await handleTransactionSuccess(
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
            ))) {
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