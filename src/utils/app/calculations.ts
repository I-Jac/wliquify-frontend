'use client';

import { PublicKey } from "@solana/web3.js";
import { BN } from '@coral-xyz/anchor';
import { 
    USD_SCALE,
    BN_PERCENTAGE_CALC_SCALE,
    BN_BPS_SCALE,
    BN_BASE_FEE_BPS,
    BN_FEE_K_FACTOR_NUMERATOR,
    BN_FEE_K_FACTOR_DENOMINATOR,
    BN_DEPOSIT_PREMIUM_CAP_BPS,
    BN_WITHDRAW_FEE_FLOOR_BPS,
    BN_DEPOSIT_MAX_FEE_BPS,
    BN_WITHDRAW_MAX_FEE_BPS,
    BN_DOMINANCE_SCALE,
    PRECISION_SCALE_FACTOR,
    DELISTED_WITHDRAW_BONUS_BPS
} from "../core/constants";
import { parseUnits } from 'ethers';
import { DecodedPriceData, ProcessedTokenData } from '@/utils/core/types';

// --- Calculation Functions ---

/**
 * Calculates the scaled USD value of a token amount based on its price.
 * Replicates the logic from the Rust program.
 * Uses BN.js for calculations.
 */
export function calculateTokenValueUsdScaled(amount: bigint | BN, decimals: number, priceData: DecodedPriceData | null): BN {
    if (!priceData || priceData.price.isNeg() || priceData.price.isZero()) {
        return new BN(0);
    }

    const amountBn = (typeof amount === 'bigint') ? new BN(amount.toString()) : amount;
    if (amountBn.isZero()) {
        return new BN(0);
    }

    const price_u128 = priceData.price;
    const exponent = priceData.expo;

    // Use Number for intermediate exponent calculation for simplicity in JS,
    // ensure BN is used for final large number math.
    const scaleAdjustmentExponent = USD_SCALE - decimals + exponent;

    // BN.js doesn't handle intermediate large numbers like Rust's u128 well directly.
    // We might need to use BigInt or a different library for very large intermediate values.
    // Sticking to BN for now, assuming intermediates fit.
    const baseValue = amountBn.mul(price_u128);

    try {
        if (scaleAdjustmentExponent >= 0) {
            const scaleFactor = new BN(10).pow(new BN(scaleAdjustmentExponent));
            return baseValue.mul(scaleFactor);
        } else {
            const scaleDivisor = new BN(10).pow(new BN(Math.abs(scaleAdjustmentExponent)));
            if (scaleDivisor.isZero()) return new BN(0); // Avoid division by zero
            // Use divRound for potentially better precision if needed, otherwise standard div
            return baseValue.div(scaleDivisor);
        }
    } catch (e) {
        console.error("Error during scaled value calculation:", e);
        return new BN(0); // Return 0 on arithmetic error
    }
}

/**
 * TODO: Implement calculateTotalPoolValue
 * - Iterate through processed token data.
 * - Decode price for each token.
 * - Calculate value for each token using calculateTokenValueUsdScaled.
 * - Sum values.
 */
export function calculateTotalPoolValue(processedTokens: ProcessedTokenData[]): BN {
    let totalValue = new BN(0);

    for (const token of processedTokens) {
        if (
            token.vaultBalance !== null &&
            !new BN(token.vaultBalance.toString()).isNeg() && // Check if balance is non-negative using BN
            token.decimals !== null && token.decimals >= 0 && // Check if decimals is valid number
            token.priceData // Check if price data was successfully decoded
           ) {
            try {
                const tokenValue = calculateTokenValueUsdScaled(
                    token.vaultBalance,
                    token.decimals,
                    token.priceData
                );
                totalValue = totalValue.add(tokenValue);
            } catch (e) {
                console.error(`Error calculating value for token ${token.mintAddress}:`, e);
                // Optionally skip this token or handle error differently
            }
        } else {
            console.warn(`Skipping token ${token.mintAddress} due to missing data:`, {
                balance: token.vaultBalance,
                decimals: token.decimals,
                priceData: token.priceData
            });
        }
    }

    // console.log("Calculated Total Pool Value (Scaled):", totalValue.toString()); // Optional logging
    return totalValue;
}

/**
 * TODO: Implement calculateWLqiValue
 * - Needs total pool value and wLQI supply.
 */
