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
    DELISTED_WITHDRAW_BONUS_BPS,
} from '@/utils/constants';
import { FeeCalculationProps } from '@/utils/types';
import { TFunction } from 'i18next';

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
export const formatFeeString = (t: TFunction, estimatedBps: number, isDepositAction: boolean, isInputFilled: boolean = false, inputValueUsd?: number) => {
    let feeString: string;
    let title: string;
    const locale = 'en-US';
    const currencyOpts = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    const baseKey = 'main.poolInfoDisplay.tokenTable.whitelisted';

    if (isDepositAction) {
        const actionKey = `${baseKey}.deposit`;
        if (estimatedBps < 0) {
            const bonusPercent = (Math.abs(estimatedBps) / BPS_SCALE * 100).toLocaleString(locale, currencyOpts);
            const bonusAmount = inputValueUsd ? (inputValueUsd * Math.abs(estimatedBps) / BPS_SCALE).toLocaleString(locale, currencyOpts) : '';
            if (isInputFilled) {
                feeString = bonusAmount
                    ? t(`${actionKey}.bonus.withValue`, { bonusPercent, bonusAmount })
                    : t(`${actionKey}.bonus.onlyPercent`, { bonusPercent });
                title = bonusAmount
                    ? t(`${actionKey}.bonus.titleWithValue`, { bonusPercent, bonusAmount })
                    : t(`${actionKey}.bonus.titleOnlyPercent`, { bonusPercent });
            } else {
                feeString = t(`${actionKey}.bonus.max`, { bonusPercent });
                title = t(`${actionKey}.bonus.titleMax`, { bonusPercent });
            }
        } else if (estimatedBps === 0) {
            feeString = t(`${actionKey}.fee.zeroPercent`);
            title = t(`${actionKey}.fee.zeroTitle`);
        } else {
            const displayPercent = (estimatedBps / BPS_SCALE * 100).toLocaleString(locale, currencyOpts);
            const feeAmount = inputValueUsd ? (inputValueUsd * estimatedBps / BPS_SCALE).toLocaleString(locale, currencyOpts) : '';
            if (isInputFilled) {
                feeString = feeAmount
                    ? t(`${actionKey}.fee.withValue`, { displayPercent, feeAmount })
                    : t(`${actionKey}.fee.onlyPercent`, { displayPercent });
                title = feeAmount
                    ? t(`${actionKey}.fee.titleWithValue`, { displayPercent, feeAmount })
                    : t(`${actionKey}.fee.titleOnlyPercent`, { displayPercent });
            } else {
                feeString = t(`${actionKey}.fee.min`, { displayPercent });
                title = t(`${actionKey}.fee.titleMin`, { displayPercent });
            }
        }
    } else { // Withdraw Action
        const actionKey = `${baseKey}.withdraw`;
        if (estimatedBps < 0) {
            const bonusPercent = (Math.abs(estimatedBps) / BPS_SCALE * 100).toLocaleString(locale, currencyOpts);
            const bonusAmount = inputValueUsd ? (inputValueUsd * Math.abs(estimatedBps) / BPS_SCALE).toLocaleString(locale, currencyOpts) : '';
            if (isInputFilled) {
                feeString = bonusAmount
                    ? t(`${actionKey}.bonus.withValue`, { bonusPercent, bonusAmount })
                    : t(`${actionKey}.bonus.onlyPercent`, { bonusPercent });
                title = bonusAmount
                    ? t(`${actionKey}.bonus.titleWithValue`, { bonusPercent, bonusAmount })
                    : t(`${actionKey}.bonus.titleOnlyPercent`, { bonusPercent });
            } else {
                feeString = t(`${actionKey}.bonus.max`, { bonusPercent });
                title = t(`${actionKey}.bonus.titleMax`, { bonusPercent });
            }
        } else if (estimatedBps === 0) {
            feeString = t(`${actionKey}.fee.zeroPercent`); // Assuming withdraw also has zeroPercent under fee
            title = t(`${actionKey}.fee.minTitle`); // Special title for withdraw 0% fee
        } else {
            const displayPercent = (estimatedBps / BPS_SCALE * 100).toLocaleString(locale, currencyOpts);
            const feeAmount = inputValueUsd ? (inputValueUsd * estimatedBps / BPS_SCALE).toLocaleString(locale, currencyOpts) : '';
            if (isInputFilled) {
                feeString = feeAmount
                    ? t(`${actionKey}.fee.withValue`, { displayPercent, feeAmount })
                    : t(`${actionKey}.fee.onlyPercent`, { displayPercent });
                title = feeAmount
                    ? t(`${actionKey}.fee.titleWithValue`, { displayPercent, feeAmount })
                    : t(`${actionKey}.fee.titleOnlyPercent`, { displayPercent });
            } else {
                feeString = t(`${actionKey}.fee.min`, { displayPercent });
                title = t(`${actionKey}.fee.titleMin`, { displayPercent });
            }
        }
    }
    return { feeString, title };
};

export const formatDelistedWithdrawFeeString = (t: TFunction, isInputFilled: boolean = false, inputValueUsd?: number) => {
    const locale = 'en-US';
    const currencyOpts = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    const bonusPercent = (Math.abs(DELISTED_WITHDRAW_BONUS_BPS) / BPS_SCALE * 100).toLocaleString(locale, currencyOpts);
    const bonusAmount = inputValueUsd ? (inputValueUsd * Math.abs(DELISTED_WITHDRAW_BONUS_BPS) / BPS_SCALE).toLocaleString(locale, currencyOpts) : '';
    let feeString: string;
    let title: string;
    const baseKey = 'main.poolInfoDisplay.tokenTable.delisted.bonus';

    if (isInputFilled) {
        feeString = bonusAmount
            ? t(`${baseKey}.withValue`, { bonusPercent, bonusAmount })
            : t(`${baseKey}.onlyPercent`, { bonusPercent });
        title = bonusAmount
            ? t(`${baseKey}.titleWithValue`, { bonusPercent, bonusAmount })
            : t(`${baseKey}.titleOnlyPercent`, { bonusPercent });
    } else {
        feeString = t(`${baseKey}.max`, { bonusPercent });
        title = t(`${baseKey}.titleMax`, { bonusPercent });
    }

    return { feeString, title };
}; 