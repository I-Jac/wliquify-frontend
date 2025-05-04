import { Program, AnchorProvider, setProvider } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useMemo, useState, useEffect } from 'react';
import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool'; 
import idl from '@/programTarget/idl/w_liquify_pool.json'; // Import the IDL JSON
import { PublicKey } from '@solana/web3.js';
import { Connection } from '@solana/web3.js';
import { RPC_URL } from '@/utils/constants'; // Import RPC_URL

/**
 * Custom hook to provide initialized Anchor program and provider instances.
 */
export function useAnchorProgram() {
    const { connection } = useConnection();
    const wallet = useWallet(); // Use useWallet to get context state
    const anchorWallet = useAnchorWallet(); // Use useAnchorWallet for provider if connected
    const [provider, setProviderState] = useState<AnchorProvider | null>(null);


    useEffect(() => {
        if (anchorWallet) {
            const newProvider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' });
            setProviderState(newProvider);
            setProvider(newProvider); // Set globally for anchor commands if needed
        } else {
            setProviderState(null);
        }
    }, [anchorWallet, connection]);

    // Create a read-only provider when the wallet is not connected
    const readOnlyProvider = useMemo(() => {
        // Correct the condition: create provider if wallet is NOT connected
        if (!wallet.connected) { 
            // Use a stable connection object
            const currentConnection = new Connection(RPC_URL, 'confirmed'); // Use imported constant

            // Create a minimal wallet-like object for AnchorProvider read-only mode
            const readOnlyWallet = {
                publicKey: wallet.publicKey || PublicKey.default, // Fallback to default PK
                // Correct signer stubs: no params needed if they just throw
                signTransaction: async () => { throw new Error("Read-only wallet cannot sign."); },
                signAllTransactions: async () => { throw new Error("Read-only wallet cannot sign."); },
            };

            // Provider expects a Wallet interface, but works with this minimal object for read-only
            return new AnchorProvider(currentConnection, readOnlyWallet, { commitment: 'confirmed' });
        }
        // If wallet *is* connected, return null (the standard provider will be used)
        return null; 

    }, [wallet.connected, wallet.publicKey]); // Remove rpcUrl from dependencies

    const program = useMemo(() => {
        // Prefer the connected provider if available, otherwise use read-only
        const currentProvider = provider || readOnlyProvider;
        if (!currentProvider) return null;
        
        return new Program<WLiquifyPool>(idl as WLiquifyPool, currentProvider);

    // Remove wallet dependency as suggested by linter
    }, [provider, readOnlyProvider]); 

    return { program, provider, readOnlyProvider };
} 