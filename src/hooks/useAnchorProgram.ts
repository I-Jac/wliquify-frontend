import { Program, AnchorProvider, setProvider } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useMemo, useState, useEffect } from 'react';
import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool'; 
import idl from '@/programTarget/idl/w_liquify_pool.json'; // Import the IDL JSON
import { PublicKey, Connection } from '@solana/web3.js';
import { RPC_URL } from '@/utils/constants'; // Import RPC_URL

// Define commitment level as a constant
const COMMITMENT = 'confirmed' as const;

// Define a minimal wallet interface for read-only operations
interface ReadOnlyWallet {
    publicKey: PublicKey;
    signTransaction: () => Promise<never>;
    signAllTransactions: () => Promise<never>;
}

/**
 * Custom hook to provide initialized Anchor program and provider instances.
 * This hook manages both connected and read-only providers for interacting with the Solana program.
 * 
 * @returns {Object} Object containing program and provider instances
 * @property {Program<WLiquifyPool> | null} program - The initialized Anchor program
 * @property {AnchorProvider | null} provider - The connected wallet provider
 * @property {AnchorProvider | null} readOnlyProvider - The read-only provider for when wallet is not connected
 */
export function useAnchorProgram() {
    const { connection } = useConnection();
    const wallet = useWallet(); // Use useWallet to get context state
    const anchorWallet = useAnchorWallet(); // Use useAnchorWallet for provider if connected
    const [provider, setProviderState] = useState<AnchorProvider | null>(null);

    // Memoize the read-only wallet to prevent unnecessary recreations
    const readOnlyWallet = useMemo<ReadOnlyWallet>(() => ({
        publicKey: wallet.publicKey || PublicKey.default,
        signTransaction: async () => { throw new Error("Read-only wallet cannot sign."); },
        signAllTransactions: async () => { throw new Error("Read-only wallet cannot sign."); },
    }), [wallet.publicKey]);

    // Memoize the read-only connection to prevent unnecessary recreations
    const readOnlyConnection = useMemo(() => 
        new Connection(RPC_URL, COMMITMENT),
    []);

    useEffect(() => {
        if (anchorWallet) {
            try {
                const newProvider = new AnchorProvider(connection, anchorWallet, { commitment: COMMITMENT });
                setProviderState(newProvider);
                setProvider(newProvider); // Set globally for anchor commands if needed
                console.log('Anchor provider initialized successfully');
            } catch (error) {
                console.error('Failed to initialize Anchor provider:', error);
                setProviderState(null);
            }
        } else {
            setProviderState(null);
        }
    }, [anchorWallet, connection]);

    // Create a read-only provider when the wallet is not connected
    const readOnlyProvider = useMemo(() => {
        if (!wallet.connected) {
            try {
                return new AnchorProvider(readOnlyConnection, readOnlyWallet, { commitment: COMMITMENT });
            } catch (error) {
                console.error('Failed to initialize read-only provider:', error);
                return null;
            }
        }
        return null;
    }, [wallet.connected, readOnlyConnection, readOnlyWallet]);

    const program = useMemo(() => {
        const currentProvider = provider || readOnlyProvider;
        if (!currentProvider) {
            console.log('No provider available for program initialization');
            return null;
        }
        
        try {
            return new Program<WLiquifyPool>(idl as WLiquifyPool, currentProvider);
        } catch (error) {
            console.error('Failed to initialize program:', error);
            return null;
        }
    }, [provider, readOnlyProvider]);

    return { program, provider, readOnlyProvider };
} 