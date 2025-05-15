'use client';

import { BN } from '@coral-xyz/anchor';
import { formatUnits } from 'ethers';

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
 * @param amount - The raw token amount (string, BN, bigint, or number).
 * @param decimals - The number of decimals for the token.
 * @param showDecimals - Whether to show decimal places in the output.
 * @param maxDisplayDecimals - Optional cap on the number of decimal places shown.
 * @returns Formatted string or null if formatting fails.
 */
export const formatRawAmountString = (
    amount: string | BN | bigint | null | undefined,
    decimals: number | null,
    showDecimals: boolean = true,
    maxDisplayDecimals?: number // Optional: Cap the displayed decimals
): string | null => {
    if (amount === null || amount === undefined || decimals === null) {
        return null; 
    }
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