export function calculateWLqiValue(totalPoolValue: BN, wLqiSupply: string | null, wLqiDecimals: number = 6): BN {
    const zeroValue = new BN(0);

    if (!wLqiSupply || wLqiSupply === '0') {
        console.warn("wLQI supply is zero or null, cannot calculate value. Returning 0.");
        return zeroValue;
    }

    if (totalPoolValue.isNeg()) {
        console.warn("Total pool value is negative, returning 0 for wLQI value.");
        return zeroValue;
    }

    try {
        const supplyBn = new BN(wLqiSupply); // Supply in smallest units
        if (supplyBn.isZero() || supplyBn.isNeg()) {
            console.warn(`Invalid wLQI supply (${wLqiSupply}), cannot calculate value. Returning 0.`);
            return zeroValue;
        }

        // Calculate 10^wLqiDecimals
        const wLqiMultiplier = new BN(10).pow(new BN(wLqiDecimals));

        // Calculate: (totalPoolValue * 10^wLqiDecimals) / wLqiSupply
        // totalPoolValue is already scaled by USD_SCALE
        const numerator = totalPoolValue.mul(wLqiMultiplier);
        const wLqiValueScaled = numerator.div(supplyBn);

        // console.log(`Calculated wLQI Value (Scaled): ${wLqiValueScaled.toString()}, TotalValue: ${totalPoolValue.toString()}, Supply: ${supplyBn.toString()}`); // Optional logging

        return wLqiValueScaled;

    } catch (error) {
        console.error(`Error calculating wLQI value:`, error);
        return zeroValue; // Return 0 on error
    }
}

/**
 * Calculates the target dominance percentage for a token, scaled by PERCENTAGE_CALC_SCALE.
 */
export function calculateTargetPercentageScaled(tokenDominance: BN, totalTargetDominance: BN): BN {
    if (totalTargetDominance.isZero() || totalTargetDominance.isNeg()) {
        return new BN(0);
    }
    // (tokenDominance * SCALE) / totalDominance
    return tokenDominance.mul(BN_PERCENTAGE_CALC_SCALE).div(totalTargetDominance);
}

/**
 * Calculates the actual value percentage for a token relative to total pool value, scaled by PERCENTAGE_CALC_SCALE.
 */
export function calculateActualPercentageScaled(tokenValueScaled: BN, totalPoolValueScaled: BN): BN {
    if (totalPoolValueScaled.isZero() || totalPoolValueScaled.isNeg()) {
        return new BN(0);
    }
    // (tokenValueScaled * SCALE) / totalPoolValueScaled
    return tokenValueScaled.mul(BN_PERCENTAGE_CALC_SCALE).div(totalPoolValueScaled);
}

/**
 * Calculates the relative percentage deviation between actual and target, scaled by PERCENTAGE_CALC_SCALE.
 * Formula: ((actualScaled - targetScaled) * SCALE) / targetScaled
 */
export function calculateRelativeDeviationPercentageScaled(actualScaled: BN, targetScaled: BN): BN {
    if (targetScaled.isZero() || targetScaled.isNeg()) {
        // If target is zero, consider deviation infinite or based on actual.
        // If actual is also 0, deviation is 0.
        // If actual > 0 and target is 0, deviation is high - return SCALE (100%)? Or MAX_VALUE?
        // Returning 0 for now for simplicity, but might need refinement based on desired behavior.
        return new BN(0);
    }
    const deviation = actualScaled.sub(targetScaled);
    // Scale deviation before dividing
    return deviation.mul(BN_PERCENTAGE_CALC_SCALE).div(targetScaled);
}

/**
 * Calculates the sum of target dominance values from processed token data.
 */
export function calculateTotalTargetDominance(processedTokens: ProcessedTokenData[]): BN {
    let totalDominance = new BN(0);
    for (const token of processedTokens) {
        if (token.targetDominance) {
            totalDominance = totalDominance.add(token.targetDominance);
        }
    }
    return totalDominance;
}

/**
 * TODO: Implement other calculation functions:
 * - calculateFeeBps (estimate)
 */

// --- Formatting Helpers ---


// Calculation Helper: Convert USD to Token Amount
export const usdToTokenAmount = (usdValueScaled: BN, decimals: number, priceData: ProcessedTokenData['priceData']): BN => {
    if (!priceData || priceData.price.isZero() || priceData.price.isNeg() || usdValueScaled.isNeg()) return new BN(0);
    if (usdValueScaled.isZero()) return new BN(0); // Handle zero USD input

    try {
        const price_bn = priceData.price; // Price scaled by 10^abs(Expo)
        const expo = priceData.expo;

        const total_exponent: number = expo + USD_SCALE; // Note: USD_SCALE is 8

        let final_numerator = usdValueScaled.mul(new BN(10).pow(new BN(decimals)));
        let final_denominator = price_bn;

        if (total_exponent >= 0) {
            final_denominator = price_bn.mul(new BN(10).pow(new BN(total_exponent)));
        } else {
            final_numerator = final_numerator.mul(new BN(10).pow(new BN(Math.abs(total_exponent))));
        }

        if (final_denominator.isZero()) {
            console.error("usdToTokenAmount: Calculated denominator is zero!");
            return new BN(0);
        }

        const resultScaled = final_numerator.mul(PRECISION_SCALE_FACTOR).div(final_denominator);
        return resultScaled; // Returns Lamports * PRECISION_SCALE_FACTOR

    } catch (e) {
        console.error("Error converting USD to token amount:", e);
        return new BN(0);
    }
};

