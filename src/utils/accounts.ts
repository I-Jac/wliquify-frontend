import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { HistoricalTokenDataDecoded } from './types'; // Import the type
import { AccountLayout, MintLayout } from '@solana/spl-token'; // Import layouts
import { BN } from '@coral-xyz/anchor'; // Import BN

// --- Placeholder Helper --- 
// TODO: Find or create a proper bytesToString helper
export const bytesToString = (bytes: Buffer): string => {
    const firstNull = bytes.indexOf(0);
    const relevantBytes = firstNull === -1 ? bytes : bytes.subarray(0, firstNull);
    return relevantBytes.toString('utf8');
};

/**
 * Fetches and parses multiple accounts using getMultipleAccountsInfo.
 * Handles potential nulls in the response array.
 */
export const fetchMultipleAccounts = async (
    connection: Connection,
    publicKeys: PublicKey[],
    commitment: 'confirmed' | 'processed' | 'finalized' = 'confirmed'
): Promise<(AccountInfo<Buffer> | null)[]> => {
    if (publicKeys.length === 0) {
        return [];
    }
    try {
        const accountsInfo = await connection.getMultipleAccountsInfo(publicKeys, commitment);
        return accountsInfo;
    } catch (error) {
        console.error("Error fetching multiple accounts:", error);
        // Return an array of nulls matching the input length on error
        return new Array(publicKeys.length).fill(null);
    }
};

// --- Account Decoders --- 

// Moved from PoolInfoDisplay
export const decodeTokenAccountAmountBN = (buffer: Buffer): BN => {
    try { return new BN(AccountLayout.decode(buffer).amount.toString()); }
    catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error("Decode Account BN Error:", errorMessage);
        return new BN(0);
    }
};

// Moved from PoolInfoDisplay
export const decodeMintAccountSupplyString = (buffer: Buffer): string => {
    try { return MintLayout.decode(buffer).supply.toString(); }
    catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error("Decode Mint String Error:", errorMessage);
        return '0';
    }
};

// --- MOVED from oracle_state.ts: Decode HistoricalTokenData Account --- 
export const decodeHistoricalTokenData = (accountInfo: AccountInfo<Buffer> | null): HistoricalTokenDataDecoded | null => {
    if (!accountInfo || accountInfo.data.length === 0) return null;

    // Layout: 8b discriminator + 32b feed_id + 1b decimals + 10b symbol
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
        const symbol = bytesToString(symbolBytes); // Use local helper

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