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
    tempWliqAta: PublicKey;
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
    targetRank?: number; // Optional rank based on targetDominance, for non-delisted tokens
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
    isDelisted: boolean;
}

// Settings Related Types
export type FeeLevel = 'Normal' | 'Fast' | 'Turbo' | 'Custom';

export type DynamicFeeLevels = {
    Normal: number | undefined;
    Fast: number | undefined;
    Turbo: number | undefined;
};

// New Type for RPC Options
export type RpcOption = {
    name: string;
    url: string;
};

// SettingsModal specific type
export interface InitialSettings {
    feeLevel: FeeLevel;
    maxPriorityFeeCapSol: number;
    slippageBps: number;
    selectedRpcUrl: string;
    isCustomRpc: boolean;
    customRpcInputValue: string;
    isCustomSlippage: boolean;
    rawCustomSlippageInput?: string; // Added for storing the raw text input for custom slippage
    preferredLanguage: string;
    preferredCurrency?: string;
    numberFormat?: NumberFormatSettings;
    preferredExplorer: string;
}

// Profile Settings Types
export type LanguageOption = {
    code: string; // e.g., 'en', 'es'
    name: string; // e.g., 'English', 'Español'
};

export type CurrencyOption = {
    code: string; // e.g., 'USD', 'EUR'
    name: string; // e.g., 'US Dollar', 'Euro'
    symbol: string; // e.g., '$', '€'
};

export type NumberFormatSettings = {
    decimalSeparator: '.' | ',';
    thousandSeparator: ',' | '.' | ' ' | ''; // Can be empty string for no separator
};

export type SolanaExplorerOption = {
    name: string; // e.g., 'Solscan', 'SolanaFM', 'Explorer'
    urlTemplate: string; // e.g., 'https://solscan.io/tx/{txId}?cluster={cluster}'
    // Add other templates as needed (address, account, etc.)
    addressUrlTemplate?: string; // e.g., 'https://solscan.io/account/{address}?cluster={cluster}'
    tokenUrlTemplate?: string; // e.g., 'https://solscan.io/token/{token_address}?cluster={cluster}'
    getClusterQueryParam: (clusterConst: string) => string; // ADDED: Function to get the correct cluster query parameter string
};

export interface ProfileSettings {
    preferredLanguage: string; // language code, e.g., 'en'
    preferredCurrency: string; // currency code, e.g., 'USD'
    numberFormat: NumberFormatSettings;
    preferredExplorer: string; // explorer name, e.g., 'Solscan'
}

// ... (if any other types exist below, keep them) 