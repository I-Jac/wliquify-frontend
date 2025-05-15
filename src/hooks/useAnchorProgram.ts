import React, { useMemo, useState, useEffect, createContext, useContext } from 'react';
import { Program, AnchorProvider, setProvider } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool'; 
import idl from '@/programTarget/idl/w_liquify_pool.json'; // Import the IDL JSON
import { PublicKey, Connection } from '@solana/web3.js';
import { RPC_URL } from '@/utils/core/constants'; // Import RPC_URL

// Define commitment level as a constant
const COMMITMENT = 'confirmed' as const;

// Define a minimal wallet interface for read-only operations
interface ReadOnlyWallet {
    publicKey: PublicKey;
    signTransaction: () => Promise<never>;
    signAllTransactions: () => Promise<never>;
}

interface AnchorProgramContextType {
    program: Program<WLiquifyPool> | null;
    provider: AnchorProvider | null;
    readOnlyProvider: AnchorProvider | null;
    isInitialized: boolean;
}

const AnchorProgramContext = createContext<AnchorProgramContextType | undefined>(undefined);

interface AnchorProgramProviderProps {
    children: React.ReactNode;
}

export function AnchorProgramProvider({ children }: AnchorProgramProviderProps) {
    const { connection } = useConnection();
    const anchorWallet = useAnchorWallet();
    const [provider, setProviderState] = useState<AnchorProvider | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    // Memoize the read-only wallet to prevent unnecessary recreations
    const readOnlyWallet = useMemo<ReadOnlyWallet>(() => ({
        publicKey: new PublicKey('11111111111111111111111111111111'), // Default public key
        signTransaction: async () => { throw new Error("Read-only wallet cannot sign."); },
        signAllTransactions: async () => { throw new Error("Read-only wallet cannot sign."); },
    }), []);

    // Memoize the read-only connection to prevent unnecessary recreations
    const readOnlyConnection = useMemo(() => 
        new Connection(RPC_URL, COMMITMENT),
    []);

    // Handle provider initialization
    useEffect(() => {
        if (!connection) {
            console.warn('useAnchorProgram: No connection available for provider setup.');
            setProviderState(null); // Ensure provider is null if no connection
            setIsInitialized(false);
            return;
        }

        if (anchorWallet) {
            try {
                const newProvider = new AnchorProvider(connection, anchorWallet, { commitment: COMMITMENT });
                setProviderState(newProvider);
                setProvider(newProvider); // Set globally for anchor commands if needed
                setIsInitialized(true);
                console.log('useAnchorProgram: Anchor provider initialized with wallet.');
            } catch (error) {
                console.error('Failed to initialize Anchor provider:', error);
                setProviderState(null);
                setIsInitialized(false);
            }
        } else {
            // No anchorWallet means no authenticated provider
            console.log('useAnchorProgram: No anchor wallet available, clearing main provider.');
            setProviderState(null);
            // isInitialized reflects if an authenticated provider is set. 
            // If only readOnlyProvider is available later, the hook consumer can check program !== null
            setIsInitialized(false); 
        }
        // No cleanup needed that resets a flag like initialized.current
    }, [anchorWallet, connection]);

    // Create a read-only provider when the wallet is not connected
    const readOnlyProvider = useMemo(() => {
        if (!connection) { // Also check connection here
            console.warn('useAnchorProgram: No connection for read-only provider.');
            return null;
        }
        // Always attempt to create a read-only provider if connection exists,
        // regardless of wallet.connected state for this specific provider.
        try {
            console.log('useAnchorProgram: Attempting to create read-only provider.');
            return new AnchorProvider(readOnlyConnection, readOnlyWallet, { commitment: COMMITMENT });
        } catch (error) {
            console.error('Failed to initialize read-only provider:', error);
            return null;
        }
    }, [readOnlyConnection, readOnlyWallet, connection]); // Added connection to deps

    // Initialize program
    const program = useMemo(() => {
        const currentProvider = provider || readOnlyProvider; // Prioritize authenticated provider
        if (currentProvider) {
            console.log(`useAnchorProgram: Program attempting to initialize with ${provider ? 'main provider' : 'read-only provider'}.`);
            try {
                const newProgram = new Program<WLiquifyPool>(idl as WLiquifyPool, currentProvider);
                console.log('useAnchorProgram: Program initialized successfully.');
                return newProgram;
            } catch (error) {
                console.error('Failed to initialize program:', error);
                return null;
            }
        } else {
            console.log('useAnchorProgram: No provider available for program initialization.');
            return null;
        }
    }, [provider, readOnlyProvider]);

    const value = useMemo(() => ({
        program,
        provider,
        readOnlyProvider,
        isInitialized // This reflects if the *authenticated* provider is initialized
    }), [program, provider, readOnlyProvider, isInitialized]);

    return React.createElement(AnchorProgramContext.Provider, { value }, children);
}

export function useAnchorProgram() {
    const context = useContext(AnchorProgramContext);
    if (context === undefined) {
        throw new Error('useAnchorProgram must be used within an AnchorProgramProvider');
    }
    return context;
} 