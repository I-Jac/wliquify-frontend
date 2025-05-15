import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { AccountLayout, MintLayout } from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';
import { decodeHistoricalTokenData } from '../app/oracleUtils';

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
        return new Array(publicKeys.length).fill(null);
    }
};

// --- Account Decoders ---
export const decodeTokenAccountAmountBN = (buffer: Buffer): BN => {
    if (!Buffer.isBuffer(buffer)) {
        console.error("Decode Account BN Error: Input must be a Buffer");
        return new BN(0);
    }
    try { 
        return new BN(AccountLayout.decode(buffer).amount.toString()); 
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error("Decode Account BN Error:", errorMessage);
        return new BN(0);
    }
};

export const decodeMintAccountSupplyString = (buffer: Buffer): string => {
    if (!Buffer.isBuffer(buffer)) {
        console.error("Decode Mint String Error: Input must be a Buffer");
        return '0';
    }
    try { 
        return MintLayout.decode(buffer).supply.toString(); 
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error("Decode Mint String Error:", errorMessage);
        return '0';
    }
};

// Re-export oracle function for backward compatibility
export { decodeHistoricalTokenData }; 