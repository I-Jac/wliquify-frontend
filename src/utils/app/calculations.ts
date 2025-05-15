'use client';

import { PublicKey, LAMPORTS_PER_SOL as SOLANA_LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from '@coral-xyz/anchor';
import { 
    USD_SCALE,
    BN_PERCENTAGE_CALC_SCALE,
    BPS_SCALE,
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
    DELISTED_WITHDRAW_BONUS_BPS,
    TRANSACTION_COMPUTE_UNITS
} from "../core/constants";
import { formatUnits, parseUnits } from 'ethers';
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
export function calculateWLqiValue(totalPoolValue: BN, wLqiSupply: string | null, wLqiDecimals: number = 9): BN {
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

/**
 * Calculates and formats the effective priority fee in SOL for display in the settings modal.
 */
export const calculateEffectiveDisplayFeeSol = (
    solForLevelFromContext: number | undefined, 
    defaultFeeMicroLamportsPerCuForLevel: number, 
    maxCapSolString?: string
): string => {
    let totalEstimatedPriorityFeeSol: number;

    if (solForLevelFromContext !== undefined) {
        totalEstimatedPriorityFeeSol = solForLevelFromContext;
    } else {
        if (defaultFeeMicroLamportsPerCuForLevel < 0) {
            totalEstimatedPriorityFeeSol = 0;
        } else {
            totalEstimatedPriorityFeeSol = (defaultFeeMicroLamportsPerCuForLevel * TRANSACTION_COMPUTE_UNITS) / (1_000_000 * SOLANA_LAMPORTS_PER_SOL);
        }
    }
    
    let effectiveFeeSol = totalEstimatedPriorityFeeSol;

    if (maxCapSolString !== undefined) {
        const maxCapSolNum = parseFloat(maxCapSolString);
        if (!isNaN(maxCapSolNum) && maxCapSolNum >= 0) {
            effectiveFeeSol = Math.min(totalEstimatedPriorityFeeSol, maxCapSolNum);
        }
    }

    return effectiveFeeSol.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 9 });
};

/**
 * Formats a BN representing a scaled USD value into a $ string.
 */
export const formatScaledBnToDollarString = (scaledValue: BN | null | undefined, scale: number): string => {
    if (scaledValue === null || scaledValue === undefined) return '$ --,--'; // Use comma for placeholder
    try {
        const scaleFactor = new BN(10).pow(new BN(scale));
        const dollars = scaledValue.div(scaleFactor);
        const cents = scaledValue.mod(scaleFactor).abs().toString(10).padStart(scale, '0').slice(0, 2);
        // Format with space for thousands and comma for decimal
        const formattedDollars = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "); 
        return `$${formattedDollars},${cents}`; 
    } catch (error) {
        console.error("Error formatting BN to dollar string:", error);
        return '$ Error';
    }
};

/**
 * Formats a raw token amount string using its native decimals, optionally capping display decimals.
 */
export const formatRawAmountString = (
    amount: string | BN | bigint | null | undefined,
    decimals: number | null,
    showDecimals: boolean = true,
    maxDisplayDecimals?: number // Optional: Cap the displayed decimals
): string | null => {
    if (amount === null || amount === undefined || decimals === null) return null;
    try {
        // Convert input to string for formatUnits
        const amountString = typeof amount === 'object' && amount !== null && 'toString' in amount 
                             ? amount.toString() // Handles BN
                             : String(amount); // Handles string, bigint, number
                             
        const formatted = formatUnits(amountString, decimals);
        const number = parseFloat(formatted);
        if (isNaN(number)) return null;

        // Determine the number of decimal places to display
        let displayDecimalPlaces = showDecimals ? decimals : 0;
        if (showDecimals && maxDisplayDecimals !== undefined) {
             displayDecimalPlaces = Math.min(decimals, maxDisplayDecimals); // Apply the cap
        }
        // Ensure minimum 2 decimals if showDecimals is true and cap allows
        const minDecimals = (showDecimals && (maxDisplayDecimals === undefined || maxDisplayDecimals >= 2)) ? 2 : 0;

        // Use 'fr-FR' locale for space thousands separator and comma decimal separator
        return number.toLocaleString('fr-FR', { 
            minimumFractionDigits: minDecimals, 
            maximumFractionDigits: displayDecimalPlaces // Use calculated display decimals
        });
    } catch (error) {
        console.error("Error formatting raw amount string:", error);
        return null;
    }
};

