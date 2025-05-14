import { Connection, PublicKey, SystemProgram, AccountInfo } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { Buffer } from 'buffer';
import { ParsedOracleTokenInfo, HistoricalTokenDataDecoded, TokenInfo, AggregatedOracleData } from '../core/types';
import { bytesToString } from '../core/helpers';
import { showToast } from '../ui/notifications';

// --- Constants ---
const DISCRIMINATOR_LENGTH = 8;
const I64_LENGTH = 8;
const SYMBOL_LENGTH = 10;
const U64_LENGTH = 8;
const ADDRESS_PADDED_LENGTH = 64;
const PRICE_FEED_ID_PADDED_LENGTH = 64;
const TOKEN_INFO_SERIALIZED_SIZE = SYMBOL_LENGTH + U64_LENGTH + ADDRESS_PADDED_LENGTH + PRICE_FEED_ID_PADDED_LENGTH + I64_LENGTH;

export interface OracleProcessingResult {
    decodedTokens: ParsedOracleTokenInfo[];
    error: string | null;
}

/**
 * Process oracle data from an account
 */
export async function processOracleData(
    connection: Connection,
    oracleAggregatorAddress: PublicKey
): Promise<OracleProcessingResult> {
    if (oracleAggregatorAddress.equals(SystemProgram.programId)) {
        return { decodedTokens: [], error: null };
    }

    try {
        const oracleAccountInfo = await connection.getAccountInfo(oracleAggregatorAddress);
        if (!oracleAccountInfo) {
            const error = "Oracle account not found";
            showToast(error, 'error');
            return { decodedTokens: [], error };
        }

        const { data: tokenInfoArray } = parseOracleData(Buffer.from(oracleAccountInfo.data));
        
        const decodedTokens: ParsedOracleTokenInfo[] = tokenInfoArray.map(info => ({
            symbol: bytesToString(info.symbol),
            dominance: info.dominance.toString(),
            address: bytesToString(info.address),
            priceFeedId: bytesToString(info.priceFeedId),
            timestamp: info.timestamp.toString()
        }));

        return { decodedTokens, error: null };
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const error = `Oracle refresh failed: ${errorMessage}`;
        showToast(error, 'error');
        return { decodedTokens: [], error };
    }
}

/**
 * Parse raw oracle data buffer into structured format
 */
export function parseOracleData(rawDataBuffer: Buffer): AggregatedOracleData {
    if (rawDataBuffer.length < DISCRIMINATOR_LENGTH) {
        throw new Error(`Buffer too small: ${rawDataBuffer.length} bytes`);
    }

    const dataBuffer = rawDataBuffer.slice(DISCRIMINATOR_LENGTH);
    let offset = 0;

    // Authority (Pubkey)
    const authorityPubkey = new PublicKey(dataBuffer.subarray(offset, offset + 32));
    offset += 32;

    // Total Tokens (u32)
    const totalTokensField = dataBuffer.readUInt32LE(offset);
    offset += 4;

    // Vector length (u32)
    const vecLen = dataBuffer.readUInt32LE(offset);
    offset += 4;

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
        tokenOffset += PRICE_FEED_ID_PADDED_LENGTH;

        // Timestamp (i64)
        const timestampBn = new BN(tokenSlice.subarray(tokenOffset, tokenOffset + I64_LENGTH), 'le');

        tokenInfoArray.push({
            symbol: symbolBytes,
            dominance: dominanceBn,
            address: addressBytes,
            priceFeedId: priceFeedIdBytes,
            timestamp: timestampBn
        });

        offset += TOKEN_INFO_SERIALIZED_SIZE;
    }

    return {
        authority: authorityPubkey,
        totalTokens: totalTokensField,
        data: tokenInfoArray
    };
}

/**
 * Decode historical token data from an account
 */
export const decodeHistoricalTokenData = (accountInfo: AccountInfo<Buffer> | null): HistoricalTokenDataDecoded | null => {
    if (!accountInfo || accountInfo.data.length === 0) return null;

    if (accountInfo.data.length < 51) {
        console.warn("HistoricalTokenData buffer too small:", accountInfo.data.length);
        return null;
    }
    
    const data = accountInfo.data.slice(8); // Skip discriminator
    
    try {
        const feedIdBytes = data.slice(0, 32);
        const feedId = new PublicKey(feedIdBytes).toBase58(); 
        const decimals = data.readUInt8(32);
        const symbolBytes = data.slice(33, 33 + 10);
        const symbol = bytesToString(symbolBytes);

        return {
            feedId,
            decimals,
            symbol,
        };
    } catch (error) {
        console.error("Error decoding HistoricalTokenData:", error);
        return null;
    }
}; 