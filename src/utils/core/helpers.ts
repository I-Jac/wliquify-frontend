import { Buffer } from 'buffer';
import { BN } from '@coral-xyz/anchor';

/**
 * Converts a Buffer or number array to a UTF-8 string, stopping at the first null byte.
 * Used for parsing string fields in account data.
 */
export function bytesToString(bytes: Buffer | number[]): string {
    if (!bytes || bytes.length === 0) {
        return '';
    }
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const firstNull = buffer.indexOf(0);
    return firstNull === -1 ? buffer.toString('utf8') : buffer.subarray(0, firstNull).toString('utf8');
}

/**
 * Safely converts a value to a number, returning a default if conversion fails.
 */
export function safeToNumber(value: unknown, defaultValue: number = 0): number {
    if (value === null || value === undefined) return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
}

/**
 * Safely converts a value to a string, returning a default if conversion fails.
 */
export function safeToString(value: unknown, defaultValue: string = ''): string {
    if (value === null || value === undefined) return defaultValue;
    return String(value);
}

/**
 * Safely converts a BN, which is already scaled by a certain factor (e.g., USD_SCALE),
 * to a standard JavaScript number.
 * It first "unscales" the BN (divides by 10^scale) to get the value in its standard unit (e.g., dollars).
 * Then, it checks if this unscaled BN can be safely converted to a number (bitLength <= 53).
 *
 * @param scaledValueBN The BigNumber instance, representing a value scaled by 10^scale.
 * @param scale The scale factor (e.g., USD_SCALE like 8 for cents).
 * @returns The number if conversion is safe, otherwise undefined.
 */
export function safeConvertBnToNumber(scaledValueBN: BN | null | undefined, scale: number): number | undefined {
    if (!scaledValueBN) {
        return undefined;
    }

    try {
        const scaleDivisor = new BN(10).pow(new BN(scale));
        if (scaleDivisor.isZero()) { // Should not happen with typical scales
            console.error("safeConvertBnToNumber: Scale divisor is zero.");
            return undefined;
        }

        // Get the value in standard units (e.g., dollars if scale was for cents)
        const valueInStandardUnitsBN = scaledValueBN.div(scaleDivisor);

        // Check if the BN (representing standard units) is small enough for safe conversion
        if (valueInStandardUnitsBN.bitLength() > 53) {
            // console.warn("safeConvertBnToNumber: BN bitLength > 53, too large to convert to number safely.", valueInStandardUnitsBN.toString());
            return undefined; // Value is too large
        }

        return valueInStandardUnitsBN.toNumber();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e) {
        // console.error("safeConvertBnToNumber: Error during conversion:", e);
        return undefined;
    }
} 