/**
 * Formats a standard number (representing a percentage) into a percentage string.
 * Example: 15.23 => "15.23%"
 */
export const formatPercentageString = (percentage: number | null | undefined): string => {
    if (percentage === null || percentage === undefined || isNaN(percentage)) {
        return '0.00%'; // Or 'N/A' or handle as needed
    }
    // Adjust formatting as needed (e.g., precision)
    return `${percentage.toFixed(2)}%`;
};

/**
 * Formats a BN scaled by 1,000,000 into a percentage string.
 */
export function formatScaledToPercentageString(scaledBn: BN | null | undefined): string {
    // Restore original default return
    if (!scaledBn) return '--.--';
    try {
        // Input scaledBn is scaled by BN_PERCENTAGE_CALC_SCALE (1,000,000)
        // To get the actual percentage value (e.g., 15.34), divide by 10,000.

        const divisor = new BN(10000);
        if (divisor.isZero()) { // Safety check
            console.error("Percentage divisor is zero!");
            return 'Error %'; // Restore original error return
        }

        // Use precision factor for division (4 decimal places)
        const displayPrecisionFactor = new BN(10).pow(new BN(4)); 

        const numerator = scaledBn.mul(displayPrecisionFactor);
        const percentageScaledForDisplay = numerator.div(divisor);

        // Convert to number for formatting
        // Note: Using Number() might lose precision for extremely large percentages, but should be fine here.
        const percentageValue = percentageScaledForDisplay.toNumber() / Math.pow(10, 4); 

        // Format to 4 decimal places
        return percentageValue.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + '%'; // Add % sign
    } catch (error) {
        console.error("Error formatting scaled BN to percentage string:", error);
        return 'Error %'; // Restore original error return
    }
}

/**
 * Calculates the total value of the pool and individual token metrics.
 * @param poolConfig - The static configuration of the pool.
 * @param tokensData - Array containing dynamic data (vault balance, price, decimals) for each supported token.
 * @param wLqiSupply - The total supply of the wLQI token.
 * @returns PoolMetrics object or null if calculation fails.
 */
