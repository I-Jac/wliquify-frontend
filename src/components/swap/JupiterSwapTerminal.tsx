'use client';

import React, { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSolanaNetwork } from '@/contexts/SolanaNetworkContext';
// Types will be picked up from src/types/jupiter-terminal.d.ts for window.Jupiter

// Import CSS for Jupiter Terminal - REMOVED as it's handled by global script
// import "@jup-ag/terminal/css";

const JUPITER_INTEGRATED_TARGET_ID = 'integrated-terminal';

interface JupiterSwapTerminalProps {
    className?: string;
}

export const JupiterSwapTerminal: React.FC<JupiterSwapTerminalProps> = ({ className }) => {
    const walletHookValues = useWallet(); // Use the full hook values
    const { endpoint: rpcEndpoint } = useSolanaNetwork(); // networkConfiguration removed
    const platformFeeAndAccounts = undefined; // Placeholder

    const terminalRef = useRef<HTMLDivElement>(null);
    const initAttempted = useRef(false);

    // Effect for initializing Jupiter Terminal
    useEffect(() => {
        if (typeof window === 'undefined' || !window.Jupiter || !rpcEndpoint || initAttempted.current) {
            return;
        }

        // Check if the target div exists
        if (!document.getElementById(JUPITER_INTEGRATED_TARGET_ID)) {
            console.error(`Jupiter Terminal target div with id '${JUPITER_INTEGRATED_TARGET_ID}' not found.`);
            return;
        }
        
        initAttempted.current = true; // Mark that we are attempting init
        console.log(`Attempting to initialize Jupiter Terminal. Endpoint: ${rpcEndpoint}, Target ID: ${JUPITER_INTEGRATED_TARGET_ID}`);

        window.Jupiter.init({
            displayMode: 'integrated',
            integratedTargetId: JUPITER_INTEGRATED_TARGET_ID,
            endpoint: rpcEndpoint,
            strictTokenList: true, // V3, but generally good. V4 Ultra defaults to strict.
            enableWalletPassthrough: true,
            theme: 'dark', // Added dark theme
            // Initial passthrough state can be set here if wallet is already connected
            // but syncProps will handle subsequent updates.
            passthroughWalletContextState: walletHookValues.connected ? walletHookValues : undefined,
            platformFeeAndAccounts,
            onSuccess: ({ txid, swapResult }) => {
                console.log('Swap successful!', { txid, swapResult });
                // TODO: Add success notification (e.g., using AlertContext)
            },
            onSwapError: ({ error, code }) => {
                console.error('Swap error:', { error, code });
                // TODO: Add error notification
            },
            // Adjust default explorer if needed
            // defaultExplorer: 'Solscan',
        }).then(() => {
            console.log("Jupiter Terminal initialized successfully.");
            // After init, immediately sync props if wallet is already connected
            if (window.Jupiter && typeof window.Jupiter.syncProps === 'function' && walletHookValues.connected) {
                window.Jupiter.syncProps({ passthroughWalletContextState: walletHookValues });
            }
        }).catch(initError => {
            console.error("Error initializing Jupiter Terminal:", initError);
            initAttempted.current = false; // Allow re-attempt if init fails
        });

    }, [rpcEndpoint, walletHookValues, platformFeeAndAccounts]); // platformFeeAndAccounts added

    // Effect for syncing wallet state with Jupiter Terminal after initialization
    useEffect(() => {
        if (typeof window !== 'undefined' && window.Jupiter && typeof window.Jupiter.syncProps === 'function') {
            // This effect will run when walletHookValues changes (e.g., connect/disconnect, account change)
            // and Jupiter is already initialized (initAttempted.current should be true from a successful init, 
            // or init itself will call syncProps once).
            console.log("Syncing wallet props with Jupiter Terminal:", walletHookValues.connected);
            window.Jupiter.syncProps({ passthroughWalletContextState: walletHookValues });
        }
    }, [walletHookValues]); // Dependency on the whole wallet context state from useWallet()

    return (
        <div 
            ref={terminalRef} // Added ref
            id={JUPITER_INTEGRATED_TARGET_ID} 
            className={`relative z-10 ${className || ''}`} // Combined className
            style={{
                width: '100%', 
                maxWidth: '420px', // Jupiter's preferred max-width for the terminal content
                borderRadius: '12px',
                // backgroundColor: 'transparent', // Or a theme color from Jupiter if available
            }}
        />
    );
};

JupiterSwapTerminal.displayName = 'JupiterSwapTerminal'; 