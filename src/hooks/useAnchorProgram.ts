import React, { useMemo, useState, useEffect, useRef, createContext, useContext } from 'react';
import { Program, AnchorProvider, setProvider } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
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
    const wallet = useWallet();
    const anchorWallet = useAnchorWallet();
    const [provider, setProviderState] = useState<AnchorProvider | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const initialized = useRef(false);

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
            console.warn('useAnchorProgram: No connection available');
            return;
        }

        // Skip if already initialized
        if (initialized.current) {
            return;
        }

        if (anchorWallet) {
            try {
                const newProvider = new AnchorProvider(connection, anchorWallet, { commitment: COMMITMENT });
                setProviderState(newProvider);
                setProvider(newProvider); // Set globally for anchor commands if needed
                initialized.current = true;
                setIsInitialized(true);
            } catch (error) {
                console.error('Failed to initialize Anchor provider:', error);
                setProviderState(null);
                setIsInitialized(false);
            }
        } else {
            setProviderState(null);
            setIsInitialized(false);
        }

        // Cleanup function
        return () => {
            initialized.current = false;
        };
    }, [anchorWallet, connection]);

    // Create a read-only provider when the wallet is not connected
    const readOnlyProvider = useMemo(() => {
        if (!wallet.connected && readOnlyConnection) {
            try {
                return new AnchorProvider(readOnlyConnection, readOnlyWallet, { commitment: COMMITMENT });
            } catch (error) {
                console.error('Failed to initialize read-only provider:', error);
                return null;
            }
        }
        return null;
    }, [wallet.connected, readOnlyConnection, readOnlyWallet]);

    // Initialize program
    const program = useMemo(() => {
        const currentProvider = provider || readOnlyProvider;
        if (!currentProvider) {
            return null;
        }

        try {
            return new Program<WLiquifyPool>(idl as WLiquifyPool, currentProvider);
        } catch (error) {
            console.error('Failed to initialize program:', error);
            return null;
        }
    }, [provider, readOnlyProvider]);

    const value = useMemo(() => ({
        program,
        provider,
        readOnlyProvider,
        isInitialized
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