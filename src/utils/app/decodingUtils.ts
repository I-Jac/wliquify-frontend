import { AccountInfo } from "@solana/web3.js";
import { Buffer } from "buffer";
import { BN } from '@coral-xyz/anchor';
import { DecodedPriceData } from '@/utils/core/types'; // Assuming DecodedPriceData is from here

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