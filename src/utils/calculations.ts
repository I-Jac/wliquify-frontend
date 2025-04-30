'use client';

import { PublicKey, AccountInfo } from "@solana/web3.js";
import { Buffer } from "buffer";
import { BN } from '@coral-xyz/anchor';
import { USD_SCALE } from "./constants"; // Assuming USD_SCALE is defined here
import { formatUnits } from 'ethers';
import { PoolConfig } from '@/types';

// --- Constants ---
export const PRICE_SCALE_FACTOR = new BN(10).pow(new BN(10)); // 10^10 used for scaling prices

// Constant for percentage scaling (Scaled by 1,000,000: 1% = 10,000 scaled units)
const PERCENTAGE_CALC_SCALE = 1000000;
const BN_PERCENTAGE_CALC_SCALE = new BN(PERCENTAGE_CALC_SCALE);

// --- Type Definitions (You might want to centralize these) ---

// Structure matching the mock price feed data serialized in oracle_program
// Note: This assumes the structure from constantbatchedData.ts
// struct MockPriceFeed {
//     authority: Pubkey, // 32 bytes
//     price: i64,        // 8 bytes, little-endian
//     exponent: i32,     // 4 bytes, little-endian
// }
export interface DecodedPriceData {
    price: BN; // Price, scaled according to expo
    expo: number;  // Exponent (negative, e.g., -8 for USD)
    // Add other relevant fields if needed (e.g., symbol, timestamp, status)
}

// Combined data needed per token for calculations
export interface ProcessedTokenData {
    mintAddress: string;
    symbol: string;
    targetDominance: BN; // From Oracle Data
    priceFeedId: string; // ADDED: Price feed account address
    decimals: number | null; // Decimals of the token mint
    vaultBalance: BN | null; // Raw balance from the token vault ATA
    priceData: DecodedPriceData | null; // Decoded from Dynamic Data
    userBalance: BN | null; // User's balance for this token
}

// Represents the aggregated data for a single token from the Oracle (e.g., Switchboard function)
export interface AggregatedOracleTokenData {
    address: string; // Mint address
    symbol: string;
    priceFeedId: string; // Price feed account address for this token
}

// Represents the decoded structure of the aggregator account data
export interface AggregatedOracleDataDecoded {
    version: number;
    authority: string;
    data: AggregatedOracleTokenData[];
    // Add other fields from the aggregator state if necessary
}

// Represents the dynamic data fetched for each token (balances, price)
export interface DynamicTokenData {
    isLoading: boolean;
    error: string | null;
    mint: PublicKey;
    vaultBalance: bigint | null;
    userBalance: bigint | null;
    price: AggregatedPriceData | null;
    decimals: number | null;
}

// More specific type for price, mirroring DecodedPriceData but maybe used differently
// Ensure this matches the price data structure stored in DynamicTokenData
export interface AggregatedPriceData {
    price: bigint; 
    expo: number;
}

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

// --- Decoding Functions ---

/**
 * Decodes the raw account data buffer of a mock price feed account.
 * Assumes the structure: authority (32 bytes), price (i64, 8 bytes, little-endian), exponent (i32, 4 bytes, little-endian).
 * Skips the initial 8 bytes (Anchor discriminator) and 32 bytes (authority).
 *
 * @param priceFeedInfo The raw AccountInfo<Buffer> from getAccountInfo.
 * @returns DecodedPriceData object or null if data is invalid.
 */
