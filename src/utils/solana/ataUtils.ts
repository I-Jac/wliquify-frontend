import {
    Connection,
    PublicKey,
    TransactionInstruction
} from '@solana/web3.js';
import {
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddressSync
} from '@solana/spl-token';

export const createAtaIfNeeded = async (
    connection: Connection,
    publicKey: PublicKey,
    mint: PublicKey,
    preInstructions: TransactionInstruction[]
): Promise<void> => {
    const ata = getAssociatedTokenAddressSync(mint, publicKey);
    try {
        const accountInfo = await connection.getAccountInfo(ata);
        if (accountInfo === null) { // Explicitly check for null, as getAccountInfo can return null for non-existent accounts
            console.log("ATA not found, creating:", ata.toBase58());
            preInstructions.push(
                createAssociatedTokenAccountInstruction(
                    publicKey,           // Payer
                    ata,                 // ATA address
                    publicKey,           // Owner of the ATA
                    mint                 // Mint
                )
            );
        }
    } catch (e) {
         // Catching errors if getAccountInfo fails for reasons other than non-existence (though typically it returns null)
        console.log("Error checking ATA, assuming it doesn\'t exist and creating:", ata.toBase58(), e);
        preInstructions.push(
            createAssociatedTokenAccountInstruction(
                publicKey,
                ata,
                publicKey,
                mint
            )
        );
    }
}; 