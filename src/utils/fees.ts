import { BN } from '@coral-xyz/anchor';
import { parseUnits } from 'ethers';
import {
    calculateTokenValueUsdScaled,
    calculateRelativeDeviationBpsBN,
    usdToTokenAmount,
} from '@/utils/calculations';
import {
    BASE_FEE_BPS,
    BN_BASE_FEE_BPS,
    BN_DEPOSIT_PREMIUM_CAP_BPS,
    BN_DEPOSIT_MAX_FEE_BPS,
    BN_WITHDRAW_FEE_FLOOR_BPS,
    BN_WITHDRAW_MAX_FEE_BPS,
    BN_FEE_K_FACTOR_NUMERATOR,
    BN_FEE_K_FACTOR_DENOMINATOR,
    BN_DOMINANCE_SCALE,
    PRECISION_SCALE_FACTOR,
    BPS_SCALE,
} from '@/utils/constants';
import { FeeCalculationProps } from '@/utils/types';

// --- Fee Calculation Types ---
interface FeeCalculationResult {
    estimatedDepositFeeBps: number;
    estimatedWithdrawFeeBps: number;
    withdrawalExceedsLiquidity: boolean;
}

// --- Fee Calculation Functions ---
export const calculateFees = ({
    totalPoolValueScaled,
    totalTargetDominance,
    tokenValueUsd,
    targetDominance,
    isDepositInputFilled,
    isWithdrawInputFilled,
    currentDepositAmount,
    currentWithdrawAmount,
    decimals,
    wLqiDecimals,
    wLqiValueScaled,
    priceData,
    vaultBalance,
}: FeeCalculationProps): FeeCalculationResult => {
    let estimatedDepositFeeBps = BASE_FEE_BPS;
    let estimatedWithdrawFeeBps = BASE_FEE_BPS;
    let withdrawalExceedsLiquidity = false;

    try {
        if (!totalPoolValueScaled) {
            return { estimatedDepositFeeBps, estimatedWithdrawFeeBps, withdrawalExceedsLiquidity };
        }

        const targetDominanceScaledBn = (totalTargetDominance && !totalTargetDominance.isZero())
            ? targetDominance.mul(BN_DOMINANCE_SCALE).div(totalTargetDominance)
            : new BN(0);
        const actualDomPreScaled = (tokenValueUsd && !totalPoolValueScaled.isZero())
            ? tokenValueUsd.mul(BN_DOMINANCE_SCALE).div(totalPoolValueScaled)
            : null;

        if (actualDomPreScaled === null) {
            return { estimatedDepositFeeBps, estimatedWithdrawFeeBps, withdrawalExceedsLiquidity };
        }

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
                        ? tokenValuePostScaled.mul(BN_DOMINANCE_SCALE).div(totalPoolValuePostScaled)
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
                console.error("Error during deposit fee estimation:", e);
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
                        ? tokenValuePostScaled.mul(BN_DOMINANCE_SCALE).div(totalPoolValuePostScaled)
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
            } catch (e) {
                console.error("Error during withdraw fee/liquidity estimation:", e);
                estimatedWithdrawFeeBps = BASE_FEE_BPS;
                withdrawalExceedsLiquidity = false;
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
            withdrawalExceedsLiquidity = false;
        }
    } catch (e) {
        console.error("Error calculating fee estimate:", e);
        estimatedDepositFeeBps = BASE_FEE_BPS;
        estimatedWithdrawFeeBps = BASE_FEE_BPS;
    }

    return { estimatedDepositFeeBps, estimatedWithdrawFeeBps, withdrawalExceedsLiquidity };
};

// --- Fee Formatting Functions ---
export const formatFeeString = (estimatedBps: number, isDepositAction: boolean) => {
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

export const formatDelistedWithdrawFeeString = () => {
    const feeString = "(~5% Bonus)";
    const title = "Fixed bonus applied for delisted token withdrawal (0% net fee).";
    return { feeString, title };
}; 