// Calculation Helper: Convert USD to wLQI Amount
export const usdToWlqiAmount = (usdValueScaled: BN, wLqiValueScaled: BN | null, wLqiDecimals: number | null): BN => {
    if (!wLqiValueScaled || wLqiValueScaled.isZero() || wLqiValueScaled.isNeg() || wLqiDecimals === null) return new BN(0);
    try {
        const wLqiMultiplier = new BN(10).pow(new BN(wLqiDecimals));
        return usdValueScaled.mul(wLqiMultiplier).div(wLqiValueScaled);
    } catch (e) {
        console.error("Error converting USD to wLQI amount:", e);
        return new BN(0);
    }
};

// Relative Deviation Calculation
/**
 * Calculates relative deviation scaled by BPS_SCALE (1e4).
 * Inputs are scaled by DOMINANCE_SCALE (1e10).
 * Returns BN representing BPS (scaled by 1).
 */
export const calculateRelativeDeviationBpsBN = (actualDominanceScaled: BN, targetDominanceScaled: BN): BN => {
    if (targetDominanceScaled.isZero() || targetDominanceScaled.isNeg()) {
        return actualDominanceScaled.gtn(0) ? BN_BPS_SCALE.mul(new BN(100)) : new BN(0);
    }
    try {
        const deviationScaled = actualDominanceScaled.sub(targetDominanceScaled);
        const deviationBpsBN = deviationScaled.mul(BN_BPS_SCALE).div(targetDominanceScaled);
        return deviationBpsBN;
    } catch (e) {
        console.error("Error calculating relative deviation BPS (BN):", e);
        return new BN(0);
    }
};

