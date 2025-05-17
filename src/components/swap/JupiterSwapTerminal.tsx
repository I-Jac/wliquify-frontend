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
        console.log("[Jupiter Debug] Init Effect: Start");
        if (typeof window === 'undefined') {
            console.log("[Jupiter Debug] Init Effect: window is undefined, returning.");
            return;
        }
        if (!window.Jupiter) {
            console.log("[Jupiter Debug] Init Effect: window.Jupiter is not available, returning.");
            return;
        }
        if (!rpcEndpoint) {
            console.log("[Jupiter Debug] Init Effect: rpcEndpoint is not available, returning.", rpcEndpoint);
            return;
        }
        if (initAttempted.current) {
            console.log("[Jupiter Debug] Init Effect: init already attempted, returning.");
            return;
        }

        console.log("[Jupiter Debug] Init Effect: Pre-conditions met. RPC Endpoint:", rpcEndpoint);
        console.log("[Jupiter Debug] Init Effect: Wallet connected state for initial passthrough:", walletHookValues.connected);
        console.log("[Jupiter Debug] Init Effect: Selected walletHookValues for initial passthrough:", {
            connected: walletHookValues.connected,
            publicKey: walletHookValues.publicKey?.toBase58(),
            wallet: walletHookValues.wallet?.adapter.name,
            signTransaction_exists: !!walletHookValues.signTransaction,
            signAllTransactions_exists: !!walletHookValues.signAllTransactions,
            signMessage_exists: !!walletHookValues.signMessage
        });


        // Check if the target div exists
        if (!document.getElementById(JUPITER_INTEGRATED_TARGET_ID)) {
            console.error(`[Jupiter Debug] Jupiter Terminal target div with id '${JUPITER_INTEGRATED_TARGET_ID}' not found.`);
            return;
        }
        
        initAttempted.current = true; // Mark that we are attempting init
        console.log(`[Jupiter Debug] Attempting to initialize Jupiter Terminal. Endpoint: ${rpcEndpoint}, Target ID: ${JUPITER_INTEGRATED_TARGET_ID}`);
        console.log("[Jupiter Debug] Initial passthroughWalletContextState:", walletHookValues.connected ? walletHookValues : undefined);


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
                console.log('[Jupiter Debug] Swap successful!', { txid, swapResult });
                // TODO: Add success notification (e.g., using AlertContext)
            },
            onSwapError: ({ error, code }) => {
                console.error('[Jupiter Debug] Swap error:', { error, code });
                // TODO: Add error notification
            },
            // Adjust default explorer if needed
            // defaultExplorer: 'Solscan',
        }).then(() => {
            console.log("[Jupiter Debug] Jupiter Terminal initialized successfully (init.then).");
            // After init, immediately sync props if wallet is already connected
            if (window.Jupiter && typeof window.Jupiter.syncProps === 'function' && walletHookValues.connected) {
                console.log("[Jupiter Debug] Init Effect: Wallet connected, calling syncProps immediately after init.then. Selected WalletHookValues:", {
                    connected: walletHookValues.connected,
                    publicKey: walletHookValues.publicKey?.toBase58(),
                    wallet: walletHookValues.wallet?.adapter.name
                });
                window.Jupiter.syncProps({ passthroughWalletContextState: walletHookValues });
            } else {
                console.log("[Jupiter Debug] Init Effect: Post-init.then - syncProps not called. Jupiter syncProps available?", !!(window.Jupiter && typeof window.Jupiter.syncProps === 'function'), "Wallet connected?", walletHookValues.connected);
            }
        }).catch(initError => {
            console.error("[Jupiter Debug] Error initializing Jupiter Terminal (init.catch):", initError);
            initAttempted.current = false; // Allow re-attempt if init fails
        });
        console.log("[Jupiter Debug] Init Effect: End (after calling init)");

    }, [rpcEndpoint, walletHookValues, platformFeeAndAccounts]); // platformFeeAndAccounts added

    // Effect for syncing wallet state with Jupiter Terminal after initialization
    useEffect(() => {
        console.log("[Jupiter Debug] SyncProps Effect: Start. Wallet connected:", walletHookValues.connected);
        console.log("[Jupiter Debug] SyncProps Effect: Selected walletHookValues:", {
            connected: walletHookValues.connected,
            publicKey: walletHookValues.publicKey?.toBase58(),
            wallet: walletHookValues.wallet?.adapter.name,
            signTransaction_exists: !!walletHookValues.signTransaction,
            signAllTransactions_exists: !!walletHookValues.signAllTransactions,
            signMessage_exists: !!walletHookValues.signMessage
        });

        if (typeof window !== 'undefined' && window.Jupiter && typeof window.Jupiter.syncProps === 'function') {
            // This effect will run when walletHookValues changes (e.g., connect/disconnect, account change)
            // and Jupiter is already initialized (initAttempted.current should be true from a successful init, 
            // or init itself will call syncProps once).
            console.log("[Jupiter Debug] Syncing wallet props with Jupiter Terminal. Wallet connected:", walletHookValues.connected);
            try {
                window.Jupiter.syncProps({ passthroughWalletContextState: walletHookValues });
                console.log("[Jupiter Debug] SyncProps Effect: syncProps call successful.");
            } catch (e) {
                console.error("[Jupiter Debug] SyncProps Effect: Error calling syncProps:", e);
            }
        } else {
            console.log("[Jupiter Debug] SyncProps Effect: Not syncing. window.Jupiter available?", !!window.Jupiter, "window.Jupiter.syncProps available?", !!(window.Jupiter && typeof window.Jupiter.syncProps === 'function'));
        }
        console.log("[Jupiter Debug] SyncProps Effect: End");
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