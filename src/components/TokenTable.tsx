'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { BN } from '@coral-xyz/anchor';
import { formatUnits, parseUnits } from 'ethers'; // Import formatUnits and parseUnits
import {
    ProcessedTokenData,
    calculateTokenValueUsdScaled,
    calculateTotalTargetDominance,
    calculateTargetPercentageScaled,
    formatScaledBnToDollarString,
    formatRawAmountString,
    formatScaledToPercentageString,
} from '@/utils/calculations';
import { USD_SCALE } from '@/utils/constants';
import { SkeletonTokenTable } from './SkeletonTokenTable';
import toast from 'react-hot-toast';
import Image from 'next/image';

// --- Component Props ---
interface TokenTableProps {
    tokenData: ProcessedTokenData[] | null;
    totalPoolValueScaled: BN | null;
    wLqiValueScaled: BN | null;
    wLqiDecimals: number | null;
    userWlqiBalance: BN | null;
    onDeposit: (mintAddress: string, amountString: string, decimals: number | null) => Promise<void>;
    onWithdraw: (mintAddress: string, amountString: string, isFullDelistedWithdraw?: boolean) => Promise<void>;
    isDepositing: boolean;
    isWithdrawing: boolean;
    depositAmounts: Record<string, string>;
    withdrawAmounts: Record<string, string>;
    handleAmountChange: (mintAddress: string, action: 'deposit' | 'withdraw', amount: string) => void;
    isLoadingUserData: boolean;
    isLoadingPublicData: boolean;
    hideDepositColumn?: boolean;
}

// --- ADDED: TokenRow Props ---
interface TokenRowProps {
    token: ProcessedTokenData;
    index: number;
    totalPoolValueScaled: BN | null;
    wLqiValueScaled: BN | null;
    wLqiDecimals: number | null;
    userWlqiBalance: BN | null;
    onDeposit: (mintAddress: string, amountString: string, decimals: number | null) => Promise<void>;
    onWithdraw: (mintAddress: string, amountString: string, isFullDelistedWithdraw?: boolean) => Promise<void>;
    isDepositing: boolean;
    isWithdrawing: boolean;
    depositAmounts: Record<string, string>;
    withdrawAmounts: Record<string, string>;
    handleAmountChange: (mintAddress: string, action: 'deposit' | 'withdraw', amount: string) => void;
    isLoadingUserData: boolean;
    isLoadingPublicData: boolean;
    hideDepositColumn: boolean;
    // Callbacks from TokenTable
    handleSetAmount: (mintAddress: string, action: 'deposit' | 'withdraw', fraction: number) => void;
    handleSetTargetAmount: (mintAddress: string, action: 'deposit' | 'withdraw') => void;
    // Calculated values from TokenTable
    totalTargetDominance: BN;
}

// --- ADDED: TokenCard Props --- 
// Props will be very similar to TokenRowProps
// interface TokenCardProps extends Omit<TokenRowProps, 'index'> {} // Inherit props, index might not be needed
// MODIFIED: Changed to type alias for clarity and to satisfy linter
type TokenCardProps = Omit<TokenRowProps, 'index'>;

// Define type for sortable keys
type SortableKey = 'symbol' | 'value' | 'actualPercent' | 'targetPercent';

// --- Constants for Button Colors ---
const BTN_GREEN = "bg-green-600 hover:bg-green-700";
const BTN_RED = "bg-red-600 hover:bg-red-700";
const BTN_GRAY = "bg-gray-500 hover:bg-gray-600 cursor-not-allowed"; // Neutral/disabled look

// --- Fee Estimation Constants ---
const BASE_FEE_BPS = 10; // 0.1%
const BPS_SCALE = 10000; // For converting BPS to decimal percentage
const DOMINANCE_SCALE = new BN(10_000_000_000); // 10^10, matching Rust constant
const FEE_K_FACTOR_NUMERATOR = 2; // k = 0.2
const FEE_K_FACTOR_DENOMINATOR = 10;
const DEPOSIT_PREMIUM_CAP_BPS = -500; // Max dynamic *discount* is 500 BPS
const WITHDRAW_FEE_FLOOR_BPS = 0;     // Min total fee is 0 BPS
const DEPOSIT_MAX_FEE_BPS = 9999; // Max total deposit fee is 99.99%
const WITHDRAW_MAX_FEE_BPS = 9999; // Max total withdraw fee is 99.99%

// Define a precision scale factor
const PRECISION_SCALE_FACTOR = new BN(10).pow(new BN(12)); // 1e12 for high precision

// BN versions for precise calculations
const BN_BPS_SCALE = new BN(BPS_SCALE);
const BN_BASE_FEE_BPS = new BN(BASE_FEE_BPS);
const BN_DEPOSIT_PREMIUM_CAP_BPS = new BN(DEPOSIT_PREMIUM_CAP_BPS);
const BN_WITHDRAW_FEE_FLOOR_BPS = new BN(WITHDRAW_FEE_FLOOR_BPS);
const BN_FEE_K_FACTOR_NUMERATOR = new BN(FEE_K_FACTOR_NUMERATOR);
const BN_FEE_K_FACTOR_DENOMINATOR = new BN(FEE_K_FACTOR_DENOMINATOR);
const BN_DEPOSIT_MAX_FEE_BPS = new BN(DEPOSIT_MAX_FEE_BPS);
const BN_WITHDRAW_MAX_FEE_BPS = new BN(WITHDRAW_MAX_FEE_BPS);

// --- Calculation Helper: Convert USD to Token Amount ---
// FIX: Corrected implementation based on derived formula
const usdToTokenAmount = (usdValueScaled: BN, decimals: number, priceData: ProcessedTokenData['priceData']): BN => {
    if (!priceData || priceData.price.isZero() || priceData.price.isNeg() || usdValueScaled.isNeg()) return new BN(0);
    if (usdValueScaled.isZero()) return new BN(0); // Handle zero USD input

    try {
        const price_bn = priceData.price; // Price scaled by 10^abs(Expo)
        const expo = priceData.expo;

        // Derived formula: Amount_Native = (USD_Value_Scaled * 10^Decimals) / (Price_Scaled * 10^(Expo + USD_SCALE))
        const total_exponent: number = expo + USD_SCALE; // Note: USD_SCALE is 6

        let final_numerator = usdValueScaled.mul(new BN(10).pow(new BN(decimals)));
        let final_denominator = price_bn;

        // Adjust numerator or denominator based on the sign of total_exponent
        if (total_exponent >= 0) {
            // If exponent is non-negative, multiply the denominator
            final_denominator = price_bn.mul(new BN(10).pow(new BN(total_exponent)));
        } else {
            // If exponent is negative, multiply the numerator by 10^abs(total_exponent)
            final_numerator = final_numerator.mul(new BN(10).pow(new BN(Math.abs(total_exponent))));
        }

        // Safety check for zero denominator AFTER potential adjustments
        if (final_denominator.isZero()) {
            console.error("usdToTokenAmount: Calculated denominator is zero!");
            return new BN(0);
        }

        // Apply PRECISION_SCALE_FACTOR for precision during division
        const resultScaled = final_numerator.mul(PRECISION_SCALE_FACTOR).div(final_denominator);
        return resultScaled; // Returns Lamports * 1e12

    } catch (e) {
        console.error("Error converting USD to token amount:", e);
        return new BN(0);
    }
}

// --- Calculation Helper: Convert USD to wLQI Amount ---
const usdToWlqiAmount = (usdValueScaled: BN, wLqiValueScaled: BN | null, wLqiDecimals: number | null): BN => {
    if (!wLqiValueScaled || wLqiValueScaled.isZero() || wLqiValueScaled.isNeg() || wLqiDecimals === null) return new BN(0);
    try {
        const wLqiMultiplier = new BN(10).pow(new BN(wLqiDecimals));
        // wLqiAmount = (usdValue * 10^wLqiDecimals) / wLqiValue
        return usdValueScaled.mul(wLqiMultiplier).div(wLqiValueScaled);
    } catch (e) {
        console.error("Error converting USD to wLQI amount:", e);
        return new BN(0);
    }
}

// --- Calculation Helper ---

/**
 * Calculates relative deviation scaled by BPS_SCALE (1e4).
 * Inputs are scaled by DOMINANCE_SCALE (1e10).
 * Returns BN representing BPS (scaled by 1).
 */
const calculateRelativeDeviationBpsBN = (actualDominanceScaled: BN, targetDominanceScaled: BN): BN => {
    if (targetDominanceScaled.isZero() || targetDominanceScaled.isNeg()) {
        // Avoid division by zero. If target is 0, deviation is large if actual > 0.
        // Return 100% * BPS_SCALE as BN
        return actualDominanceScaled.gtn(0) ? BN_BPS_SCALE.mul(new BN(100)) : new BN(0);
    }
    try {
        const deviationScaled = actualDominanceScaled.sub(targetDominanceScaled);
        // Scale deviation by BN_BPS_SCALE before dividing by target dominance
        // Use BN arithmetic: (deviationScaled * BN_BPS_SCALE) / targetDominanceScaledBn
        const deviationBpsBN = deviationScaled.mul(BN_BPS_SCALE).div(targetDominanceScaled);
        return deviationBpsBN;
    } catch (e) {
        console.error("Error calculating relative deviation BPS (BN):", e);
        return new BN(0); // Return BN(0) on error
    }
};

