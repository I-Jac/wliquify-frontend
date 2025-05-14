import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer'; // Ensure Buffer is available
import { BN } from '@coral-xyz/anchor'; // Import BN for BN constants
import type { RpcOption } from './types'; // Added import for RpcOption

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

// Frontend Calculation Constants
export const USD_SCALE = 6;
export const DOMINANCE_SCALE_FACTOR = BigInt(10_000_000_000);
export const PRICE_SCALE_FACTOR = new BN(10).pow(new BN(10)); // 10^10 used for scaling prices
export const PERCENTAGE_CALC_SCALE = 1000000; // Scaled by 1,000,000: 1% = 10,000 scaled units
export const BN_PERCENTAGE_CALC_SCALE = new BN(PERCENTAGE_CALC_SCALE);
export const BPS_SCALE = 10000; // For converting BPS to decimal percentage
export const BN_BPS_SCALE = new BN(BPS_SCALE);
export const PRECISION_SCALE_FACTOR = new BN(10).pow(new BN(12)); // 1e12 for high precision

// Fee Calculation Constants
export const BASE_FEE_BPS = 10; // 0.1%
export const BN_BASE_FEE_BPS = new BN(BASE_FEE_BPS);
export const FEE_K_FACTOR_NUMERATOR = 2; // k = 0.2
export const BN_FEE_K_FACTOR_NUMERATOR = new BN(FEE_K_FACTOR_NUMERATOR);
export const FEE_K_FACTOR_DENOMINATOR = 10;
export const BN_FEE_K_FACTOR_DENOMINATOR = new BN(FEE_K_FACTOR_DENOMINATOR);
export const DEPOSIT_PREMIUM_CAP_BPS = -500; // Max dynamic *discount* is 500 BPS
export const BN_DEPOSIT_PREMIUM_CAP_BPS = new BN(DEPOSIT_PREMIUM_CAP_BPS);
export const DELISTED_WITHDRAW_BONUS_BPS = -500; // 500 BPS bonus for delisted token withdraws
export const BN_DELISTED_WITHDRAW_BONUS_BPS = new BN(DELISTED_WITHDRAW_BONUS_BPS);
export const WITHDRAW_FEE_FLOOR_BPS = 0;     // Min total fee is 0 BPS
export const BN_WITHDRAW_FEE_FLOOR_BPS = new BN(WITHDRAW_FEE_FLOOR_BPS);
export const DEPOSIT_MAX_FEE_BPS = 9999; // Max total deposit fee is 99.99%
export const BN_DEPOSIT_MAX_FEE_BPS = new BN(DEPOSIT_MAX_FEE_BPS);
export const WITHDRAW_MAX_FEE_BPS = 9999; // Max total withdraw fee is 99.99%
export const BN_WITHDRAW_MAX_FEE_BPS = new BN(WITHDRAW_MAX_FEE_BPS);

// Dominance Scale (BN version) - Based on DOMINANCE_SCALE_FACTOR
export const BN_DOMINANCE_SCALE = new BN(DOMINANCE_SCALE_FACTOR.toString()); // Use existing DOMINANCE_SCALE_FACTOR

// UI Defaults
export const DEFAULT_ICON = '/tokens/default.png';

// Button Colors (Moved from TokenTable.tsx)
export const BTN_GREEN = 'bg-green-600 hover:bg-green-700';
export const BTN_RED = 'bg-red-600 hover:bg-red-700';
export const BTN_GRAY = 'bg-gray-500 hover:bg-gray-600';
export const BTN_DELISTED_WITHDRAW = 'bg-green-700 hover:bg-green-800'; // Darker green for delisted full withdraw

// Rate limiting constants
export const RATE_LIMIT_DELAY = 40; // Base delay in ms
export const MAX_RETRIES = 2; // Maximum number of retries
export const MAX_DELAY = 1000; // Maximum delay in ms
export const MAX_CONCURRENT_REQUESTS = 8; // Reduced from 10 to 8 to reduce rate limit hits

// Transaction constants
export const MIN_SOL_BALANCE_LAMPORTS = 100000; // 0.0001 SOL - minimum balance for transaction fees

// Compute budget constants
export const TRANSACTION_COMPUTE_UNITS = 550000; // Increased from 500000

// Settings Defaults
export const SETTINGS_DEFAULT_SLIPPAGE_BPS = 50; // 0.5%
export const SETTINGS_DEFAULT_FEE_LEVEL = 'Normal'; // Matches FeeLevel type
export const SETTINGS_DEFAULT_MAX_PRIORITY_FEE_CAP_SOL = 0.001; // Max priority fee cap in SOL
export const SETTINGS_DEFAULT_DYNAMIC_FEES = {
    Normal: 1000,    // Example low fee
    Fast: 10000,   // Example medium fee
    Turbo: 50000   // Example high fee
};

export const MIN_TARGET_DOMINANCE_TO_RANK = 0.0005; // Minimum targetDominance for a token to be ranked

// Helius API Key
// TODO: Move to environment variable for production!
export const HELIUS_API_KEY = '719a9a14-11e6-4629-901b-53d3a209941e';

