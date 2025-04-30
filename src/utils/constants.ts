import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer'; // Ensure Buffer is available

// Network Configuration
//export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8900";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

// Program IDs
export const W_LIQUIFY_POOL_PROGRAM_ID = new PublicKey(
    process.env.NEXT_PUBLIC_POOL_PROGRAM_ID || "H9Y1ERhaAzDhKjYuMsbqQ1d3L6Mt7g244U2jfkEXy48Q"
);
export const ORACLE_PROGRAM_ID = new PublicKey(
    process.env.NEXT_PUBLIC_ORACLE_PROGRAM_ID || "DP9kZHS77pbTuTHKNsaxqFjrUboFLGXvyCQsxYvWM26c"
);

// Official Program IDs
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const ADDRESS_LOOKUP_TABLE_PROGRAM_ID = new PublicKey("AddressLookupTab1e1111111111111111111111111");


// PDA Seeds (matching Rust constants)
export const POOL_CONFIG_SEED = Buffer.from("pool_config");
export const POOL_AUTHORITY_SEED = Buffer.from("pool_authority");
export const TOKEN_HISTORY_SEED = Buffer.from("token_history");
export const WLI_MINT_SEED = Buffer.from("wli_mint");
export const ORACLE_AGGREGATOR_SEED = Buffer.from("aggregator_v2");

// You might add other constants from the pool program's constants.rs if needed
// e.g., USD_SCALE, BPS_SCALE etc. for frontend calculations
export const USD_SCALE = 8;
export const DOMINANCE_SCALE_FACTOR = BigInt(10_000_000_000); 