// export const calculatePoolMetrics = (
//     poolConfig: PoolConfig,
//     tokensData: Array<{
//         mint: PublicKey;
//         decimals: number | null;
//         vaultBalance: BN | null;
//         price: DecodedPriceData | null;
//     }>,
//     wLqiSupply: string | null
// ): PoolMetrics | null => {
//     if (wLqiSupply === null || wLqiSupply === '0') return null; 
//     const wLqiSupplyBn = new BN(wLqiSupply);
//     if (wLqiSupplyBn.isZero() || wLqiSupplyBn.isNeg()) return null;
// 
//     let calculatedTotalValueUsdScaled = new BN(0);
//     const tokenMetrics: TokenMetric[] = [];
//     let wLqiDecimals: number | null = null;
// 
//     const wLqiInData = tokensData.find(td => td.mint.equals(poolConfig.wliMint));
//     wLqiDecimals = wLqiInData?.decimals ?? 9; 
// 
//     for (const token of tokensData) {
//         const decimals = token.decimals;
//         const vaultBalance = token.vaultBalance; // is BN | null
//         const priceInfo = token.price; // is DecodedPriceData | null
// 
//         if (decimals === null || vaultBalance === null || priceInfo === null) {
//             console.warn(`Skipping token ${token.mint.toBase58()} due to missing metric data.`);
//             continue;
//         }
// 
//         try {
//             // Use calculateTokenValueUsdScaled for consistency
//             const valueScaled = calculateTokenValueUsdScaled(vaultBalance, decimals, priceInfo);
//             calculatedTotalValueUsdScaled = calculatedTotalValueUsdScaled.add(valueScaled);
// 
//             tokenMetrics.push({
//                 mint: token.mint,
//                 symbol: 'TODO', 
//                 actualPercentage: null, 
//                 targetPercentage: null, 
//             });
//         } catch (e) {
//             console.error(`Error calculating value for token ${token.mint.toBase58()}:`, e);
//         }
//     }
// 
//     if (calculatedTotalValueUsdScaled.isNeg() || calculatedTotalValueUsdScaled.isZero()) { // Check both neg and zero
//         console.warn("Calculated total value is zero or negative.");
//         tokenMetrics.forEach(tm => tm.actualPercentage = 0);
//         return { totalValueUsd: 0, wLqiValueUsd: 0, wLqiDecimals, tokenMetrics };
//     }
// 
//     // Format requires string or number, convert BN
//     const totalValueUsd = parseFloat(formatUnits(calculatedTotalValueUsdScaled.toString(), USD_SCALE));
//     
//     let wLqiValueUsd = 0;
//     try {
//         const wLqiMultiplier = new BN(10).pow(new BN(wLqiDecimals));
//         const wLqiNumerator = calculatedTotalValueUsdScaled.mul(wLqiMultiplier);
//         const wLqiValueUsdScaled = wLqiNumerator.div(wLqiSupplyBn);
//         // Format requires string or number, convert BN
//         wLqiValueUsd = parseFloat(formatUnits(wLqiValueUsdScaled.toString(), USD_SCALE));
//     } catch(e) {
//         console.error("Error calculating wLQI value:", e);
//     }
// 
//     tokenMetrics.forEach(metric => {
//         const tokenData = tokensData.find(td => td.mint.equals(metric.mint));
//         const decimals = tokenData?.decimals;
//         const vaultBalance = tokenData?.vaultBalance; 
//         const priceInfo = tokenData?.price;
// 
//         if (tokenData && decimals !== null && vaultBalance !== null && priceInfo !== null) {
//              try {
//                 // Use calculateTokenValueUsdScaled for consistency, asserting decimals and priceInfo are not null/undefined
//                 const valueScaled = calculateTokenValueUsdScaled(vaultBalance!, decimals!, priceInfo!); // also assert vaultBalance as it's tokenData?.vaultBalance
//                 const percentageScaled = valueScaled.mul(new BN(10000)).div(calculatedTotalValueUsdScaled);
//                 metric.actualPercentage = percentageScaled.toNumber() / 100; 
//             } catch (e) {
//                  console.error(`Error calculating percentage for token ${metric.mint.toBase58()}:`, e);
//                  metric.actualPercentage = null;
//             }
//         } else {
//             metric.actualPercentage = null;
//         }
//     });
// 
//     return {
//         totalValueUsd,
//         wLqiValueUsd,
//         wLqiDecimals,
//         tokenMetrics,
//     };
// };

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

// --- MOVED: Fee/Bonus Formatting --- 
export const formatFeeBonusString = (bpsBN: BN | null, isDeposit: boolean): { feeString: string, title: string } => {
    // ... (Existing implementation as moved from TokenTable) ...
    if (bpsBN === null) {
        return { feeString: "(N/A)", title: "Deposit not applicable for delisted tokens" };
    }

    const bpsNum = bpsBN.toNumber(); // Convert BN to number for comparison/display
    const displayPercent = (Math.abs(bpsNum) / BPS_SCALE * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (bpsNum < 0) {
        return { feeString: `(~${displayPercent}% Bonus)`, title: `Est. Bonus: ~${displayPercent}%` };
    } else if (bpsNum === 0) {
        const isWithdrawFloor = !isDeposit && BN_WITHDRAW_FEE_FLOOR_BPS.eq(bpsBN);
        const title = isWithdrawFloor ? "Minimum fee applied (0.00%)" : "Est. Total Fee: 0.00%";
        return { feeString: `(0.00%)`, title: title };
    } else { // bpsNum > 0
        return { feeString: `(~${displayPercent}% Fee)`, title: `Est. Total Fee: ~${displayPercent}%` };
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