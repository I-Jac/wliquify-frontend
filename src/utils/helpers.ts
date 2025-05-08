import { Buffer } from 'buffer';

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