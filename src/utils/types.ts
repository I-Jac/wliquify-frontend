import { PublicKey, AccountInfo } from "@solana/web3.js";
// import { Program, BN } from "@coral-xyz/anchor"; // Removed Program
import { BN } from "@coral-xyz/anchor"; // Keep BN separate

// Type for processing token info needed across multiple tests
// ... (existing ProcessedSupportedToken interface) ...

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
    timestamp: string; // ADDED: Keep as string from BN
}

export interface AggregatedOracleDataDecoded {
    authority: string;
    totalTokens: number;
    data: TokenInfoDecoded[]; // Will include timestamp via TokenInfoDecoded
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
    priceFeedIndex: number | undefined; // Updated to allow undefined
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
    timestamp: string; // ADDED
}

// --- Added from src/types/index.ts ---

// Mirror of Rust struct from w-liquify-pool/state.rs
export interface SupportedToken {
    mint: PublicKey;
    vault: PublicKey;       // Pool's vault ATA for this token
    tokenHistory: PublicKey; // PDA for historical data
    priceFeed: PublicKey;    // Price feed account (e.g., Pyth)
    // targetDominanceBps: number; // REMOVED: Not present in latest PoolConfig based on other files
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
    // tokenValueScaled: BN; // Maybe remove if poolValueUSD is sufficient?
    actualDominancePercent: number;
    targetDominance: BN; // Keep BN for potential calcs
    targetDominancePercent: number;
    targetDominanceDisplay: string; // Pre-formatted target
    decimals: number; // Added decimals
    isDelisted: boolean;
    depositFeeOrBonusBps: number | null;
    withdrawFeeOrBonusBps: number | null;
    priceFeedId: string; // Price feed address string
    vaultBalance: BN; // Vault balance BN
    priceData: DecodedPriceData; // Use local DecodedPriceData type
    userBalance: BN | null; // User balance BN
    timestamp: string; // ADDED: Timestamp as string
}

// --- Price Data Types ---
export interface DecodedPriceData {
    price: BN; // Price, scaled according to expo
    expo: number;  // Exponent (negative, e.g., -8 for USD)
}

export interface AggregatedPriceData {
    price: bigint; 
    expo: number;
}

// --- Oracle Data Types ---
export interface TokenInfo {
    symbol: number[]; // Represents [u8; 10] - Raw bytes, need parsing
    dominance: BN; // Represents u64
    address: number[]; // Represents [u8; 64] - Raw bytes, need parsing
    priceFeedId: number[]; // Represents [u8; 64] - Raw bytes, need parsing
    timestamp: BN; // Represents i64
}

export interface AggregatedOracleData {
    authority: PublicKey; // Represents Pubkey
    totalTokens: number; // Represents u32
    data: TokenInfo[]; // Represents Vec<TokenInfo>
}

// --- Fee Calculation Types ---
export interface FeeCalculationProps {
    totalPoolValueScaled: BN | null;
    totalTargetDominance: BN;
    tokenValueUsd: BN | null;
    targetDominance: BN;
    isDepositInputFilled: boolean;
    isWithdrawInputFilled: boolean;
    currentDepositAmount: string;
    currentWithdrawAmount: string;
    decimals: number | null;
    wLqiDecimals: number | null;
    wLqiValueScaled: BN | null;
    priceData: DecodedPriceData | null;
    vaultBalance: BN | null;
} 