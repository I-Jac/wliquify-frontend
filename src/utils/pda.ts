import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { POOL_AUTHORITY_SEED, TOKEN_HISTORY_SEED, POOL_CONFIG_SEED } from './constants'; // Assuming constants are defined here

// IMPORTANT: Replace with your actual program ID
const PROGRAM_ID = new PublicKey('H9Y1ERhaAzDhKjYuMsbqQ1d3L6Mt7g244U2jfkEXy48Q'); // Placeholder - GET FROM YOUR IDL or ENV

/**
 * Finds the Pool Config PDA.
 */
export const findPoolConfigPDA = (programId: PublicKey = PROGRAM_ID): PublicKey => {
    const [pda] = PublicKey.findProgramAddressSync(
        [POOL_CONFIG_SEED],
        programId
    );
    return pda;
};

/**
 * Finds the Pool Authority PDA.
 */
export const findPoolAuthorityPDA = (): PublicKey => {
    const [pda] = PublicKey.findProgramAddressSync(
        [POOL_AUTHORITY_SEED],
        PROGRAM_ID
    );
    return pda;
};

/**
 * Finds the Pool Vault PDA for a specific token mint.
 * This corresponds to the Associated Token Account (ATA) owned by the Pool Authority.
 */
export const findPoolVaultPDA = (poolAuthority: PublicKey, tokenMint: PublicKey): PublicKey => {
    const [pda] = PublicKey.findProgramAddressSync(
        [
            poolAuthority.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            tokenMint.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID // ATAs are derived using the Associated Token Program ID
    );
    return pda;
    // Note: The IDL showed a different derivation for add_supported_token vault using specific constants.
    // Verify if the deposit/withdraw instructions expect the standard ATA owned by the pool authority
    // or a vault derived differently. Standard ATA is more common.
};

/**
 * Finds the Token History PDA for a specific token mint.
 */
export const findTokenHistoryPDA = (tokenMint: PublicKey): PublicKey => {
    const [pda] = PublicKey.findProgramAddressSync(
        [TOKEN_HISTORY_SEED, tokenMint.toBuffer()],
        PROGRAM_ID
    );
    return pda;
};

/**
 * Finds the Historical Token Data PDA for a specific token mint.
 */
export const findHistoricalTokenDataPDA = (tokenMint: PublicKey, programId: PublicKey): PublicKey => {
    const [pda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("token_history"),
            tokenMint.toBuffer(),
        ],
        programId
    );
    return pda;
};

/**
 * Finds the wLQI Token Mint PDA. (Optional - if needed)
 */
// export const findWliMintPDA = (): PublicKey => {
//     const [pda] = PublicKey.findProgramAddressSync(
//         [WLI_MINT_SEED],
//         PROGRAM_ID
//     );
//     return pda;
// };

/**
 * Finds the wLQI Pool Vault PDA. (Optional - if needed)
 * This vault holds the wLQI tokens owned by the pool authority.
 */
// export const findWliVaultPDA = (poolAuthority: PublicKey, wliMint: PublicKey): PublicKey => {
//     const [pda] = PublicKey.findProgramAddressSync(
//         [
//             poolAuthority.toBuffer(),
//             TOKEN_PROGRAM_ID.toBuffer(),
//             wliMint.toBuffer(),
//         ],
//         ASSOCIATED_TOKEN_PROGRAM_ID
//     );
//     return pda;
// };

// Add other PDA derivations as needed, e.g., for PoolConfig itself if it's a PDA 