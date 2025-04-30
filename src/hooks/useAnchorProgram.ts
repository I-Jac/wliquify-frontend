import { useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { WLiquifyPool } from '@/types/w_liquify_pool';
import idl from '@/idl/w_liquify_pool.json'; // Import the IDL JSON
import { W_LIQUIFY_POOL_PROGRAM_ID } from '@/utils/constants';

/**
 * Custom hook to get an Anchor provider and program instance.
 * Ensures the provider and program are updated when connection or wallet changes.
 */
export const useAnchorProgram = () => {
    const { connection } = useConnection();
    const wallet = useWallet(); // Get the full wallet object

    // Create the Anchor provider
    const provider = useMemo(() => {
        // Wallet must be connected to create a provider that can sign transactions
        if (!wallet || !wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
            // Return a read-only provider if wallet is not fully functional
            console.log("Wallet not connected or doesn't support signing, creating read-only provider.");
            return new AnchorProvider(connection, {publicKey: wallet?.publicKey ?? undefined} as any, { commitment: 'confirmed' });
            // return null; // Alternatively, return null if a signing provider is strictly required
        }

        // The wallet object from useWallet conforms to AnchorWallet
        return new AnchorProvider(connection, wallet as any, {
            commitment: 'confirmed',
            preflightCommitment: 'confirmed',
        });
    }, [connection, wallet]);

    // Create the program instance
    const program = useMemo(() => {
        // Don't create program instance if provider is null (if you choose to return null above)
        // if (!provider) return null;

        // Assert IDL type
        return new Program<WLiquifyPool>(idl as any, provider);

    }, [provider]); // Re-create program instance only when provider changes

    return { provider, program };
}; 