export function decodePriceData(priceFeedInfo: AccountInfo<Buffer> | null): DecodedPriceData | null {
    // Correct length check: Discriminator (8) + Price (8) + Exponent (4) = 20 bytes minimum
    if (!priceFeedInfo || priceFeedInfo.data.length < (8 + 8 + 4)) {
        console.error('Invalid price feed account info or insufficient data length.', priceFeedInfo?.data?.length);
        return null;
    }

    try {
        // Correct offset: Skip only the 8-byte Anchor discriminator
        const dataBuffer = Buffer.from(priceFeedInfo.data.slice(8));

        // Price: i64, little-endian (8 bytes at offset 0 of the sliced buffer)
        const price = new BN(dataBuffer.subarray(0, 8), 'le');

        // Exponent: i32, little-endian (4 bytes at offset 8 of the sliced buffer)
        const exponent = dataBuffer.readInt32LE(8);

        return { price, expo: exponent };
    } catch (error) {
        console.error('Error decoding price feed data:', error);
        return null;
    }
}

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
    if (!scaledBn) return '0.00%';
    try {
        const percentage = scaledBn.toNumber() / 10000;
        // Use localeString for consistent decimal separator
        return percentage.toLocaleString('fr-FR', { 
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    } catch (error) {
        console.error("Error formatting scaled BN to percentage string:", error);
        return 'Error';
    }
}

/**
 * Calculates the total value of the pool and individual token metrics.
 * @param poolConfig - The static configuration of the pool.
 * @param tokensData - Array containing dynamic data (vault balance, price, decimals) for each supported token.
 * @param wLqiSupply - The total supply of the wLQI token.
 * @returns PoolMetrics object or null if calculation fails.
 */
export const calculatePoolMetrics = (
    poolConfig: PoolConfig,
    tokensData: Array<{
        mint: PublicKey;
        decimals: number | null;
        vaultBalance: BN | null;
        price: DecodedPriceData | null;
    }>,
    wLqiSupply: string | null
): PoolMetrics | null => {
    if (wLqiSupply === null || wLqiSupply === '0') return null; 
    const wLqiSupplyBn = new BN(wLqiSupply);
    if (wLqiSupplyBn.isZero() || wLqiSupplyBn.isNeg()) return null;

    let calculatedTotalValueUsdScaled = new BN(0);
    const tokenMetrics: TokenMetric[] = [];
    let wLqiDecimals: number | null = null;

    const wLqiInData = tokensData.find(td => td.mint.equals(poolConfig.wliMint));
    wLqiDecimals = wLqiInData?.decimals ?? 9; 

    for (const token of tokensData) {
        const decimals = token.decimals;
        const vaultBalance = token.vaultBalance; // is BN | null
        const priceInfo = token.price; // is DecodedPriceData | null

        if (decimals === null || vaultBalance === null || priceInfo === null) {
            console.warn(`Skipping token ${token.mint.toBase58()} due to missing metric data.`);
            continue;
        }

        try {
            const scaleFactor = new BN(10).pow(new BN(USD_SCALE));
            // Use priceInfo.expo, not priceInfo.price.expo
            const denominatorPower = decimals - priceInfo!.expo; // Add assertion for priceInfo
            if (denominatorPower < 0) throw new Error("Negative denominator power");
            const denominator = new BN(10).pow(new BN(denominatorPower));
            if (denominator.isZero()) throw new Error("Denominator is zero");

            const valueScaled = vaultBalance!.mul(priceInfo!.price).mul(scaleFactor).div(denominator);
            calculatedTotalValueUsdScaled = calculatedTotalValueUsdScaled.add(valueScaled);

            tokenMetrics.push({
                mint: token.mint,
                symbol: 'TODO', 
                actualPercentage: null, 
                targetPercentage: null, 
            });
        } catch (e) {
            console.error(`Error calculating value for token ${token.mint.toBase58()}:`, e);
        }
    }

    if (calculatedTotalValueUsdScaled.isNeg() || calculatedTotalValueUsdScaled.isZero()) { // Check both neg and zero
        console.warn("Calculated total value is zero or negative.");
        tokenMetrics.forEach(tm => tm.actualPercentage = 0);
        return { totalValueUsd: 0, wLqiValueUsd: 0, wLqiDecimals, tokenMetrics };
    }

    // Format requires string or number, convert BN
    const totalValueUsd = parseFloat(formatUnits(calculatedTotalValueUsdScaled.toString(), USD_SCALE));
    
    let wLqiValueUsd = 0;
    try {
        const wLqiMultiplier = new BN(10).pow(new BN(wLqiDecimals));
        const wLqiNumerator = calculatedTotalValueUsdScaled.mul(wLqiMultiplier);
        const wLqiValueUsdScaled = wLqiNumerator.div(wLqiSupplyBn);
        // Format requires string or number, convert BN
        wLqiValueUsd = parseFloat(formatUnits(wLqiValueUsdScaled.toString(), USD_SCALE));
    } catch(e) {
        console.error("Error calculating wLQI value:", e);
    }

    tokenMetrics.forEach(metric => {
        const tokenData = tokensData.find(td => td.mint.equals(metric.mint));
        const decimals = tokenData?.decimals;
        const vaultBalance = tokenData?.vaultBalance; 
        const priceInfo = tokenData?.price;

        if (tokenData && decimals !== null && vaultBalance !== null && priceInfo !== null) {
             try {
                const scaleFactor = new BN(10).pow(new BN(USD_SCALE));
                // Use priceInfo.expo and add assertion for decimals
                const denominatorPower = decimals! - priceInfo!.expo; 
                if (denominatorPower < 0) throw new Error("Negative denominator power");
                const denominator = new BN(10).pow(new BN(denominatorPower));
                if (denominator.isZero()) throw new Error("Denominator is zero");

                const valueScaled = vaultBalance!.mul(priceInfo!.price).mul(scaleFactor).div(denominator);
                const percentageScaled = valueScaled.mul(new BN(10000)).div(calculatedTotalValueUsdScaled);
                metric.actualPercentage = percentageScaled.toNumber() / 100; 
            } catch (e) {
                 console.error(`Error calculating percentage for token ${metric.mint.toBase58()}:`, e);
                 metric.actualPercentage = null;
            }
        } else {
            metric.actualPercentage = null;
        }
    });

    return {
        totalValueUsd,
        wLqiValueUsd,
        wLqiDecimals,
        tokenMetrics,
    };
};