// --- MOVED: Comprehensive Fee Estimation Helper --- 
export const estimateFeeBpsBN = (
    isDelisted: boolean,
    isDeposit: boolean,
    tokenValuePreUsdScaled: BN | null,      // Current USD value of this token in the pool
    totalPoolValuePreUsdScaled: BN | null, // Current total USD value of the pool
    targetDominanceScaledBn: BN,            // Target dominance (scaled by DOMINANCE_SCALE)
    valueChangeUsdScaled: BN | null,         // Estimated USD value change from the input amount
    wLqiValueScaled: BN | null,              // Needed if valueChangeUsdScaled is null for withdraw
    wLqiDecimals: number | null,             // Needed if valueChangeUsdScaled is null for withdraw
    inputWithdrawAmountString?: string        // Optional: wLQI withdraw amount string if valueChangeUsdScaled is null
): BN | null => {
    // ... (Existing implementation as moved from TokenTable) ...
     // 1. Handle Delisted Tokens
    if (isDelisted) {
        return isDeposit ? null : new BN(DELISTED_WITHDRAW_BONUS_BPS); // N/A for deposit, bonus for withdraw
    }

    // 2. Check for invalid inputs for active tokens
    if (
        !totalPoolValuePreUsdScaled || totalPoolValuePreUsdScaled.isZero() || totalPoolValuePreUsdScaled.isNeg() ||
        tokenValuePreUsdScaled === null || tokenValuePreUsdScaled.isNeg()
    ) {
        return BN_BASE_FEE_BPS;
    }

    let effectiveValueChangeUsdScaled = valueChangeUsdScaled;
    if (!effectiveValueChangeUsdScaled || effectiveValueChangeUsdScaled.isZero()) {
        if (!isDeposit && inputWithdrawAmountString && wLqiValueScaled && !wLqiValueScaled.isZero() && wLqiDecimals !== null) {
            try {
                const inputWlqiAmountBn = new BN(parseUnits(inputWithdrawAmountString, wLqiDecimals).toString());
                const scaleFactorWlqi = new BN(10).pow(new BN(wLqiDecimals));
                if (!scaleFactorWlqi.isZero()) {
                    effectiveValueChangeUsdScaled = inputWlqiAmountBn.mul(wLqiValueScaled).div(scaleFactorWlqi);
                }
            } catch { effectiveValueChangeUsdScaled = new BN(0); }
        } else {
            effectiveValueChangeUsdScaled = new BN(0);
        }
    }
    if (!effectiveValueChangeUsdScaled) effectiveValueChangeUsdScaled = new BN(0);

    try {
        const actualDomPreScaled = tokenValuePreUsdScaled.mul(BN_DOMINANCE_SCALE).div(totalPoolValuePreUsdScaled);
        const relDevPreBpsBN = calculateRelativeDeviationBpsBN(actualDomPreScaled, targetDominanceScaledBn);

        if (effectiveValueChangeUsdScaled.isZero()) {
            const dynamicFeePreBpsBN = relDevPreBpsBN.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
            let totalFeePreBN = isDeposit
                ? BN_BASE_FEE_BPS.add(dynamicFeePreBpsBN) 
                : BN_BASE_FEE_BPS.sub(dynamicFeePreBpsBN);
            
            if (isDeposit) {
                if (totalFeePreBN.lt(BN_DEPOSIT_PREMIUM_CAP_BPS)) totalFeePreBN = BN_DEPOSIT_PREMIUM_CAP_BPS;
                if (totalFeePreBN.gt(BN_DEPOSIT_MAX_FEE_BPS)) totalFeePreBN = BN_DEPOSIT_MAX_FEE_BPS;
            } else {
                if (totalFeePreBN.lt(BN_WITHDRAW_FEE_FLOOR_BPS)) totalFeePreBN = BN_WITHDRAW_FEE_FLOOR_BPS;
                if (totalFeePreBN.gt(BN_WITHDRAW_MAX_FEE_BPS)) totalFeePreBN = BN_WITHDRAW_MAX_FEE_BPS;
            }
            return totalFeePreBN;
        }

        const totalPoolValuePostScaled = isDeposit
            ? totalPoolValuePreUsdScaled.add(effectiveValueChangeUsdScaled)
            : (totalPoolValuePreUsdScaled.gt(effectiveValueChangeUsdScaled) ? totalPoolValuePreUsdScaled.sub(effectiveValueChangeUsdScaled) : new BN(0));
        
        const tokenValuePostScaled = isDeposit
            ? tokenValuePreUsdScaled.add(effectiveValueChangeUsdScaled)
            : (tokenValuePreUsdScaled.gt(effectiveValueChangeUsdScaled) ? tokenValuePreUsdScaled.sub(effectiveValueChangeUsdScaled) : new BN(0));

        const actualDomPostScaled = totalPoolValuePostScaled.isZero() 
            ? new BN(0) 
            : tokenValuePostScaled.mul(BN_DOMINANCE_SCALE).div(totalPoolValuePostScaled);
        const relDevPostBpsBN = calculateRelativeDeviationBpsBN(actualDomPostScaled, targetDominanceScaledBn);

        const scaleFactor = new BN(100); 
        const avgRelDevBpsBN = relDevPreBpsBN.add(relDevPostBpsBN).mul(scaleFactor).div(new BN(2).mul(scaleFactor));
        const dynamicFeeBpsBN = avgRelDevBpsBN.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);

        let totalFeeBN = isDeposit
            ? BN_BASE_FEE_BPS.add(dynamicFeeBpsBN) 
            : BN_BASE_FEE_BPS.sub(dynamicFeeBpsBN);

        if (isDeposit) {
            if (totalFeeBN.lt(BN_DEPOSIT_PREMIUM_CAP_BPS)) totalFeeBN = BN_DEPOSIT_PREMIUM_CAP_BPS;
            if (totalFeeBN.gt(BN_DEPOSIT_MAX_FEE_BPS)) totalFeeBN = BN_DEPOSIT_MAX_FEE_BPS;
        } else {
            if (totalFeeBN.lt(BN_WITHDRAW_FEE_FLOOR_BPS)) totalFeeBN = BN_WITHDRAW_FEE_FLOOR_BPS;
            if (totalFeeBN.gt(BN_WITHDRAW_MAX_FEE_BPS)) totalFeeBN = BN_WITHDRAW_MAX_FEE_BPS;
        }

        return totalFeeBN;

    } catch (e) {
        console.error(`Error estimating ${isDeposit ? 'deposit' : 'withdraw'} fee:`, e);
        return BN_BASE_FEE_BPS;
    }
};

// Structure to hold calculated metrics for a single token
export interface TokenMetric {
    mint: PublicKey;
    symbol: string;
    actualPercentage: number | null; // Calculated actual percentage of TVL
    targetPercentage: number | null; // Target percentage (derived from price/market cap)
}

// Structure to hold overall pool metrics
export interface PoolMetrics {
    totalValueUsd: number | null; // Total pool value in USD
    wLqiValueUsd: number | null; // Value of 1 wLQI token in USD
    wLqiDecimals: number | null; // Decimals of the wLQI token
    tokenMetrics: TokenMetric[];
}