// --- ADDED: TokenRow Component ---
const TokenRow: React.FC<TokenRowProps> = React.memo(({
    token,
    index,
    totalPoolValueScaled,
    wLqiValueScaled,
    wLqiDecimals,
    userWlqiBalance,
    onDeposit,
    onWithdraw,
    isDepositing,
    isWithdrawing,
    depositAmounts,
    withdrawAmounts,
    handleAmountChange,
    isLoadingUserData,
    isLoadingPublicData,
    hideDepositColumn,
    handleSetAmount,
    handleSetTargetAmount,
    totalTargetDominance,
}) => {
    // Destructure token object inside the function
    const { mintAddress, symbol, icon, priceData, vaultBalance, decimals, targetDominance, isDelisted } = token;
    const [currentIconSrc, setCurrentIconSrc] = useState(icon); // MOVED: State for icon source is now here

    // --- Action Disabled Flag ---
    const actionDisabled = isDepositing || isWithdrawing || isLoadingPublicData || isLoadingUserData;

    // --- Recalculate values needed for display ---
    const tokenValueUsd = vaultBalance !== null && decimals !== null
        ? calculateTokenValueUsdScaled(vaultBalance, decimals, priceData)
        : null;
    const targetScaled = calculateTargetPercentageScaled(targetDominance, totalTargetDominance);

    // --- Get Input Values ---
    const currentDepositAmount = depositAmounts[mintAddress] || '';
    const currentWithdrawAmount = withdrawAmounts[mintAddress] || '';
    const isDepositInputFilled = currentDepositAmount !== '' && parseFloat(currentDepositAmount) > 0;
    const isWithdrawInputFilled = currentWithdrawAmount !== '' && parseFloat(currentWithdrawAmount) > 0;

    // --- ADD: Check for insufficient TOKEN balance for deposit ---
    let depositInsufficientBalance = false;
    if (isDepositInputFilled && token.userBalance && decimals !== null) {
        try {
            const inputAmountBn = new BN(parseUnits(currentDepositAmount, decimals).toString());
            const isInsufficient = inputAmountBn.gt(token.userBalance);
            if (isInsufficient) {
                depositInsufficientBalance = true;
            }
        } catch (e) {
            console.warn(`Error parsing deposit amount for ${symbol} balance check:`, e);
        }
    }

    // --- ADD: Check for insufficient wLQI balance for withdrawal ---
    let withdrawInsufficientBalance = false;
    if (isWithdrawInputFilled && userWlqiBalance && wLqiDecimals !== null) {
        try {
            const inputWlqiAmountBn = new BN(parseUnits(currentWithdrawAmount, wLqiDecimals).toString());
            if (inputWlqiAmountBn.gt(userWlqiBalance)) {
                withdrawInsufficientBalance = true;
            }
        } catch (e) {
            console.warn("Error parsing withdraw amount for balance check:", e);
        }
    }

    // --- Advanced Fee Calculation --- Refactored to use BN
    let estimatedDepositFeeBps = BASE_FEE_BPS; // Default for Deposit
    let estimatedWithdrawFeeBps = BASE_FEE_BPS; // Default for Withdraw
    let withdrawalExceedsLiquidity = false;

    try {
        if (!totalPoolValueScaled) {
            estimatedDepositFeeBps = BASE_FEE_BPS;
            estimatedWithdrawFeeBps = BASE_FEE_BPS;
        } else {
            const targetDominanceScaledBn = (totalTargetDominance && !totalTargetDominance.isZero())
                ? targetDominance.mul(DOMINANCE_SCALE).div(totalTargetDominance)
                : new BN(0);
            const actualDomPreScaled = (tokenValueUsd && !totalPoolValueScaled.isZero())
                ? tokenValueUsd.mul(DOMINANCE_SCALE).div(totalPoolValueScaled)
                : null;

            if (actualDomPreScaled === null) {
                estimatedDepositFeeBps = BASE_FEE_BPS;
                estimatedWithdrawFeeBps = BASE_FEE_BPS;
            } else {
                const relDevPreBps = calculateRelativeDeviationBpsBN(actualDomPreScaled, targetDominanceScaledBn);
                if (isDepositInputFilled && decimals !== null && priceData && !totalPoolValueScaled.isZero() && totalTargetDominance && !totalTargetDominance.isZero()) {
                    let valueChangeUsdScaled = new BN(0);
                    try {
                        const inputAmountBn = new BN(parseUnits(currentDepositAmount, decimals).toString());
                        valueChangeUsdScaled = calculateTokenValueUsdScaled(inputAmountBn, decimals, priceData);
                        if (!valueChangeUsdScaled.isZero()) {
                            const totalPoolValuePostScaled = totalPoolValueScaled.add(valueChangeUsdScaled);
                            const tokenValuePostScaled = (tokenValueUsd ?? new BN(0)).add(valueChangeUsdScaled);
                            const actualDomPostScaled = (!totalPoolValuePostScaled.isZero())
                                ? tokenValuePostScaled.mul(DOMINANCE_SCALE).div(totalPoolValuePostScaled)
                                : null;
                            if (actualDomPostScaled !== null) {
                                const relDevPostBpsBN = calculateRelativeDeviationBpsBN(actualDomPostScaled, targetDominanceScaledBn);
                                const scaleFactor = new BN(100);
                                const avgRelDevBpsBN = relDevPreBps.add(relDevPostBpsBN).mul(scaleFactor).div(new BN(2).mul(scaleFactor));
                                const rawDynamicFeeBpsBN = avgRelDevBpsBN.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                                let effectiveDynamicFeeBpsBN = rawDynamicFeeBpsBN;
                                if (effectiveDynamicFeeBpsBN.lt(BN_DEPOSIT_PREMIUM_CAP_BPS)) {
                                    effectiveDynamicFeeBpsBN = BN_DEPOSIT_PREMIUM_CAP_BPS;
                                }
                                let totalFeeBN = BN_BASE_FEE_BPS.add(effectiveDynamicFeeBpsBN);
                                if (totalFeeBN.gt(BN_DEPOSIT_MAX_FEE_BPS)) {
                                    totalFeeBN = BN_DEPOSIT_MAX_FEE_BPS;
                                }
                                estimatedDepositFeeBps = Math.round(totalFeeBN.toNumber());
                            } else {
                                const rawDynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                                let effectiveDynamicFeePreBpsBN = rawDynamicFeePreBpsBN;
                                if (effectiveDynamicFeePreBpsBN.lt(BN_DEPOSIT_PREMIUM_CAP_BPS)) {
                                    effectiveDynamicFeePreBpsBN = BN_DEPOSIT_PREMIUM_CAP_BPS;
                                }
                                let totalFeePreBN = BN_BASE_FEE_BPS.add(effectiveDynamicFeePreBpsBN);
                                if (totalFeePreBN.gt(BN_DEPOSIT_MAX_FEE_BPS)) {
                                    totalFeePreBN = BN_DEPOSIT_MAX_FEE_BPS;
                                }
                                estimatedDepositFeeBps = Math.round(totalFeePreBN.toNumber());
                            }
                        } else {
                            const rawDynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                            let effectiveDynamicFeePreBpsBN = rawDynamicFeePreBpsBN;
                            if (effectiveDynamicFeePreBpsBN.lt(BN_DEPOSIT_PREMIUM_CAP_BPS)) {
                                effectiveDynamicFeePreBpsBN = BN_DEPOSIT_PREMIUM_CAP_BPS;
                            }
                            let totalFeePreBN = BN_BASE_FEE_BPS.add(effectiveDynamicFeePreBpsBN);
                            if (totalFeePreBN.gt(BN_DEPOSIT_MAX_FEE_BPS)) {
                                totalFeePreBN = BN_DEPOSIT_MAX_FEE_BPS;
                            }
                            estimatedDepositFeeBps = Math.round(totalFeePreBN.toNumber());
                        }
                    } catch (e) {
                        console.error("Error during deposit fee estimation (BN):", e);
                        estimatedDepositFeeBps = BASE_FEE_BPS;
                    }
                } else {
                    const rawDynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                    let effectiveDynamicFeePreBpsBN = rawDynamicFeePreBpsBN;
                    if (effectiveDynamicFeePreBpsBN.lt(BN_DEPOSIT_PREMIUM_CAP_BPS)) {
                        effectiveDynamicFeePreBpsBN = BN_DEPOSIT_PREMIUM_CAP_BPS;
                    }
                    let totalFeePreBN = BN_BASE_FEE_BPS.add(effectiveDynamicFeePreBpsBN);
                    if (totalFeePreBN.gt(BN_DEPOSIT_MAX_FEE_BPS)) {
                        totalFeePreBN = BN_DEPOSIT_MAX_FEE_BPS;
                    }
                    estimatedDepositFeeBps = Math.round(totalFeePreBN.toNumber());
                }

                if (isWithdrawInputFilled && wLqiDecimals !== null && wLqiValueScaled && !wLqiValueScaled.isZero() && priceData && decimals !== null && vaultBalance && !vaultBalance.isZero()) {
                    let valueChangeUsdScaled = new BN(0);
                    try {
                        const inputWlqiAmountBn = new BN(parseUnits(currentWithdrawAmount, wLqiDecimals).toString());
                        const scaleFactorWlqi = new BN(10).pow(new BN(wLqiDecimals));
                        if (!scaleFactorWlqi.isZero()) {
                            valueChangeUsdScaled = inputWlqiAmountBn.mul(wLqiValueScaled).div(scaleFactorWlqi);
                        }

                        const requiredTokenAmountBn_scaled = usdToTokenAmount(valueChangeUsdScaled, decimals, priceData);
                        const requiredTokenAmountBn = requiredTokenAmountBn_scaled.div(PRECISION_SCALE_FACTOR);
                        if (requiredTokenAmountBn.gt(vaultBalance)) {
                            withdrawalExceedsLiquidity = true;
                        } else {
                            withdrawalExceedsLiquidity = false;
                        }

                        if (!withdrawalExceedsLiquidity && !valueChangeUsdScaled.isZero()) {
                            const totalPoolValuePostScaled = totalPoolValueScaled.gt(valueChangeUsdScaled) ? totalPoolValueScaled.sub(valueChangeUsdScaled) : new BN(0);
                            const currentTokenValue = tokenValueUsd ?? new BN(0);
                            const tokenValuePostScaled = currentTokenValue.gt(valueChangeUsdScaled) ? currentTokenValue.sub(valueChangeUsdScaled) : new BN(0);
                            const actualDomPostScaled = (!totalPoolValuePostScaled.isZero())
                                ? tokenValuePostScaled.mul(DOMINANCE_SCALE).div(totalPoolValuePostScaled)
                                : null;
                            if (actualDomPostScaled !== null) {
                                const relDevPostBpsBN = calculateRelativeDeviationBpsBN(actualDomPostScaled, targetDominanceScaledBn);
                                const avgRelDevBpsBN = relDevPreBps.add(relDevPostBpsBN).div(new BN(2));
                                const withdrawDynamicFeeBpsBN = avgRelDevBpsBN.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                                let totalFeeBN = BN_BASE_FEE_BPS.sub(withdrawDynamicFeeBpsBN);
                                if (totalFeeBN.lt(BN_WITHDRAW_FEE_FLOOR_BPS)) {
                                    totalFeeBN = BN_WITHDRAW_FEE_FLOOR_BPS;
                                } else if (totalFeeBN.gt(BN_WITHDRAW_MAX_FEE_BPS)) {
                                    totalFeeBN = BN_WITHDRAW_MAX_FEE_BPS;
                                }
                                estimatedWithdrawFeeBps = Math.round(totalFeeBN.toNumber());
                            } else {
                                const dynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                                let totalFeePreBN = BN_BASE_FEE_BPS.sub(dynamicFeePreBpsBN);
                                if (totalFeePreBN.lt(BN_WITHDRAW_FEE_FLOOR_BPS)) {
                                    totalFeePreBN = BN_WITHDRAW_FEE_FLOOR_BPS;
                                } else if (totalFeePreBN.gt(BN_WITHDRAW_MAX_FEE_BPS)) {
                                    totalFeePreBN = BN_WITHDRAW_MAX_FEE_BPS;
                                }
                                estimatedWithdrawFeeBps = Math.round(totalFeePreBN.toNumber());
                            }
                        } else if (!withdrawalExceedsLiquidity) {
                            const dynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                            let totalFeePreBN = BN_BASE_FEE_BPS.sub(dynamicFeePreBpsBN);
                            if (totalFeePreBN.lt(BN_WITHDRAW_FEE_FLOOR_BPS)) {
                                totalFeePreBN = BN_WITHDRAW_FEE_FLOOR_BPS;
                            } else if (totalFeePreBN.gt(BN_WITHDRAW_MAX_FEE_BPS)) {
                                totalFeePreBN = BN_WITHDRAW_MAX_FEE_BPS;
                            }
                            estimatedWithdrawFeeBps = Math.round(totalFeePreBN.toNumber());
                        }
                    } catch (e) {
                        console.error("Error during withdraw fee estimation (BN):", e);
                        estimatedWithdrawFeeBps = BASE_FEE_BPS;
                    }
                } else {
                    const dynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                    let totalFeePreBN = BN_BASE_FEE_BPS.sub(dynamicFeePreBpsBN);
                    if (totalFeePreBN.lt(BN_WITHDRAW_FEE_FLOOR_BPS)) {
                        totalFeePreBN = BN_WITHDRAW_FEE_FLOOR_BPS;
                    } else if (totalFeePreBN.gt(BN_WITHDRAW_MAX_FEE_BPS)) {
                        totalFeePreBN = BN_WITHDRAW_MAX_FEE_BPS;
                    }
                    estimatedWithdrawFeeBps = Math.round(totalFeePreBN.toNumber());
                }
            }
        }
    } catch (e) {
        console.error("Error calculating fee estimate:", e);
        estimatedDepositFeeBps = BASE_FEE_BPS;
        estimatedWithdrawFeeBps = BASE_FEE_BPS;
    }

    const actualPercentBN = token.actualDominancePercent !== null && token.actualDominancePercent !== undefined
        ? new BN(Math.round(token.actualDominancePercent * BPS_SCALE))
        : null;

    let depositButtonDisabled = actionDisabled || !isDepositInputFilled || isDelisted;
    let withdrawButtonDisabled = actionDisabled || !isWithdrawInputFilled;

    const formatFeeString = (estimatedBps: number, isDepositAction: boolean) => {
        let feeString: string;
        let title: string;
        if (isDepositAction) {
            if (estimatedBps < 0) {
                const bonusPercent = (Math.abs(estimatedBps) / BPS_SCALE * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                feeString = `(~${bonusPercent}% Bonus)`;
                title = `Est. Bonus: ~${bonusPercent}%`;
            } else if (estimatedBps === 0) {
                feeString = `(0.00%)`;
                title = "Est. Total Fee: 0.00%";
            } else {
                const displayPercent = (estimatedBps / BPS_SCALE * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                feeString = `(~${displayPercent}% Fee)`;
                title = `Est. Total Fee: ~${displayPercent}%`;
            }
        } else {
            if (estimatedBps === 0) {
                feeString = "(0.00%)";
                title = "Minimum fee applied (0.00%)";
            } else if (estimatedBps > 0) {
                const displayPercent = (estimatedBps / BPS_SCALE * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                feeString = `(~${displayPercent}% Fee)`;
                title = `Est. Total Fee: ~${displayPercent}%`;
            } else {
                feeString = "(Fee Error)";
                title = "Error estimating fee";
            }
        }
        return { feeString, title };
    };

    const formatDelistedWithdrawFeeString = () => {
        const feeString = "(~5% Bonus)";
        const title = "Fixed bonus applied for delisted token withdrawal (0% net fee).";
        return { feeString, title };
    };

    let depositBtnClass = BTN_GRAY;
    let withdrawBtnClass = BTN_GRAY;
    let depositLabel = isDepositing ? 'Depositing...' : 'Deposit';
    let withdrawLabel = isWithdrawing ? 'Withdrawing...' : 'Withdraw';
    let depositTitle = 'Enter amount to deposit';
    let withdrawTitle = 'Enter wLQI amount to withdraw';

    if (!actionDisabled) {
        if (estimatedDepositFeeBps <= 0) {
            depositBtnClass = BTN_GREEN;
        } else {
            depositBtnClass = BTN_RED;
        }
        if (!withdrawalExceedsLiquidity) {
            if (estimatedWithdrawFeeBps === 0) {
                withdrawBtnClass = BTN_GREEN;
            } else if (estimatedWithdrawFeeBps > 0) {
                withdrawBtnClass = BTN_RED;
            }
        }
        const { feeString: depositFeeString, title: depositTitleBase } = formatFeeString(estimatedDepositFeeBps, true);
        depositLabel = `Deposit ${depositFeeString}`;
        depositTitle = depositTitleBase;
        const { feeString: withdrawFeeString, title: withdrawTitleBase } = isDelisted ? formatDelistedWithdrawFeeString() : formatFeeString(estimatedWithdrawFeeBps, false);
        withdrawLabel = `Withdraw ${withdrawFeeString}`;
        withdrawTitle = withdrawTitleBase;
    }

    if (withdrawInsufficientBalance) {
        withdrawLabel = "Insufficient wLQI";
        withdrawTitle = "Withdrawal amount exceeds your wLQI balance";
        withdrawButtonDisabled = true;
        withdrawBtnClass = BTN_GRAY;
    } else if (isDelisted && (!vaultBalance || vaultBalance.isZero())) {
        withdrawLabel = "Pool Empty";
        withdrawTitle = "No balance of this delisted token in the pool to withdraw.";
        withdrawButtonDisabled = true;
        withdrawBtnClass = BTN_GRAY;
    } else if (withdrawalExceedsLiquidity) {
        withdrawTitle = `Pool lacks sufficient ${symbol} for withdrawal`;
        withdrawLabel = `Insufficient Pool ${symbol}`;
        withdrawButtonDisabled = true;
        withdrawBtnClass = BTN_GRAY;
    }

    if (depositInsufficientBalance) {
        depositLabel = `Insufficient User ${symbol}`;
        depositTitle = `Deposit amount exceeds your ${symbol} balance`;
        depositButtonDisabled = true;
        depositBtnClass = BTN_GRAY;
    }

    const displayBalance = formatRawAmountString(vaultBalance?.toString(), decimals, true, 2);
    const displayValue = formatScaledBnToDollarString(tokenValueUsd, USD_SCALE);
    const displaySymbol = symbol;
    const displayTargetPercent = formatScaledToPercentageString(targetScaled);
    const displayActualPercent = (typeof token.actualDominancePercent === 'number')
        ? token.actualDominancePercent.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
        : '--.--';

    const currentUserBalance = token.userBalance;
    const formattedUserTokenBalance = currentUserBalance !== null
        ? formatRawAmountString(currentUserBalance.toString(), decimals, true, 2)
        : null;
    const displayUserTokenBalance = formattedUserTokenBalance ? `${formattedUserTokenBalance} ${symbol}` : '--.--';

    const formattedUserWlqiBalance = userWlqiBalance !== null && wLqiDecimals !== null
        ? formatRawAmountString(userWlqiBalance.toString(), wLqiDecimals, true, 2)
        : null;
    const displayUserWlqiBalance = formattedUserWlqiBalance ? `${formattedUserWlqiBalance} wLQI` : '--.--';

    let displayDepositInputUsdValue = '$ --.--';
    if (isDepositInputFilled && decimals !== null && priceData) {
        try {
            const inputAmountBn = new BN(parseUnits(currentDepositAmount, decimals).toString());
            const inputUsdValueScaled = calculateTokenValueUsdScaled(inputAmountBn, decimals, priceData);
            displayDepositInputUsdValue = formatScaledBnToDollarString(inputUsdValueScaled, USD_SCALE);
        } catch { displayDepositInputUsdValue = '$ Invalid'; }
    } else if (currentDepositAmount === '' || currentDepositAmount === '0') {
        displayDepositInputUsdValue = '$ 0.00';
    }
    let displayWithdrawInputUsdValue = '$ --.--';
    if (isWithdrawInputFilled && wLqiDecimals !== null && wLqiValueScaled) {
        try {
            const inputWlqiAmountBn = new BN(parseUnits(currentWithdrawAmount, wLqiDecimals).toString());
            const scaleFactorWlqi = new BN(10).pow(new BN(wLqiDecimals));
            if (!scaleFactorWlqi.isZero()) {
                const inputUsdValueScaled = inputWlqiAmountBn.mul(wLqiValueScaled).div(scaleFactorWlqi);
                displayWithdrawInputUsdValue = formatScaledBnToDollarString(inputUsdValueScaled, USD_SCALE);
            }
        } catch { displayWithdrawInputUsdValue = '$ Invalid'; }
    } else if (currentWithdrawAmount === '' || currentWithdrawAmount === '0') {
        displayWithdrawInputUsdValue = '$ 0.00';
    }

    const handleActualDeposit = () => onDeposit(mintAddress, currentDepositAmount, decimals);
    const handleActualWithdraw = () => onWithdraw(mintAddress, currentWithdrawAmount, false);
    const handleFullDelistedWithdraw = () => onWithdraw(mintAddress, "0", true);

    let requiredWlqiForDelistedBn: BN | null = null;
    let requiredWlqiForDelistedFormatted: string | null = null;
    let userHasEnoughForDelisted = false;

    if (isDelisted && vaultBalance && !vaultBalance.isZero() && decimals !== null && wLqiValueScaled && !wLqiValueScaled.isZero() && wLqiDecimals !== null) {
        try {
            const T_usd_scaled = calculateTokenValueUsdScaled(vaultBalance, decimals, priceData);
            if (T_usd_scaled && T_usd_scaled.gtn(0)) {
                const bonusNumerator = new BN(100);
                const bonusDenominator = new BN(105);
                const T_usd_scaled_adjusted = T_usd_scaled.mul(bonusNumerator).div(bonusDenominator);
                const requiredWlqi = usdToWlqiAmount(T_usd_scaled_adjusted, wLqiValueScaled, wLqiDecimals);
                requiredWlqiForDelistedBn = requiredWlqi.add(new BN(1));
                requiredWlqiForDelistedFormatted = formatRawAmountString(requiredWlqiForDelistedBn.toString(), wLqiDecimals, true, 4);
                if (userWlqiBalance && requiredWlqiForDelistedBn.lte(userWlqiBalance)) {
                    userHasEnoughForDelisted = true;
                }
            }
        } catch (e) {
            console.error(`Error calculating required wLQI for delisted ${symbol}:`, e);
            requiredWlqiForDelistedBn = null;
            requiredWlqiForDelistedFormatted = null;
            userHasEnoughForDelisted = false;
        }
    }

    return (
        <tr key={mintAddress} className={`border-b border-gray-600 ${index % 2 === 0 ? 'bg-gray-700' : 'bg-gray-750'} hover:bg-gray-600 ${actionDisabled ? 'opacity-50' : ''} ${isDelisted ? 'bg-red-900/30' : ''}`}>
            <td className="p-0 font-semibold align-middle text-center" title={token.mintAddress}>
                <div className="flex items-center justify-center h-full space-x-2 px-2">
                    <Image
                        src={currentIconSrc}
                        alt={symbol}
                        className="w-6 h-6 rounded-full"
                        width={24}
                        height={24}
                        onError={() => {
                            if (currentIconSrc !== '/tokens/default.png') {
                                setCurrentIconSrc('/tokens/default.png');
                            }
                        }}
                    />
                    <span className="">{displaySymbol}</span>
                </div>
            </td>
            <td className="p-2 align-middle text-center">
                <div>{displayValue}</div>
                <div className="text-gray-400">{displayBalance} {displaySymbol}</div>
            </td>
            <td className="p-2 align-middle text-center">{displayActualPercent}%</td>
            <td className="p-2 align-middle text-center">{displayTargetPercent}%</td>
            {!hideDepositColumn && (
                <td className="p-2 align-middle">
                    {isDelisted ? (
                        <div className="text-center text-gray-500 italic">N/A</div>
                    ) : (
                        <div className="flex flex-col space-y-1">
                            <div className="flex items-center justify-between">
                                <div className="text-gray-400 text-[10px] flex items-center">
                                    {/* SVG and balance display */}
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="mr-1"><path d="M13.8205 12.2878C13.8205 12.4379 13.791 12.5865 13.7335 12.7252C13.6761 12.8638 13.5919 12.9898 13.4858 13.0959C13.3797 13.2021 13.2537 13.2863 13.115 13.3437C12.9764 13.4011 12.8278 13.4307 12.6777 13.4307H3.04911C2.746 13.4307 2.45531 13.3103 2.24099 13.0959C2.02666 12.8816 1.90625 12.5909 1.90625 12.2878V4.18992C1.90625 3.68474 2.10693 3.20026 2.46414 2.84305C2.82135 2.48584 3.30584 2.28516 3.81101 2.28516H10.3718C10.6749 2.28516 10.9656 2.40556 11.1799 2.61989C11.3942 2.83422 11.5146 3.12491 11.5146 3.42801L11.5142 4.20668H12.6777C12.8278 4.20668 12.9764 4.23624 13.115 4.29367C13.2537 4.35111 13.3797 4.43529 13.4858 4.54141C13.5919 4.64754 13.6761 4.77353 13.7335 4.91218C13.791 5.05084 13.8205 5.19946 13.8205 5.34954V12.2878ZM12.6777 5.34954H3.04911V12.2878H12.6777L12.6773 10.356H8.43996V7.28173L12.6773 7.28135V5.34992L12.6777 5.34954ZM12.6777 8.4242H9.58244V9.21316H12.6773V8.42459L12.6777 8.4242ZM10.3718 3.42801H3.81101C3.60894 3.42801 3.41515 3.50829 3.27226 3.65117C3.12938 3.79405 3.04911 3.98785 3.04911 4.18992L3.04873 4.20668H10.3714V3.42801H10.3718Z"></path></svg>
                                    <span>{displayUserTokenBalance}</span>
                                </div>
                                <div className="flex items-center space-x-1">
                                    <button onClick={() => handleSetAmount(token.mintAddress, 'deposit', 0.5)} disabled={actionDisabled || token.userBalance === null || isDelisted} className={`px-1 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(actionDisabled || token.userBalance === null || isDelisted) ? 'cursor-not-allowed opacity-50' : ''}`} title="Set amount to 50% of your balance"> Half </button>
                                    <button onClick={() => handleSetAmount(token.mintAddress, 'deposit', 1)} disabled={actionDisabled || token.userBalance === null || isDelisted} className={`px-1 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(actionDisabled || token.userBalance === null || isDelisted) ? 'cursor-not-allowed opacity-50' : ''}`} title="Set amount to your maximum balance"> Max </button>
                                </div>
                            </div>
                            <div className="flex items-center">
                                <div className="relative w-full">
                                    <input id={`deposit-${mintAddress}`} type="number" step="any" min="0" placeholder={`Amount (${symbol})`} value={currentDepositAmount} onChange={(e) => handleAmountChange(token.mintAddress, 'deposit', e.target.value)} className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 w-full text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" disabled={actionDisabled || isDelisted} />
                                    {!actionDisabled && actualPercentBN?.lt(targetScaled) && (
                                        <button onClick={() => handleSetTargetAmount(token.mintAddress, 'deposit')} disabled={actionDisabled} className={`ml-1 px-1 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 rounded text-white text-center ${actionDisabled ? 'cursor-not-allowed opacity-50' : ''}`} title="Set amount needed to reach target dominance"> To Target </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <div className="text-gray-400 text-[10px] h-3">{displayDepositInputUsdValue}</div>
                            </div>
                            <button onClick={handleActualDeposit} disabled={depositButtonDisabled} className={`w-full px-1 py-0.5 text-xs rounded text-white truncate ${depositBtnClass} ${depositButtonDisabled ? 'cursor-not-allowed opacity-50' : ''}`} title={depositTitle}>{depositLabel}</button>
                        </div>
                    )}
                </td>
            )}
            <td className="p-2 align-middle">
                <div className="flex flex-col space-y-1">
                    <div className="flex items-center justify-between">
                        <div className="text-gray-400 text-[10px] flex items-center">
                            {/* SVG and balance display */}
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="mr-1"><path d="M13.8205 12.2878C13.8205 12.4379 13.791 12.5865 13.7335 12.7252C13.6761 12.8638 13.5919 12.9898 13.4858 13.0959C13.3797 13.2021 13.2537 13.2863 13.115 13.3437C12.9764 13.4011 12.8278 13.4307 12.6777 13.4307H3.04911C2.746 13.4307 2.45531 13.3103 2.24099 13.0959C2.02666 12.8816 1.90625 12.5909 1.90625 12.2878V4.18992C1.90625 3.68474 2.10693 3.20026 2.46414 2.84305C2.82135 2.48584 3.30584 2.28516 3.81101 2.28516H10.3718C10.6749 2.28516 10.9656 2.40556 11.1799 2.61989C11.3942 2.83422 11.5146 3.12491 11.5146 3.42801L11.5142 4.20668H12.6777C12.8278 4.20668 12.9764 4.23624 13.115 4.29367C13.2537 4.35111 13.3797 4.43529 13.4858 4.54141C13.5919 4.64754 13.6761 4.77353 13.7335 4.91218C13.791 5.05084 13.8205 5.19946 13.8205 5.34954V12.2878ZM12.6777 5.34954H3.04911V12.2878H12.6777L12.6773 10.356H8.43996V7.28173L12.6773 7.28135V5.34992L12.6777 5.34954ZM12.6777 8.4242H9.58244V9.21316H12.6773V8.42459L12.6777 8.4242ZM10.3718 3.42801H3.81101C3.60894 3.42801 3.41515 3.50829 3.27226 3.65117C3.12938 3.79405 3.04911 3.98785 3.04911 4.18992L3.04873 4.20668H10.3714V3.42801H10.3718Z"></path></svg>
                            <span>{displayUserWlqiBalance}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                            <button onClick={() => handleSetAmount(token.mintAddress, 'withdraw', 0.5)} disabled={actionDisabled || userWlqiBalance === null} className={`px-1 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(actionDisabled || userWlqiBalance === null) ? 'cursor-not-allowed opacity-50' : ''}`} title="Set amount to 50% of your wLQI balance"> Half </button>
                            <button onClick={() => handleSetAmount(token.mintAddress, 'withdraw', 1)} disabled={actionDisabled || userWlqiBalance === null} className={`px-1 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(actionDisabled || userWlqiBalance === null) ? 'cursor-not-allowed opacity-50' : ''}`} title="Set amount to your maximum wLQI balance"> Max </button>
                        </div>
                    </div>
                    <>
                        <div className="flex items-center">
                            <div className="relative w-full">
                                <input id={`withdraw-${mintAddress}`} type="number" step="any" min="0" placeholder="Amount (wLQI)" value={currentWithdrawAmount} onChange={(e) => handleAmountChange(token.mintAddress, 'withdraw', e.target.value)} className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 w-full text-sm focus:outline-none focus:ring-1 focus:ring-red-500" disabled={actionDisabled} />
                                {!isDelisted && !actionDisabled && actualPercentBN?.gt(targetScaled) && (
                                    <button onClick={() => handleSetTargetAmount(token.mintAddress, 'withdraw')} disabled={actionDisabled} className={`ml-1 px-1 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 rounded text-white text-center ${actionDisabled ? 'cursor-not-allowed opacity-50' : ''}`} title="Set wLQI amount needed to reach target dominance"> To Target </button>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <div className="text-gray-400 text-[10px] h-3">{displayWithdrawInputUsdValue}</div>
                        </div>
                        <button onClick={handleActualWithdraw} disabled={actionDisabled || withdrawInsufficientBalance || withdrawalExceedsLiquidity || (!vaultBalance || vaultBalance.isZero()) || withdrawButtonDisabled} className={`w-full px-1 py-0.5 text-xs rounded text-white truncate ${actionDisabled || withdrawInsufficientBalance || withdrawalExceedsLiquidity || (!vaultBalance || vaultBalance.isZero()) ? BTN_GRAY : (isDelisted ? BTN_GREEN : withdrawBtnClass)} ${(actionDisabled || withdrawInsufficientBalance || withdrawalExceedsLiquidity || (!vaultBalance || vaultBalance.isZero()) || withdrawButtonDisabled) ? 'cursor-not-allowed opacity-50' : ''}`} title={withdrawInsufficientBalance ? "Insufficient wLQI" : withdrawalExceedsLiquidity ? `Insufficient Pool ${symbol}` : (!vaultBalance || vaultBalance.isZero()) ? `Pool vault for ${symbol} is empty.` : isDelisted ? "Withdraw specified wLQI amount (~5% Bonus, 0% net fee)" : withdrawTitle}>{withdrawInsufficientBalance ? "Insufficient wLQI" : withdrawalExceedsLiquidity ? `Insufficient Pool ${symbol}` : (!vaultBalance || vaultBalance.isZero()) ? "Pool Empty" : actionDisabled ? (isWithdrawing ? 'Withdrawing...' : 'Loading...') : isDelisted ? "Withdraw (~5% Bonus)" : withdrawLabel}</button>
                    </>
                    {isDelisted && (
                        <div className="mt-1">
                            <button onClick={handleFullDelistedWithdraw} disabled={actionDisabled || !userHasEnoughForDelisted || (!vaultBalance || vaultBalance.isZero())} className={`w-full px-1 py-0.5 text-xs rounded text-white truncate ${BTN_RED} ${(actionDisabled || !userHasEnoughForDelisted || (!vaultBalance || vaultBalance.isZero())) ? 'cursor-not-allowed opacity-50' : ''}`} title={actionDisabled ? "Action in progress..." : (!vaultBalance || vaultBalance.isZero()) ? `Pool vault empty.` : !requiredWlqiForDelistedFormatted ? "Calc error." : !userHasEnoughForDelisted ? `Insufficient wLQI. Need ~${requiredWlqiForDelistedFormatted}` : `Withdraw entire ${symbol} balance. Requires ~${requiredWlqiForDelistedFormatted} wLQI.`}>{actionDisabled ? (isWithdrawing ? 'Withdrawing...' : '...') : (!vaultBalance || vaultBalance.isZero()) ? "Pool Empty" : !userHasEnoughForDelisted ? "Insufficient wLQI" : `Withdraw Full Balance`}</button>
                        </div>
                    )}
                </div>
            </td>
        </tr>
    );
});
TokenRow.displayName = 'TokenRow';

// --- ADDED: TokenCard Component (Now with full fee logic) ---
const TokenCard: React.FC<TokenCardProps> = React.memo(({
    token,
    totalPoolValueScaled,
    wLqiValueScaled,
    wLqiDecimals,
    userWlqiBalance,
    onDeposit,
    onWithdraw,
    isDepositing,
    isWithdrawing,
    depositAmounts,
    withdrawAmounts,
    handleAmountChange,
    isLoadingUserData,
    isLoadingPublicData,
    hideDepositColumn,
    handleSetAmount,
    handleSetTargetAmount,
    totalTargetDominance,
}) => {
    // --- Re-use calculations and formatting logic from TokenRow --- 
    const { mintAddress, symbol, icon, priceData, vaultBalance, decimals, targetDominance, isDelisted } = token;
    const [currentIconSrc, setCurrentIconSrc] = useState(icon);
    const actionDisabled = isDepositing || isWithdrawing || isLoadingPublicData || isLoadingUserData;
    const tokenValueUsd = vaultBalance !== null && decimals !== null
        ? calculateTokenValueUsdScaled(vaultBalance, decimals, priceData)
        : null;
    const targetScaled = calculateTargetPercentageScaled(targetDominance, totalTargetDominance);
    const currentDepositAmount = depositAmounts[mintAddress] || '';
    const currentWithdrawAmount = withdrawAmounts[mintAddress] || '';
    const isDepositInputFilled = currentDepositAmount !== '' && parseFloat(currentDepositAmount) > 0;
    const isWithdrawInputFilled = currentWithdrawAmount !== '' && parseFloat(currentWithdrawAmount) > 0;

    // Insufficient balance checks
    let depositInsufficientBalance = false;
    if (isDepositInputFilled && token.userBalance && decimals !== null) {
        try {
            const inputAmountBn = new BN(parseUnits(currentDepositAmount, decimals).toString());
            if (inputAmountBn.gt(token.userBalance)) depositInsufficientBalance = true;
        } catch (e) { console.warn("Error parsing deposit for card balance check:", e); }
    }
    let withdrawInsufficientBalance = false;
    if (isWithdrawInputFilled && userWlqiBalance && wLqiDecimals !== null) {
        try {
            const inputWlqiAmountBn = new BN(parseUnits(currentWithdrawAmount, wLqiDecimals).toString());
            if (inputWlqiAmountBn.gt(userWlqiBalance)) withdrawInsufficientBalance = true;
        } catch (e) { console.warn("Error parsing withdraw for card balance check:", e); }
    }

    // --- Fee & Liquidity Calculations (Copied from TokenRow) --- START
    let estimatedDepositFeeBps = BASE_FEE_BPS;
    let estimatedWithdrawFeeBps = BASE_FEE_BPS;
    let withdrawalExceedsLiquidity = false;
    try {
        if (!totalPoolValueScaled) {
            estimatedDepositFeeBps = BASE_FEE_BPS;
            estimatedWithdrawFeeBps = BASE_FEE_BPS;
        } else {
            const targetDominanceScaledBn = (totalTargetDominance && !totalTargetDominance.isZero())
                ? targetDominance.mul(DOMINANCE_SCALE).div(totalTargetDominance)
                : new BN(0);
            const actualDomPreScaled = (tokenValueUsd && !totalPoolValueScaled.isZero())
                ? tokenValueUsd.mul(DOMINANCE_SCALE).div(totalPoolValueScaled)
                : null;

            if (actualDomPreScaled === null) {
                estimatedDepositFeeBps = BASE_FEE_BPS;
                estimatedWithdrawFeeBps = BASE_FEE_BPS;
            } else {
                const relDevPreBps = calculateRelativeDeviationBpsBN(actualDomPreScaled, targetDominanceScaledBn);
                // Deposit Fee Estimate
                if (isDepositInputFilled && decimals !== null && priceData && !totalPoolValueScaled.isZero() && totalTargetDominance && !totalTargetDominance.isZero()) {
                    let valueChangeUsdScaled = new BN(0);
                    try {
                        const inputAmountBn = new BN(parseUnits(currentDepositAmount, decimals).toString());
                        valueChangeUsdScaled = calculateTokenValueUsdScaled(inputAmountBn, decimals, priceData);
                        if (!valueChangeUsdScaled.isZero()) {
                            const totalPoolValuePostScaled = totalPoolValueScaled.add(valueChangeUsdScaled);
                            const tokenValuePostScaled = (tokenValueUsd ?? new BN(0)).add(valueChangeUsdScaled);
                            const actualDomPostScaled = (!totalPoolValuePostScaled.isZero())
                                ? tokenValuePostScaled.mul(DOMINANCE_SCALE).div(totalPoolValuePostScaled)
                                : null;
                            if (actualDomPostScaled !== null) {
                                const relDevPostBpsBN = calculateRelativeDeviationBpsBN(actualDomPostScaled, targetDominanceScaledBn);
                                const scaleFactor = new BN(100);
                                const avgRelDevBpsBN = relDevPreBps.add(relDevPostBpsBN).mul(scaleFactor).div(new BN(2).mul(scaleFactor));
                                const rawDynamicFeeBpsBN = avgRelDevBpsBN.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                                let effectiveDynamicFeeBpsBN = rawDynamicFeeBpsBN;
                                if (effectiveDynamicFeeBpsBN.lt(BN_DEPOSIT_PREMIUM_CAP_BPS)) {
                                    effectiveDynamicFeeBpsBN = BN_DEPOSIT_PREMIUM_CAP_BPS;
                                }
                                let totalFeeBN = BN_BASE_FEE_BPS.add(effectiveDynamicFeeBpsBN);
                                if (totalFeeBN.gt(BN_DEPOSIT_MAX_FEE_BPS)) {
                                    totalFeeBN = BN_DEPOSIT_MAX_FEE_BPS;
                                }
                                estimatedDepositFeeBps = Math.round(totalFeeBN.toNumber());
                            } else {
                                // Cannot calculate post-state, fallback to pre-state fee
                                const rawDynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                                let effectiveDynamicFeePreBpsBN = rawDynamicFeePreBpsBN;
                                if (effectiveDynamicFeePreBpsBN.lt(BN_DEPOSIT_PREMIUM_CAP_BPS)) {
                                    effectiveDynamicFeePreBpsBN = BN_DEPOSIT_PREMIUM_CAP_BPS;
                                }
                                let totalFeePreBN = BN_BASE_FEE_BPS.add(effectiveDynamicFeePreBpsBN);
                                if (totalFeePreBN.gt(BN_DEPOSIT_MAX_FEE_BPS)) {
                                    totalFeePreBN = BN_DEPOSIT_MAX_FEE_BPS;
                                }
                                estimatedDepositFeeBps = Math.round(totalFeePreBN.toNumber());
                            }
                        } else {
                            // Value change is zero, estimate based on pre-state
                            const rawDynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                            let effectiveDynamicFeePreBpsBN = rawDynamicFeePreBpsBN;
                            if (effectiveDynamicFeePreBpsBN.lt(BN_DEPOSIT_PREMIUM_CAP_BPS)) {
                                effectiveDynamicFeePreBpsBN = BN_DEPOSIT_PREMIUM_CAP_BPS;
                            }
                            let totalFeePreBN = BN_BASE_FEE_BPS.add(effectiveDynamicFeePreBpsBN);
                            if (totalFeePreBN.gt(BN_DEPOSIT_MAX_FEE_BPS)) {
                                totalFeePreBN = BN_DEPOSIT_MAX_FEE_BPS;
                            }
                            estimatedDepositFeeBps = Math.round(totalFeePreBN.toNumber());
                        }
                    } catch (e) {
                        console.error("Error during card deposit fee estimation:", e);
                        estimatedDepositFeeBps = BASE_FEE_BPS;
                    }
                } else {
                     // No deposit amount or missing data, estimate based on pre-state
                    const rawDynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                    let effectiveDynamicFeePreBpsBN = rawDynamicFeePreBpsBN;
                    if (effectiveDynamicFeePreBpsBN.lt(BN_DEPOSIT_PREMIUM_CAP_BPS)) {
                        effectiveDynamicFeePreBpsBN = BN_DEPOSIT_PREMIUM_CAP_BPS;
                    }
                    let totalFeePreBN = BN_BASE_FEE_BPS.add(effectiveDynamicFeePreBpsBN);
                    if (totalFeePreBN.gt(BN_DEPOSIT_MAX_FEE_BPS)) {
                        totalFeePreBN = BN_DEPOSIT_MAX_FEE_BPS;
                    }
                    estimatedDepositFeeBps = Math.round(totalFeePreBN.toNumber());
                }

                // Withdraw Fee / Liquidity Estimate
                if (isWithdrawInputFilled && wLqiDecimals !== null && wLqiValueScaled && !wLqiValueScaled.isZero() && priceData && decimals !== null && vaultBalance && !vaultBalance.isZero()) {
                    let valueChangeUsdScaled = new BN(0);
                    try {
                        const inputWlqiAmountBn = new BN(parseUnits(currentWithdrawAmount, wLqiDecimals).toString());
                        const scaleFactorWlqi = new BN(10).pow(new BN(wLqiDecimals));
                        if (!scaleFactorWlqi.isZero()) {
                            valueChangeUsdScaled = inputWlqiAmountBn.mul(wLqiValueScaled).div(scaleFactorWlqi);
                        }

                        const requiredTokenAmountBn_scaled = usdToTokenAmount(valueChangeUsdScaled, decimals, priceData);
                        const requiredTokenAmountBn = requiredTokenAmountBn_scaled.div(PRECISION_SCALE_FACTOR);
                        if (requiredTokenAmountBn.gt(vaultBalance)) {
                            withdrawalExceedsLiquidity = true;
                        } else {
                            withdrawalExceedsLiquidity = false;
                        }

                        if (!withdrawalExceedsLiquidity && !valueChangeUsdScaled.isZero()) {
                            const totalPoolValuePostScaled = totalPoolValueScaled.gt(valueChangeUsdScaled) ? totalPoolValueScaled.sub(valueChangeUsdScaled) : new BN(0);
                            const currentTokenValue = tokenValueUsd ?? new BN(0);
                            const tokenValuePostScaled = currentTokenValue.gt(valueChangeUsdScaled) ? currentTokenValue.sub(valueChangeUsdScaled) : new BN(0);
                            const actualDomPostScaled = (!totalPoolValuePostScaled.isZero())
                                ? tokenValuePostScaled.mul(DOMINANCE_SCALE).div(totalPoolValuePostScaled)
                                : null;
                            if (actualDomPostScaled !== null) {
                                const relDevPostBpsBN = calculateRelativeDeviationBpsBN(actualDomPostScaled, targetDominanceScaledBn);
                                const avgRelDevBpsBN = relDevPreBps.add(relDevPostBpsBN).div(new BN(2));
                                const withdrawDynamicFeeBpsBN = avgRelDevBpsBN.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                                let totalFeeBN = BN_BASE_FEE_BPS.sub(withdrawDynamicFeeBpsBN);
                                if (totalFeeBN.lt(BN_WITHDRAW_FEE_FLOOR_BPS)) {
                                    totalFeeBN = BN_WITHDRAW_FEE_FLOOR_BPS;
                                } else if (totalFeeBN.gt(BN_WITHDRAW_MAX_FEE_BPS)) {
                                    totalFeeBN = BN_WITHDRAW_MAX_FEE_BPS;
                                }
                                estimatedWithdrawFeeBps = Math.round(totalFeeBN.toNumber());
                            } else {
                                // Cannot calculate post-state, fallback to pre-state fee
                                const dynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                                let totalFeePreBN = BN_BASE_FEE_BPS.sub(dynamicFeePreBpsBN);
                                if (totalFeePreBN.lt(BN_WITHDRAW_FEE_FLOOR_BPS)) {
                                    totalFeePreBN = BN_WITHDRAW_FEE_FLOOR_BPS;
                                } else if (totalFeePreBN.gt(BN_WITHDRAW_MAX_FEE_BPS)) {
                                    totalFeePreBN = BN_WITHDRAW_MAX_FEE_BPS;
                                }
                                estimatedWithdrawFeeBps = Math.round(totalFeePreBN.toNumber());
                            }
                        } else if (!withdrawalExceedsLiquidity) {
                             // Value change zero or liquidity sufficient, estimate based on pre-state
                            const dynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                            let totalFeePreBN = BN_BASE_FEE_BPS.sub(dynamicFeePreBpsBN);
                            if (totalFeePreBN.lt(BN_WITHDRAW_FEE_FLOOR_BPS)) {
                                totalFeePreBN = BN_WITHDRAW_FEE_FLOOR_BPS;
                            } else if (totalFeePreBN.gt(BN_WITHDRAW_MAX_FEE_BPS)) {
                                totalFeePreBN = BN_WITHDRAW_MAX_FEE_BPS;
                            }
                            estimatedWithdrawFeeBps = Math.round(totalFeePreBN.toNumber());
                        }
                        // If withdrawalExceedsLiquidity = true, fee remains default, handled by button state
                    } catch (e) {
                        console.error("Error during card withdraw fee/liquidity estimation:", e);
                        estimatedWithdrawFeeBps = BASE_FEE_BPS;
                        withdrawalExceedsLiquidity = false; // Assume ok if calc fails
                    }
                } else {
                     // No withdraw amount or missing data, estimate based on pre-state
                    const dynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                    let totalFeePreBN = BN_BASE_FEE_BPS.sub(dynamicFeePreBpsBN);
                    if (totalFeePreBN.lt(BN_WITHDRAW_FEE_FLOOR_BPS)) {
                        totalFeePreBN = BN_WITHDRAW_FEE_FLOOR_BPS;
                    } else if (totalFeePreBN.gt(BN_WITHDRAW_MAX_FEE_BPS)) {
                        totalFeePreBN = BN_WITHDRAW_MAX_FEE_BPS;
                    }
                    estimatedWithdrawFeeBps = Math.round(totalFeePreBN.toNumber());
                    withdrawalExceedsLiquidity = false; // Assume ok if no amount entered
                }
            }
        }
    } catch (e) {
        console.error("Error calculating card fee estimate:", e);
        estimatedDepositFeeBps = BASE_FEE_BPS;
        estimatedWithdrawFeeBps = BASE_FEE_BPS;
    }
    // --- Fee & Liquidity Calculations (Copied from TokenRow) --- END

    // --- Button State & Labels (Copied and adapted from TokenRow) --- START
    let depositButtonDisabled = actionDisabled || !isDepositInputFilled || isDelisted || depositInsufficientBalance;
    // Combine all withdraw disabling conditions
    let withdrawButtonDisabled = actionDisabled 
        || !isWithdrawInputFilled 
        || withdrawInsufficientBalance 
        || withdrawalExceedsLiquidity 
        || (isDelisted && (!vaultBalance || vaultBalance.isZero()));

    let depositBtnClass = BTN_GRAY;
    let withdrawBtnClass = BTN_GRAY;
    let depositLabel = isDepositing ? 'Depositing...' : 'Deposit';
    let withdrawLabel = isWithdrawing ? 'Withdrawing...' : 'Withdraw';
    let depositTitle = 'Enter amount to deposit';
    let withdrawTitle = 'Enter wLQI amount to withdraw';

    // Fee string formatting functions (copied from TokenRow)
    const formatFeeString = (estimatedBps: number, isDepositAction: boolean) => {
        let feeString: string;
        let title: string;
        if (isDepositAction) {
            if (estimatedBps < 0) {
                const bonusPercent = (Math.abs(estimatedBps) / BPS_SCALE * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                feeString = `(~${bonusPercent}% Bonus)`;
                title = `Est. Bonus: ~${bonusPercent}%`;
            } else if (estimatedBps === 0) {
                feeString = `(0.00%)`;
                title = "Est. Total Fee: 0.00%";
            } else {
                const displayPercent = (estimatedBps / BPS_SCALE * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                feeString = `(~${displayPercent}% Fee)`;
                title = `Est. Total Fee: ~${displayPercent}%`;
            }
        } else {
            if (estimatedBps === 0) {
                feeString = "(0.00%)";
                title = "Minimum fee applied (0.00%)";
            } else if (estimatedBps > 0) {
                const displayPercent = (estimatedBps / BPS_SCALE * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                feeString = `(~${displayPercent}% Fee)`;
                title = `Est. Total Fee: ~${displayPercent}%`;
            } else {
                feeString = "(Fee Error)";
                title = "Error estimating fee";
            }
        }
        return { feeString, title };
    };
    const formatDelistedWithdrawFeeString = () => {
        const feeString = "(~5% Bonus)";
        const title = "Fixed bonus applied for delisted token withdrawal (0% net fee).";
        return { feeString, title };
    };

    // Determine button colors and incorporate fee strings
    if (!actionDisabled) {
        if (estimatedDepositFeeBps <= 0) {
            depositBtnClass = BTN_GREEN;
        } else {
            depositBtnClass = BTN_RED;
        }
        // Only set withdraw color if not disabled by liquidity/balance issues
        if (!withdrawalExceedsLiquidity && !withdrawInsufficientBalance && !(isDelisted && (!vaultBalance || vaultBalance.isZero()))) {
             if (isDelisted) {
                 withdrawBtnClass = BTN_GREEN; // Delisted withdraw always shows green if possible
             } else if (estimatedWithdrawFeeBps === 0) {
                 withdrawBtnClass = BTN_GREEN;
             } else if (estimatedWithdrawFeeBps > 0) {
                 withdrawBtnClass = BTN_RED;
             }
         }
        
        const { feeString: depositFeeString, title: depositTitleBase } = formatFeeString(estimatedDepositFeeBps, true);
        depositLabel = `Deposit ${depositFeeString}`;
        depositTitle = depositTitleBase;
        
        const { feeString: withdrawFeeString, title: withdrawTitleBase } = isDelisted ? formatDelistedWithdrawFeeString() : formatFeeString(estimatedWithdrawFeeBps, false);
        withdrawLabel = `Withdraw ${withdrawFeeString}`;
        withdrawTitle = withdrawTitleBase;
    }

    // Apply overrides for insufficient balance/liquidity AFTER fee strings are calculated
    if (depositInsufficientBalance) {
        depositLabel = `Insufficient ${symbol}`;
        depositTitle = `Deposit amount exceeds your ${symbol} balance`;
        depositButtonDisabled = true; // Ensure disabled
        depositBtnClass = BTN_GRAY;
    }
    if (withdrawInsufficientBalance) {
        withdrawLabel = "Insufficient wLQI";
        withdrawTitle = "Withdrawal amount exceeds your wLQI balance";
        withdrawButtonDisabled = true; // Ensure disabled
        withdrawBtnClass = BTN_GRAY;
    } else if (withdrawalExceedsLiquidity) {
        withdrawLabel = `Insufficient Pool ${symbol}`;
        withdrawTitle = `Pool lacks sufficient ${symbol} for withdrawal`;
        withdrawButtonDisabled = true; // Ensure disabled
        withdrawBtnClass = BTN_GRAY;
    } else if (isDelisted && (!vaultBalance || vaultBalance.isZero())) {
         withdrawLabel = "Pool Empty";
         withdrawTitle = "No balance of this delisted token in the pool to withdraw.";
         withdrawButtonDisabled = true; // Ensure disabled
         withdrawBtnClass = BTN_GRAY;
    }
    // --- Button State & Labels (Copied and adapted from TokenRow) --- END

    // Formatted display values
    const displayBalance = formatRawAmountString(vaultBalance?.toString(), decimals, true, 2);
    const displayValue = formatScaledBnToDollarString(tokenValueUsd, USD_SCALE);
    const displaySymbol = symbol;
    const displayTargetPercent = formatScaledToPercentageString(targetScaled);
    const displayActualPercent = (typeof token.actualDominancePercent === 'number')
        ? token.actualDominancePercent.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
        : '--.--';
    const currentUserBalance = token.userBalance;
    const formattedUserTokenBalance = currentUserBalance !== null
        ? formatRawAmountString(currentUserBalance.toString(), decimals, true, 2)
        : null;
    const displayUserTokenBalance = formattedUserTokenBalance ? `${formattedUserTokenBalance} ${symbol}` : '--.--';
    const formattedUserWlqiBalance = userWlqiBalance !== null && wLqiDecimals !== null
        ? formatRawAmountString(userWlqiBalance.toString(), wLqiDecimals, true, 2)
        : null;
    const displayUserWlqiBalance = formattedUserWlqiBalance ? `${formattedUserWlqiBalance} wLQI` : '--.--';
    let displayDepositInputUsdValue = '$ --.--';
    if (isDepositInputFilled && decimals !== null && priceData) {
        try {
            const inputAmountBn = new BN(parseUnits(currentDepositAmount, decimals).toString());
            const inputUsdValueScaled = calculateTokenValueUsdScaled(inputAmountBn, decimals, priceData);
            displayDepositInputUsdValue = formatScaledBnToDollarString(inputUsdValueScaled, USD_SCALE);
        } catch { displayDepositInputUsdValue = '$ Invalid'; }
    } else if (currentDepositAmount === '' || currentDepositAmount === '0') {
        displayDepositInputUsdValue = '$ 0.00';
    }
    let displayWithdrawInputUsdValue = '$ --.--';
    if (isWithdrawInputFilled && wLqiDecimals !== null && wLqiValueScaled) {
        try {
            const inputWlqiAmountBn = new BN(parseUnits(currentWithdrawAmount, wLqiDecimals).toString());
            const scaleFactorWlqi = new BN(10).pow(new BN(wLqiDecimals));
            if (!scaleFactorWlqi.isZero()) {
                const inputUsdValueScaled = inputWlqiAmountBn.mul(wLqiValueScaled).div(scaleFactorWlqi);
                displayWithdrawInputUsdValue = formatScaledBnToDollarString(inputUsdValueScaled, USD_SCALE);
            }
        } catch { displayWithdrawInputUsdValue = '$ Invalid'; }
    } else if (currentWithdrawAmount === '' || currentWithdrawAmount === '0') {
        displayWithdrawInputUsdValue = '$ 0.00';
    }

    // Button callbacks
    const handleActualDeposit = () => onDeposit(mintAddress, currentDepositAmount, decimals);
    const handleActualWithdraw = () => onWithdraw(mintAddress, currentWithdrawAmount, false);
    const handleFullDelistedWithdraw = () => onWithdraw(mintAddress, "0", true);
    let requiredWlqiForDelistedBn: BN | null = null;
    let requiredWlqiForDelistedFormatted: string | null = null;
    let userHasEnoughForDelisted = false;
    if (isDelisted && vaultBalance && !vaultBalance.isZero() && decimals !== null && wLqiValueScaled && !wLqiValueScaled.isZero() && wLqiDecimals !== null) {
        try {
            const T_usd_scaled = calculateTokenValueUsdScaled(vaultBalance, decimals, priceData);
            if (T_usd_scaled && T_usd_scaled.gtn(0)) {
                const bonusNumerator = new BN(100);
                const bonusDenominator = new BN(105);
                const T_usd_scaled_adjusted = T_usd_scaled.mul(bonusNumerator).div(bonusDenominator);
                const requiredWlqi = usdToWlqiAmount(T_usd_scaled_adjusted, wLqiValueScaled, wLqiDecimals);
                requiredWlqiForDelistedBn = requiredWlqi.add(new BN(1));
                requiredWlqiForDelistedFormatted = formatRawAmountString(requiredWlqiForDelistedBn.toString(), wLqiDecimals, true, 4);
                if (userWlqiBalance && requiredWlqiForDelistedBn.lte(userWlqiBalance)) {
                    userHasEnoughForDelisted = true;
                }
            }
        } catch (e) {
            console.error(`Error calculating required wLQI for delisted ${symbol}:`, e);
            requiredWlqiForDelistedBn = null;
            requiredWlqiForDelistedFormatted = null;
            userHasEnoughForDelisted = false;
        }
    }
    const actualPercentBN = token.actualDominancePercent !== null && token.actualDominancePercent !== undefined
        ? new BN(Math.round(token.actualDominancePercent * BPS_SCALE))
        : null;

    return (
        <div className={`border border-gray-600 rounded-lg p-3 ${isDelisted ? 'bg-red-900/20' : 'bg-gray-750'} ${actionDisabled ? 'opacity-50' : ''}`}>
            {/* --- Header --- */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-600">
                <div className="flex items-center space-x-2">
                    <Image
                        src={currentIconSrc}
                        alt={symbol}
                        className="w-6 h-6 rounded-full"
                        width={24}
                        height={24}
                        onError={() => {
                            if (currentIconSrc !== '/tokens/default.png') {
                                setCurrentIconSrc('/tokens/default.png');
                            }
                        }}
                    />
                    <span className="font-semibold text-white text-lg">{displaySymbol}</span>
                </div>
                {isDelisted && <span className="text-xs text-red-400 font-medium bg-red-900/50 px-1.5 py-0.5 rounded">Delisted</span>}
            </div>

            {/* --- Data Section --- */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-4 text-sm">
                <div className="text-gray-400">Pool Balance:</div>
                <div className="text-right text-white font-medium">{displayValue}</div>
                
                <div className="text-gray-400"></div> {/* Empty cell for alignment */}
                <div className="text-right text-gray-300 text-xs">{displayBalance} {displaySymbol}</div>

                <div className="text-gray-400 mt-1">Actual %:</div>
                <div className="text-right text-white font-medium mt-1">{displayActualPercent}%</div>

                <div className="text-gray-400">Target %:</div>
                <div className="text-right text-white font-medium">{displayTargetPercent}%</div>
            </div>

            {/* --- Deposit Section --- */}
            {!hideDepositColumn && !isDelisted && (
                <div className="mb-4 border-t border-gray-600 pt-3">
                    <h4 className="text-sm font-semibold mb-2 text-gray-200">Deposit {displaySymbol}</h4>
                    <div className="text-gray-400 text-xs mb-1 flex items-center justify-between">
                         <div className="flex items-center">
                             <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="mr-1"><path d="M13.8205 12.2878C13.8205 12.4379 13.791 12.5865 13.7335 12.7252C13.6761 12.8638 13.5919 12.9898 13.4858 13.0959C13.3797 13.2021 13.2537 13.2863 13.115 13.3437C12.9764 13.4011 12.8278 13.4307 12.6777 13.4307H3.04911C2.746 13.4307 2.45531 13.3103 2.24099 13.0959C2.02666 12.8816 1.90625 12.5909 1.90625 12.2878V4.18992C1.90625 3.68474 2.10693 3.20026 2.46414 2.84305C2.82135 2.48584 3.30584 2.28516 3.81101 2.28516H10.3718C10.6749 2.28516 10.9656 2.40556 11.1799 2.61989C11.3942 2.83422 11.5146 3.12491 11.5146 3.42801L11.5142 4.20668H12.6777C12.8278 4.20668 12.9764 4.23624 13.115 4.29367C13.2537 4.35111 13.3797 4.43529 13.4858 4.54141C13.5919 4.64754 13.6761 4.77353 13.7335 4.91218C13.791 5.05084 13.8205 5.19946 13.8205 5.34954V12.2878ZM12.6777 5.34954H3.04911V12.2878H12.6777L12.6773 10.356H8.43996V7.28173L12.6773 7.28135V5.34992L12.6777 5.34954ZM12.6777 8.4242H9.58244V9.21316H12.6773V8.42459L12.6777 8.4242ZM10.3718 3.42801H3.81101C3.60894 3.42801 3.41515 3.50829 3.27226 3.65117C3.12938 3.79405 3.04911 3.98785 3.04911 4.18992L3.04873 4.20668H10.3714V3.42801H10.3718Z"></path></svg>
                             <span>Balance: {displayUserTokenBalance}</span>
                         </div>
                         <div className="flex items-center space-x-1">
                             <button onClick={() => handleSetAmount(mintAddress, 'deposit', 0.5)} disabled={actionDisabled || token.userBalance === null || isDelisted} className={`px-1.5 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(actionDisabled || token.userBalance === null || isDelisted) ? 'cursor-not-allowed opacity-50' : ''}`} title="Set 50%">Half</button>
                             <button onClick={() => handleSetAmount(mintAddress, 'deposit', 1)} disabled={actionDisabled || token.userBalance === null || isDelisted} className={`px-1.5 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(actionDisabled || token.userBalance === null || isDelisted) ? 'cursor-not-allowed opacity-50' : ''}`} title="Set Max">Max</button>
                         </div>
                    </div>
                    <div className="flex items-center space-x-2 mb-1">
                        <input id={`deposit-card-${mintAddress}`} type="number" step="any" min="0" placeholder={`Amount (${symbol})`} value={currentDepositAmount} onChange={(e) => handleAmountChange(mintAddress, 'deposit', e.target.value)} className="flex-grow bg-gray-800 text-white px-2 py-1.5 rounded border border-gray-600 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" disabled={actionDisabled || isDelisted} />
                        {!actionDisabled && actualPercentBN?.lt(targetScaled) && (
                            <button onClick={() => handleSetTargetAmount(mintAddress, 'deposit')} disabled={actionDisabled} className={`px-1.5 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 rounded text-white text-center whitespace-nowrap ${actionDisabled ? 'cursor-not-allowed opacity-50' : ''}`} title="Set target amount">To Target</button>
                        )}
                    </div>
                    <div className="text-gray-400 text-xs text-right h-4 mb-1">{displayDepositInputUsdValue}</div>
                    <button onClick={handleActualDeposit} disabled={depositButtonDisabled} className={`w-full px-3 py-1.5 text-sm rounded text-white font-medium ${depositBtnClass} ${depositButtonDisabled ? 'cursor-not-allowed opacity-50' : ''}`} title={depositTitle}>{depositLabel}</button>
                </div>
            )}

            {/* --- Withdraw Section --- */}
            <div className={`${!hideDepositColumn && !isDelisted ? 'border-t border-gray-600 pt-3' : '' }`}>
                 {/* MODIFIED: Changed heading to use displaySymbol */}
                 <h4 className="text-sm font-semibold mb-2 text-gray-200">Withdraw {displaySymbol}</h4>
                 <div className="text-gray-400 text-xs mb-1 flex items-center justify-between">
                     <div className="flex items-center">
                         <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="mr-1"><path d="M13.8205 12.2878C13.8205 12.4379 13.791 12.5865 13.7335 12.7252C13.6761 12.8638 13.5919 12.9898 13.4858 13.0959C13.3797 13.2021 13.2537 13.2863 13.115 13.3437C12.9764 13.4011 12.8278 13.4307 12.6777 13.4307H3.04911C2.746 13.4307 2.45531 13.3103 2.24099 13.0959C2.02666 12.8816 1.90625 12.5909 1.90625 12.2878V4.18992C1.90625 3.68474 2.10693 3.20026 2.46414 2.84305C2.82135 2.48584 3.30584 2.28516 3.81101 2.28516H10.3718C10.6749 2.28516 10.9656 2.40556 11.1799 2.61989C11.3942 2.83422 11.5146 3.12491 11.5146 3.42801L11.5142 4.20668H12.6777C12.8278 4.20668 12.9764 4.23624 13.115 4.29367C13.2537 4.35111 13.3797 4.43529 13.4858 4.54141C13.5919 4.64754 13.6761 4.77353 13.7335 4.91218C13.791 5.05084 13.8205 5.19946 13.8205 5.34954V12.2878ZM12.6777 5.34954H3.04911V12.2878H12.6777L12.6773 10.356H8.43996V7.28173L12.6773 7.28135V5.34992L12.6777 5.34954ZM12.6777 8.4242H9.58244V9.21316H12.6773V8.42459L12.6777 8.4242ZM10.3718 3.42801H3.81101C3.60894 3.42801 3.41515 3.50829 3.27226 3.65117C3.12938 3.79405 3.04911 3.98785 3.04911 4.18992L3.04873 4.20668H10.3714V3.42801H10.3718Z"></path></svg>
                         <span>Balance: {displayUserWlqiBalance}</span>
                     </div>
                     <div className="flex items-center space-x-1">
                          <button onClick={() => handleSetAmount(mintAddress, 'withdraw', 0.5)} disabled={actionDisabled || userWlqiBalance === null} className={`px-1.5 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(actionDisabled || userWlqiBalance === null) ? 'cursor-not-allowed opacity-50' : ''}`} title="Set 50%">Half</button>
                          <button onClick={() => handleSetAmount(mintAddress, 'withdraw', 1)} disabled={actionDisabled || userWlqiBalance === null} className={`px-1.5 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(actionDisabled || userWlqiBalance === null) ? 'cursor-not-allowed opacity-50' : ''}`} title="Set Max">Max</button>
                     </div>
                 </div>
                 <div className="flex items-center space-x-2 mb-1">
                     <input id={`withdraw-card-${mintAddress}`} type="number" step="any" min="0" placeholder="Amount (wLQI)" value={currentWithdrawAmount} onChange={(e) => handleAmountChange(mintAddress, 'withdraw', e.target.value)} className="flex-grow bg-gray-800 text-white px-2 py-1.5 rounded border border-gray-600 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" disabled={actionDisabled} />
                     {!isDelisted && !actionDisabled && actualPercentBN?.gt(targetScaled) && (
                         <button onClick={() => handleSetTargetAmount(mintAddress, 'withdraw')} disabled={actionDisabled} className={`px-1.5 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 rounded text-white text-center whitespace-nowrap ${actionDisabled ? 'cursor-not-allowed opacity-50' : ''}`} title="Set target amount">To Target</button>
                     )}
                 </div>
                 <div className="text-gray-400 text-xs text-right h-4 mb-1">{displayWithdrawInputUsdValue}</div>
                 <button onClick={handleActualWithdraw} disabled={withdrawButtonDisabled} className={`w-full px-3 py-1.5 text-sm rounded text-white font-medium ${withdrawBtnClass} ${withdrawButtonDisabled ? 'cursor-not-allowed opacity-50' : ''}`} title={withdrawTitle}>{withdrawLabel}</button>
                {isDelisted && (
                    <div className="mt-2">
                        <button onClick={handleFullDelistedWithdraw} disabled={actionDisabled || !userHasEnoughForDelisted || (!vaultBalance || vaultBalance.isZero())} className={`w-full px-3 py-1.5 text-sm rounded text-white font-medium ${BTN_RED} ${(actionDisabled || !userHasEnoughForDelisted || (!vaultBalance || vaultBalance.isZero())) ? 'cursor-not-allowed opacity-50' : ''}`} title={actionDisabled ? "..." : (!vaultBalance || vaultBalance.isZero()) ? `Pool vault empty.` : !requiredWlqiForDelistedFormatted ? "Calc error." : !userHasEnoughForDelisted ? `Insufficient wLQI. Need ~${requiredWlqiForDelistedFormatted}` : `Withdraw entire ${symbol} balance. Requires ~${requiredWlqiForDelistedFormatted} wLQI.`}>{actionDisabled ? (isWithdrawing ? 'Withdrawing...' : '...') : (!vaultBalance || vaultBalance.isZero()) ? "Pool Empty" : !userHasEnoughForDelisted ? "Insufficient wLQI" : `Withdraw Full Balance`}</button>
                    </div>
                 )}
            </div>
        </div>
    );
});
TokenCard.displayName = 'TokenCard';

// --- TokenTable Component --- (Main component definition)
export const TokenTable = React.memo<TokenTableProps>(({ // Existing React.memo wrapper
    tokenData,
    totalPoolValueScaled,
    wLqiValueScaled,
    wLqiDecimals,
    userWlqiBalance,
    onDeposit,
    onWithdraw,
    isDepositing,
    isWithdrawing,
    depositAmounts,
    withdrawAmounts,
    handleAmountChange,
    isLoadingUserData,
    isLoadingPublicData,
    hideDepositColumn = false,
}) => {
    const [sortKey, setSortKey] = useState<SortableKey | null>('targetPercent');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const totalTargetDominance = useMemo(() => {
        if (!tokenData) return new BN(0);
        return calculateTotalTargetDominance(tokenData);
    }, [tokenData]);

    const handleSort = (key: SortableKey) => {
        if (sortKey === key) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    const sortedTokenData = useMemo(() => {
        if (!tokenData) return [];
        const dataToSort = [...tokenData];
        if (!sortKey) return dataToSort;
        const getCompareValues = (tokenItem: ProcessedTokenData) => {
            const tokenValueUsd = tokenItem.vaultBalance !== null && tokenItem.decimals !== null
                ? calculateTokenValueUsdScaled(tokenItem.vaultBalance, tokenItem.decimals, tokenItem.priceData)
                : null;
            const targetScaled = calculateTargetPercentageScaled(tokenItem.targetDominance, totalTargetDominance);
            return {
                symbol: tokenItem.symbol,
                value: tokenValueUsd ?? new BN(-1),
                targetPercent: targetScaled,
            };
        };
        dataToSort.sort((a, b) => {
            const valuesA = getCompareValues(a);
            const valuesB = getCompareValues(b);
            let compareResult = 0;
            switch (sortKey) {
                case 'symbol': compareResult = valuesA.symbol.localeCompare(valuesB.symbol); break;
                case 'value': compareResult = valuesA.value.cmp(valuesB.value); break;
                case 'targetPercent': compareResult = valuesA.targetPercent.cmp(valuesB.targetPercent); break;
            }
            return sortDirection === 'asc' ? compareResult : -compareResult;
        });
        return dataToSort;
    }, [tokenData, sortKey, sortDirection, totalTargetDominance]);

    const handleSetAmount = useCallback((mintAddress: string, action: 'deposit' | 'withdraw', fraction: number) => {
        if (!tokenData) return;
        let amountToSet = '0';
        const currentToken = action === 'deposit' ? tokenData.find(t => t.mintAddress === mintAddress) : null;
        if (action === 'deposit') {
            if (!currentToken || currentToken.userBalance === null || currentToken.decimals === null) return;
            const fullAmountBn = currentToken.userBalance;
            const targetAmountBn = fraction === 1 ? fullAmountBn : fullAmountBn.div(new BN(2));
            amountToSet = formatUnits(targetAmountBn.toString(), currentToken.decimals);
        } else {
            if (!userWlqiBalance || wLqiDecimals === null) return;
            const fullAmountBn = userWlqiBalance;
            const targetAmountBn = fraction === 1 ? fullAmountBn : fullAmountBn.div(new BN(2));
            amountToSet = formatUnits(targetAmountBn.toString(), wLqiDecimals);
        }
        if (amountToSet.endsWith('.0')) {
            amountToSet = amountToSet.substring(0, amountToSet.length - 2);
        }
        handleAmountChange(mintAddress, action, amountToSet);
    }, [tokenData, userWlqiBalance, wLqiDecimals, handleAmountChange]);

    const handleSetTargetAmount = useCallback((mintAddress: string, action: 'deposit' | 'withdraw') => {
        console.log(`Calculating target amount for ${mintAddress}, action: ${action}`);
        const currentToken = tokenData?.find(t => t.mintAddress === mintAddress);
        if (!currentToken || currentToken.decimals === null || currentToken.targetDominance.isNeg()) {
            toast.error("Token data invalid for target calculation."); return;
        }
        let isTokenDataInvalid = false;
        if ((action === 'deposit' || !currentToken.isDelisted) && currentToken.targetDominance.isZero()) {
            isTokenDataInvalid = true;
        }
        if (isTokenDataInvalid) {
            toast.error("Token data invalid for target calculation."); return;
        }
        const T = currentToken.vaultBalance !== null && currentToken.decimals !== null
            ? calculateTokenValueUsdScaled(currentToken.vaultBalance, currentToken.decimals, currentToken.priceData) ?? new BN(0)
            : new BN(0);
        const P = totalPoolValueScaled;
        let amountToSet = '0';
        try {
            if (action === 'deposit') {
                const target_value_in_pool = P!.mul(currentToken.targetDominance).div(totalTargetDominance);
                const one_minus_target_dom_fraction_numer = totalTargetDominance.sub(currentToken.targetDominance);
                if (target_value_in_pool.lte(T)) {
                    toast.error("Cannot deposit to reach target, token already at or above."); return;
                }
                const valueDiff = target_value_in_pool.sub(T);
                const V_usd_scaled = valueDiff.mul(totalTargetDominance).div(one_minus_target_dom_fraction_numer);
                const tokenAmountScaledBn = usdToTokenAmount(V_usd_scaled, currentToken.decimals, currentToken.priceData);
                if (PRECISION_SCALE_FACTOR.isZero()) {
                    toast.error("Internal error: Precision scale factor is zero."); return;
                }
                const finalAmountBn = tokenAmountScaledBn.div(PRECISION_SCALE_FACTOR);
                if (finalAmountBn.isZero() && tokenAmountScaledBn.gtn(0)) {
                    toast.error("Target deposit amount is less than minimum transferable unit."); return;
                }
                if (finalAmountBn.isNeg()) {
                    toast.error("Calculated target amount is invalid (negative)."); return;
                }
                if (currentToken.userBalance && finalAmountBn.gt(currentToken.userBalance)) {
                    toast("Required amount exceeds balance. Setting to max.", { icon: '⚠️' });
                    amountToSet = formatUnits(currentToken.userBalance.toString(), currentToken.decimals);
                } else {
                    amountToSet = formatUnits(finalAmountBn.toString(), currentToken.decimals);
                }
            } else {
                if (currentToken.isDelisted) {
                    if (!currentToken.vaultBalance || currentToken.vaultBalance.isZero() || currentToken.vaultBalance.isNeg() || currentToken.decimals === null) {
                        toast.error("No pool balance to withdraw for this delisted token."); return;
                    }
                    const T_usd_scaled = calculateTokenValueUsdScaled(currentToken.vaultBalance, currentToken.decimals, currentToken.priceData);
                    if (!T_usd_scaled || T_usd_scaled.isZero() || T_usd_scaled.isNeg()) {
                        toast.error("Cannot calculate value of delisted token balance."); return;
                    }
                    const bonusNumerator = new BN(100);
                    const bonusDenominator = new BN(105);
                    const T_usd_scaled_adjusted = T_usd_scaled.mul(bonusNumerator).div(bonusDenominator);
                    const requiredWlqiAmountBn = usdToWlqiAmount(T_usd_scaled_adjusted, wLqiValueScaled, wLqiDecimals);
                    if (requiredWlqiAmountBn.isZero() || requiredWlqiAmountBn.isNeg()) {
                        toast.error("Calculated wLQI amount is zero or negative."); return;
                    }
                    if (wLqiDecimals === null) {
                        toast.error("wLQI decimals not available."); return;
                    }
                    if (userWlqiBalance && requiredWlqiAmountBn.gt(userWlqiBalance)) {
                        toast("Required wLQI withdraw amount exceeds your balance. Setting to max.", { icon: '⚠️' });
                        amountToSet = formatUnits(userWlqiBalance.toString(), wLqiDecimals);
                    } else {
                        const finalWlqiAmountBn = requiredWlqiAmountBn.add(new BN(1));
                        amountToSet = formatUnits(finalWlqiAmountBn.toString(), wLqiDecimals);
                    }
                } else {
                    const target_value_in_pool = P!.mul(currentToken.targetDominance).div(totalTargetDominance);
                    const one_minus_target_dom_fraction_numer = totalTargetDominance.sub(currentToken.targetDominance);
                    if (T.lte(target_value_in_pool)) {
                        toast.error("Cannot withdraw to reach target, token already at or below."); return;
                    }
                    if (one_minus_target_dom_fraction_numer.isZero() || one_minus_target_dom_fraction_numer.isNeg()) {
                        toast.error("Invalid target dominance for calculation."); return;
                    }
                    const valueDiff = T.sub(target_value_in_pool);
                    const V_usd_scaled = valueDiff.mul(totalTargetDominance).div(one_minus_target_dom_fraction_numer);
                    const wLqiAmountBn = usdToWlqiAmount(V_usd_scaled, wLqiValueScaled, wLqiDecimals);
                    if (wLqiAmountBn.isZero() || wLqiAmountBn.isNeg()) {
                        toast.error("Calculated wLQI amount is zero or negative."); return;
                    }
                    if (wLqiDecimals === null) {
                        toast.error("wLQI decimals not available."); return;
                    }
                    if (userWlqiBalance && wLqiAmountBn.gt(userWlqiBalance)) {
                        toast("Required wLQI withdraw amount exceeds balance. Setting to max.", { icon: '⚠️' });
                        amountToSet = formatUnits(userWlqiBalance.toString(), wLqiDecimals);
                    } else {
                        amountToSet = formatUnits(wLqiAmountBn.toString(), wLqiDecimals);
                    }
                }
            }
            if (amountToSet.endsWith('.0')) {
                amountToSet = amountToSet.substring(0, amountToSet.length - 2);
            }
            if (parseFloat(amountToSet) <= 0) {
                toast.error("Calculated target amount is too small."); return;
            }
            handleAmountChange(mintAddress, action, amountToSet);
        } catch (error) {
            console.error(`Error calculating target amount for ${action}:`, error);
            toast.error(`Failed to calculate target ${action} amount.`);
        }
    }, [tokenData, totalPoolValueScaled, totalTargetDominance, wLqiValueScaled, wLqiDecimals, handleAmountChange, userWlqiBalance]);

    if (isLoadingPublicData && !tokenData) {
        return <SkeletonTokenTable />;
    }
    if (!tokenData || sortedTokenData.length === 0) {
        return <div className="text-center text-gray-400 italic p-4">No token data available.</div>;
    }

    const getSortIndicator = (key: SortableKey): string => {
        if (sortKey !== key) return '';
        return sortDirection === 'asc' ? ' ▲' : ' ▼';
    };

    return (
        <div className="overflow-x-auto">
            {/* --- Desktop Table (Hidden on Mobile) --- */}
            <div className="hidden md:block">
                <table className="min-w-full bg-gray-700 text-xs text-left table-fixed mb-2">
                    <thead className="bg-gray-600">
                        <tr><th className="p-2 w-16 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('symbol')}
                                >Symbol{getSortIndicator('symbol')}</th><th className="p-2 w-32 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('value')}
                                >Pool Balance{getSortIndicator('value')}</th><th className="p-2 w-28 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('actualPercent')}
                                >Actual %{/*getSortIndicator('actualPercent')*/}</th><th className="p-2 w-28 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('targetPercent')}
                                >Target %{getSortIndicator('targetPercent')}</th>
                            {!hideDepositColumn && (
                                <th className="p-2 w-40 text-center">Deposit</th>
                            )}
                            <th className="p-2 w-40 text-center">Withdraw</th></tr>
                    </thead>
                    <tbody>
                        {sortedTokenData.map((tokenItem, idx) => (
                            <TokenRow
                                key={tokenItem.mintAddress}
                                token={tokenItem}
                                index={idx}
                                totalPoolValueScaled={totalPoolValueScaled}
                                wLqiValueScaled={wLqiValueScaled}
                                wLqiDecimals={wLqiDecimals}
                                userWlqiBalance={userWlqiBalance}
                                onDeposit={onDeposit}
                                onWithdraw={onWithdraw}
                                isDepositing={isDepositing}
                                isWithdrawing={isWithdrawing}
                                depositAmounts={depositAmounts}
                                withdrawAmounts={withdrawAmounts}
                                handleAmountChange={handleAmountChange}
                                isLoadingUserData={isLoadingUserData}
                                isLoadingPublicData={isLoadingPublicData}
                                hideDepositColumn={hideDepositColumn}
                                handleSetAmount={handleSetAmount}
                                handleSetTargetAmount={handleSetTargetAmount}
                                totalTargetDominance={totalTargetDominance}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* --- Mobile Card List (Visible on Mobile) --- */}
            <div className="block md:hidden space-y-3">
                {sortedTokenData.map((tokenItem) => (
                    <TokenCard
                        key={tokenItem.mintAddress}
                        token={tokenItem}
                        totalPoolValueScaled={totalPoolValueScaled}
                        wLqiValueScaled={wLqiValueScaled}
                        wLqiDecimals={wLqiDecimals}
                        userWlqiBalance={userWlqiBalance}
                        onDeposit={onDeposit}
                        onWithdraw={onWithdraw}
                        isDepositing={isDepositing}
                        isWithdrawing={isWithdrawing}
                        depositAmounts={depositAmounts}
                        withdrawAmounts={withdrawAmounts}
                        handleAmountChange={handleAmountChange}
                        isLoadingUserData={isLoadingUserData}
                        isLoadingPublicData={isLoadingPublicData}
                        hideDepositColumn={hideDepositColumn}
                        handleSetAmount={handleSetAmount}
                        handleSetTargetAmount={handleSetTargetAmount}
                        totalTargetDominance={totalTargetDominance}
                    />
                ))}
            </div>
        </div>
    );
});

TokenTable.displayName = 'TokenTable';