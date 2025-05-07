import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer'; // Ensure Buffer is available
import { BN } from '@coral-xyz/anchor'; // Import BN for BN constants

// Network Configuration
//export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8900";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

// Program IDs
export const W_LIQUIFY_POOL_PROGRAM_ID = new PublicKey(
    process.env.NEXT_PUBLIC_POOL_PROGRAM_ID || "EsKuTFP341vcfKidSAxgKZy91ZVmKqFxRw3CbM6bnfA9"
);
export const ORACLE_PROGRAM_ID = new PublicKey(
    process.env.NEXT_PUBLIC_ORACLE_PROGRAM_ID || "3ZfM451hf9LUizdUL14N1R9fwmsPS8M8ZCGai2nm6SVY"
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
export const USD_SCALE = 6;
export const DOMINANCE_SCALE_FACTOR = BigInt(10_000_000_000);
export const BASE_FEE_BPS = 10; // 0.1% Base Fee (Added)

// Calculation Constants (Moved from calculations.ts)
export const PRICE_SCALE_FACTOR = new BN(10).pow(new BN(10)); // 10^10 used for scaling prices

// Constant for percentage scaling (Scaled by 1,000,000: 1% = 10,000 scaled units)
export const PERCENTAGE_CALC_SCALE = 1000000;
export const BN_PERCENTAGE_CALC_SCALE = new BN(PERCENTAGE_CALC_SCALE);

// BPS Scale
export const BPS_SCALE = 10000;
export const BN_BPS_SCALE = new BN(BPS_SCALE);

// Fee Calculation Constants
export const BN_BASE_FEE_BPS = new BN(10); // 0.1%
export const BN_FEE_K_FACTOR_NUMERATOR = new BN(2); // k = 0.2
export const BN_FEE_K_FACTOR_DENOMINATOR = new BN(10);
export const BN_DEPOSIT_PREMIUM_CAP_BPS = new BN(-500); // Max dynamic *discount* is 500 BPS
export const BN_WITHDRAW_FEE_FLOOR_BPS = new BN(0);     // Min total fee is 0 BPS
export const BN_DEPOSIT_MAX_FEE_BPS = new BN(9999); // Max total deposit fee is 99.99%
export const BN_WITHDRAW_MAX_FEE_BPS = new BN(9999); // Max total withdraw fee is 99.99%

// Dominance Scale (BN version)
export const BN_DOMINANCE_SCALE = new BN(DOMINANCE_SCALE_FACTOR); // Use existing DOMINANCE_SCALE_FACTOR

// Precision Scale for Division
export const PRECISION_SCALE_FACTOR = new BN(10).pow(new BN(12)); // 1e12

// UI Defaults
export const DEFAULT_ICON = '/tokens/default.png';