// Explorer Configuration
export const EXPLORER_CLUSTER = 'devnet'; // Change to 'testnet' or 'mainnet-beta' as needed
// const SOLANA_FM_DEVNET_CLUSTER_NAME = 'devnet-solana'; // No longer needed

// LocalStorage Keys
export const LOCAL_STORAGE_KEY_FEE_LEVEL = 'feeLevel';
export const LOCAL_STORAGE_KEY_MAX_PRIORITY_FEE_CAP_SOL = 'maxPriorityFeeCapSol';
export const LOCAL_STORAGE_KEY_SLIPPAGE_BPS = 'slippageBps';
export const LOCAL_STORAGE_KEY_RPC_ENDPOINT = 'rpcEndpoint';

// Profile Settings LocalStorage Keys
export const LOCAL_STORAGE_KEY_PREFERRED_LANGUAGE = 'preferredLanguage';
export const LOCAL_STORAGE_KEY_PREFERRED_CURRENCY = 'preferredCurrency';
export const LOCAL_STORAGE_KEY_NUMBER_FORMAT = 'numberFormat';
export const LOCAL_STORAGE_KEY_PREFERRED_EXPLORER = 'preferredExplorer';

// Predefined settings options (moved from SettingsModal.tsx)
export const PREDEFINED_SLIPPAGE_OPTIONS = [
    { label: '0.1%', bps: 10, value: '0.10' },
    { label: '0.5%', bps: 50, value: '0.50' },
    { label: '1%', bps: 100, value: '1.00' },
];

export const PREDEFINED_RPCS: RpcOption[] = [
    { name: 'Solana Devnet', url: 'https://api.devnet.solana.com' },
    // { name: 'dRPC Devnet', url: 'https://solana.drpc.org' }, // Commented out for now
];

// Faucet URLs (moved from Header.tsx)
export const FAUCET_URL_TOKEN = 'https://i-jac.github.io/faucet-frontend/';
export const FAUCET_URL_SOL_1 = 'https://solfaucet.com/';
export const FAUCET_URL_SOL_2 = 'https://solfate.com/faucet';

// Default Profile Settings
export const DEFAULT_PREFERRED_LANGUAGE = 'en';
export const DEFAULT_PREFERRED_CURRENCY = 'USD';
export const DEFAULT_NUMBER_FORMAT: { decimalSeparator: '.' | ','; thousandSeparator: ',' | '.' | ' ' | ''; } = {
    decimalSeparator: '.',
    thousandSeparator: ',',
};
export const DEFAULT_PREFERRED_EXPLORER = 'Solscan'; // Name matches a key in DEFAULT_EXPLORER_OPTIONS

export const DEFAULT_EXPLORER_OPTIONS: Record<string, { name: string; urlTemplate: string; addressUrlTemplate?: string; tokenUrlTemplate?: string; getClusterQueryParam: (clusterConst: string) => string; }> = {
    Solscan: {
        name: 'Solscan',
        urlTemplate: 'https://solscan.io/tx/{txId}?cluster={cluster}',
        addressUrlTemplate: 'https://solscan.io/account/{address}?cluster={cluster}',
        tokenUrlTemplate: 'https://solscan.io/token/{token_address}?cluster={cluster}',
        getClusterQueryParam: (clusterConst) => clusterConst, // Standard cluster name
    },
    SolanaFM: {
        name: 'SolanaFM',
        urlTemplate: 'https://solana.fm/tx/{txId}?cluster={cluster}',
        addressUrlTemplate: 'https://solana.fm/address/{address}?cluster={cluster}',
        tokenUrlTemplate: 'https://solana.fm/address/{token_address}?cluster={cluster}',
        getClusterQueryParam: (clusterConst) => {
            if (clusterConst === 'devnet') {
                return 'devnet-solana';
            } else if (clusterConst === 'testnet') {
                return 'testnet-solana';
            } else if (clusterConst === 'mainnet-beta') {
                return 'mainnet-alpha';
            }
            return clusterConst; // Fallback for any other unhandled cluster string
        },
    },
    'Solana Explorer': { // Key with space
        name: 'Solana Explorer',
        urlTemplate: 'https://explorer.solana.com/tx/{txId}?cluster={cluster}',
        addressUrlTemplate: 'https://explorer.solana.com/address/{address}?cluster={cluster}',
        tokenUrlTemplate: 'https://explorer.solana.com/address/{token_address}?cluster={cluster}', // Explorer also uses 'address' for tokens
        getClusterQueryParam: (clusterConst) => clusterConst, // Standard cluster name
    },
    // Add XRAY if desired
    // XRAY: {
    //     name: 'XRAY',
    //     urlTemplate: 'https://xray.helius.xyz/tx/{txId}?network={network_for_xray}', // network_for_xray needs to be 'devnet' or 'mainnet-beta'
    //     addressUrlTemplate: 'https://xray.helius.xyz/account/{address}?network={network_for_xray}',
    //     tokenUrlTemplate: 'https://xray.helius.xyz/token/{token_address}?network={network_for_xray}',
    //     getClusterQueryParam: (clusterConst) => clusterConst === 'devnet' ? 'devnet' : 'mainnet-beta', // XRAY uses 'network' param with different values
    // },
};