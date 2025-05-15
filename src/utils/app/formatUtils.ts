'use client';

import { BN } from '@coral-xyz/anchor';
// import { BN_PERCENTAGE_CALC_SCALE } from '../core/constants'; // Removed unused import

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