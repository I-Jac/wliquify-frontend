import { PublicKey, AccountInfo } from "@solana/web3.js";
import { Program, BN } from "@coral-xyz/anchor";
import { Schema, deserialize } from 'borsh'; // Import borsh

// Type for processing token info needed across multiple tests
// ... (existing ProcessedSupportedToken interface) ...

// --- MockPriceFeed Deserialization --- 

// Define as a class instead of an interface for Borsh
export class MockPriceFeedAccountData {
    price: BN;
    expo: number;
    symbol: string;
    status: number;
    lastUpdatedTimestamp: BN;
    bump: number;

    constructor(fields: { price: BN, expo: number, symbol: string, status: number, lastUpdatedTimestamp: BN, bump: number }) {
        this.price = fields.price;
        this.expo = fields.expo;
        this.symbol = fields.symbol;
        this.status = fields.status;
        this.lastUpdatedTimestamp = fields.lastUpdatedTimestamp;
        this.bump = fields.bump;
    }
}

// Borsh schema definition matching the Rust struct field order
// Use the class name as the key
export const MockPriceFeedSchema: Schema = new Map([
    [MockPriceFeedAccountData, { // Use class name
        kind: 'struct', 
        fields: [ 
            ['price', 'i64'],
            ['expo', 'i32'], 
            ['symbol', 'string'], 
            ['status', 'u8'], 
            ['lastUpdatedTimestamp', 'i64'],
            ['bump', 'u8'],
        ] 
    }]
]);

// Helper function to deserialize a MockPriceFeed buffer
// Assumes the buffer STARTS AFTER the 8-byte discriminator
export function deserializeMockPriceFeed(buffer: Buffer): MockPriceFeedAccountData {
    if (buffer.length < 8) {
        throw new Error("Buffer too short to contain discriminator");
    }
    const dataBuffer = buffer.subarray(8);
    
    try {
        // Use the class name here as well
        const deserialized = deserialize(MockPriceFeedSchema, MockPriceFeedAccountData, dataBuffer);
        
        // Borsh JS needs explicit BN conversion for i64/u64
        // Convert fields after deserialization
        const priceBN = new BN(deserialized.price.toString());
        const timestampBN = new BN(deserialized.lastUpdatedTimestamp.toString());

        // Return a new instance with BN types correctly constructed
        return new MockPriceFeedAccountData({
            ...deserialized,
            price: priceBN,
            lastUpdatedTimestamp: timestampBN,
        });
    } catch (error) {
        console.error("Borsh deserialization failed:", error);
        throw new Error(`Failed to deserialize MockPriceFeed buffer: ${error}`);
    }
} 

// Moved from PoolInfoDisplay.tsx
export interface HistoricalTokenDataDecoded {
    feedId: string; // Stored as base58 string of the PDA
    decimals: number;
    symbol: string;
}

export interface TokenInfoDecoded {
    symbol: string;
    dominance: string; // Keep as string from BN for simplicity?
    address: string;   // Keep as string from bytesToString
    priceFeedId: string; // Keep as string from bytesToString
}

export interface AggregatedOracleDataDecoded {
    authority: string;
    totalTokens: number;
    data: TokenInfoDecoded[];
}

export interface DynamicTokenData {
    vaultBalance: BN | null;
    priceFeedInfo: AccountInfo<Buffer> | null;
    decimals: number | null;
    userBalance: BN | null;
}

export interface TokenProcessingInfo {
    mint: PublicKey;
    vault: PublicKey;
    priceFeed: PublicKey;
    userAta?: PublicKey; // Optional user ATA
    vaultIndex: number;
    priceFeedIndex: number;
    historyPdaIndex: number; 
    userAtaIndex?: number; // Optional user ATA index
    mintDecimals: number;
}

// Renamed from TokenInfoDecodedLocal (PoolInfoDisplay.tsx)
// Represents the decoded string data from the oracle aggregator
export interface ParsedOracleTokenInfo {
    symbol: string;
    dominance: string; 
    address: string;   
    priceFeedId: string;
} 

// --- Added from src/types/index.ts ---

// Mirror of Rust struct from w-liquify-pool/state.rs
export interface SupportedToken {
    mint: PublicKey;
    vault: PublicKey;       // Pool's vault ATA for this token
    tokenHistory: PublicKey; // PDA for historical data
    priceFeed: PublicKey;    // Price feed account (e.g., Pyth)
    targetDominanceBps: number; // ADDED: Target dominance (basis points, u16 in Rust)
}

// Mirror of Rust struct from w-liquify-pool/state.rs
export interface PoolConfig {
    admin: PublicKey;
    feeRecipient: PublicKey;
    wliMint: PublicKey;
    poolAuthorityBump: number;
    oracleProgramId: PublicKey;
    oracleAggregatorAccount: PublicKey;
    addressLookupTable: PublicKey;
    currentTotalPoolValueScaled: BN;
    supportedTokens: SupportedToken[];
}

// ADDED: Derived type for processed data used by UI components
export interface ProcessedTokenData {
    mintAddress: string;
    symbol: string;
    icon: string;
    poolValueUSD: string;
    tokenValueScaled: BN;
    actualDominancePercent: number;
    targetDominance: BN;
    targetDominancePercent: number;
} 