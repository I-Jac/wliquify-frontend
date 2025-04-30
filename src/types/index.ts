import { PublicKey } from '@solana/web3.js';

// Mirror of Rust struct from w-liquify-pool/state.rs
export interface SupportedToken {
    mint: PublicKey;
    vault: PublicKey;       // Pool's vault ATA for this token
    tokenHistory: PublicKey; // PDA for historical data
    priceFeed: PublicKey;    // Price feed account (e.g., Pyth)
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
    supportedTokens: SupportedToken[];
}

// TODO: Add other shared types here (e.g., AggregatedOracleDataDecoded, DynamicTokenData) if needed elsewhere 