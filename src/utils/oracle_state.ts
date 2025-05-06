import * as anchor from "@coral-xyz/anchor"; // For BN
import { PublicKey } from "@solana/web3.js"; // Removed Connection
import { Buffer } from 'buffer'; // Import Buffer
import { BN } from "@coral-xyz/anchor"; // BN needed for parsing

// Mirroring TokenInfo from oracle_program/src/lib.rs
export interface TokenInfo {
    symbol: number[]; // Represents [u8; 10] - Raw bytes, need parsing
    dominance: anchor.BN; // Represents u64
    address: number[]; // Represents [u8; 64] - Raw bytes, need parsing
    priceFeedId: number[]; // Represents [u8; 64] - Raw bytes, need parsing
    timestamp: anchor.BN; // ADDED: Represents i64
}

// Mirroring AggregatedOracleData from oracle_program/src/lib.rs
export interface AggregatedOracleData {
    authority: PublicKey; // Represents Pubkey
    totalTokens: number; // Represents u32
    data: TokenInfo[]; // Represents Vec<TokenInfo>
}

// Constants for manual deserialization (ensure these match the Oracle program)
const DISCRIMINATOR_LENGTH = 8;
const PUBKEY_LENGTH = 32;
const U32_LENGTH = 4;
const U64_LENGTH = 8;
const I64_LENGTH = 8; // ADDED for timestamp
const SYMBOL_LENGTH = 10;
const ADDRESS_PADDED_LENGTH = 64;
const PRICE_FEED_ID_PADDED_LENGTH = 64;
// UPDATE size to include timestamp
const TOKEN_INFO_SERIALIZED_SIZE = SYMBOL_LENGTH + U64_LENGTH + ADDRESS_PADDED_LENGTH + PRICE_FEED_ID_PADDED_LENGTH + I64_LENGTH; // Now 154

/**
 * Parses the raw account data buffer of the Oracle Program's AggregatedOracleData account.
 * Skips the 8-byte discriminator.
 * @param rawDataBuffer The raw account data buffer.
 * @returns The parsed AggregatedOracleData object.
 * @throws Error if buffer is too short or parsing fails.
 */
export function parseOracleData(rawDataBuffer: Buffer): AggregatedOracleData {
    if (rawDataBuffer.length < DISCRIMINATOR_LENGTH) {
        throw new Error("Buffer too short to contain discriminator.");
    }
    // Skip discriminator
    const dataBuffer = rawDataBuffer.subarray(DISCRIMINATOR_LENGTH);
    
    let offset = 0; 

    // Authority
    if (offset + PUBKEY_LENGTH > dataBuffer.length) throw new Error("Buffer too short for authority");
    const authorityBytes = dataBuffer.subarray(offset, offset + PUBKEY_LENGTH);
    const authorityPubkey = new PublicKey(authorityBytes);
    offset += PUBKEY_LENGTH;

    // Total Tokens (Field)
    if (offset + U32_LENGTH > dataBuffer.length) throw new Error("Buffer too short for totalTokens field");
    const totalTokensField = dataBuffer.readUInt32LE(offset);
    offset += U32_LENGTH;

    // Vector Length
    if (offset + U32_LENGTH > dataBuffer.length) throw new Error("Buffer too short for vector length");
    const vecLen = dataBuffer.readUInt32LE(offset);
    offset += U32_LENGTH;

    if (vecLen !== totalTokensField) {
        console.warn(`Warning: Decoded vector length (${vecLen}) does not match totalTokens field (${totalTokensField}) in Oracle Aggregator. Using vecLen for iteration.`);
    }

    const tokenInfoArray: TokenInfo[] = [];
    for (let i = 0; i < vecLen; i++) {
        const requiredLength = offset + TOKEN_INFO_SERIALIZED_SIZE;
        if (requiredLength > dataBuffer.length) {
            throw new Error(`Buffer overflow trying to read TokenInfo ${i + 1}. Need ${requiredLength}, have ${dataBuffer.length}`);
        }
        const tokenSlice = dataBuffer.subarray(offset, requiredLength);
        let tokenOffset = 0;

        // Symbol
        const symbolBytes = Array.from(tokenSlice.subarray(tokenOffset, tokenOffset + SYMBOL_LENGTH));
        tokenOffset += SYMBOL_LENGTH;

        // Dominance
        const dominanceBn = new BN(tokenSlice.subarray(tokenOffset, tokenOffset + U64_LENGTH), 'le');
        tokenOffset += U64_LENGTH;

        // Address (padded string)
        const addressBytes = Array.from(tokenSlice.subarray(tokenOffset, tokenOffset + ADDRESS_PADDED_LENGTH));
        tokenOffset += ADDRESS_PADDED_LENGTH;

        // Price Feed ID (padded string)
        const priceFeedIdBytes = Array.from(tokenSlice.subarray(tokenOffset, tokenOffset + PRICE_FEED_ID_PADDED_LENGTH));
        tokenOffset += PRICE_FEED_ID_PADDED_LENGTH; // Move offset past price feed

        // Timestamp (i64) - ADDED
        const timestampBn = new BN(tokenSlice.subarray(tokenOffset, tokenOffset + I64_LENGTH), 'le');
        // No need to update tokenOffset here as it's the last field

        tokenInfoArray.push({
            symbol: symbolBytes,
            dominance: dominanceBn,
            address: addressBytes,
            priceFeedId: priceFeedIdBytes,
            timestamp: timestampBn // Add timestamp
        });

        offset += TOKEN_INFO_SERIALIZED_SIZE; // Move to the next item in the main buffer
    }

    const oracleState: AggregatedOracleData = {
        authority: authorityPubkey,
        totalTokens: totalTokensField, // Store the original field value
        data: tokenInfoArray // Store the parsed array (length might differ from totalTokensField if warning occurred)
    };

    return oracleState;
}

// Note: These are interfaces for type checking.
// When fetching data using the Anchor client (`mockOracleClient.account.aggregatedOracleData.fetch`),
// Anchor typically handles the deserialization and provides an object matching this structure.
// The `number[]` fields will contain the raw byte arrays from the Rust fixed-size arrays.