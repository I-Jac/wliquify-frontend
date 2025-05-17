'use client';

import React, { useEffect, useRef, useCallback } from 'react';
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
    const walletHookValues = useWallet();
    const { endpoint: rpcEndpoint } = useSolanaNetwork();
    const platformFeeAndAccounts = undefined;

    const terminalRef = useRef<HTMLDivElement>(null);
    const isJupiterInitialized = useRef(false);

    // Effect for initializing Jupiter Terminal (runs once)
    useEffect(() => {
        console.log("[Jupiter Debug] Mount/Init Effect: Start");

        if (isJupiterInitialized.current) {
            console.log("[Jupiter Debug] Mount/Init Effect: Jupiter already initialized, returning.");
            return;
        }

        if (typeof window === 'undefined' || !window.Jupiter || !rpcEndpoint) {
            console.log("[Jupiter Debug] Mount/Init Effect: Pre-conditions (window, window.Jupiter, rpcEndpoint) not met. RPC:", rpcEndpoint, "window.Jupiter exists:", !!window.Jupiter);
            // Optionally, set up a listener or retry mechanism if window.Jupiter is expected to load asynchronously
            // For now, we'll just return and let it try on next render if dependencies change (though rpcEndpoint is stable here)
            return;
        }

        if (!document.getElementById(JUPITER_INTEGRATED_TARGET_ID)) {
            console.error(`[Jupiter Debug] Mount/Init Effect: Jupiter Terminal target div with id '${JUPITER_INTEGRATED_TARGET_ID}' not found.`);
            return;
        }
        
        console.log(`[Jupiter Debug] Mount/Init Effect: Attempting to initialize Jupiter Terminal. Endpoint: ${rpcEndpoint}, Target ID: ${JUPITER_INTEGRATED_TARGET_ID}`);
        console.log("[Jupiter Debug] Mount/Init Effect: Initial wallet state for init:", {
            connected: walletHookValues.connected,
            publicKey: walletHookValues.publicKey?.toBase58(),
        });

        window.Jupiter.init({
            displayMode: 'integrated',
            integratedTargetId: JUPITER_INTEGRATED_TARGET_ID,
            endpoint: rpcEndpoint,
            strictTokenList: true,
            enableWalletPassthrough: true,
            theme: 'dark',
            passthroughWalletContextState: walletHookValues.connected ? walletHookValues : undefined,
            platformFeeAndAccounts,
            onSuccess: ({ txid, swapResult }) => {
                console.log('[Jupiter Debug] Swap successful!', { txid, swapResult });
            },
            onSwapError: ({ error, code }) => {
                console.error('[Jupiter Debug] Swap error:', { error, code });
            },
        }).then(() => {
            console.log("[Jupiter Debug] Mount/Init Effect: Jupiter Terminal initialized successfully (init.then).");
            isJupiterInitialized.current = true;
            // No immediate syncProps here, the dedicated syncProps effect will handle it.
        }).catch(initError => {
            console.error("[Jupiter Debug] Mount/Init Effect: Error initializing Jupiter Terminal (init.catch):", initError);
            // isJupiterInitialized.current remains false, so it might retry if dependencies change.
        });
        console.log("[Jupiter Debug] Mount/Init Effect: End (after calling init)");

    }, [rpcEndpoint, walletHookValues.connected, walletHookValues.publicKey]);

    // Effect for syncing wallet state with Jupiter Terminal after initialization
    useEffect(() => {
        if (!isJupiterInitialized.current || typeof window === 'undefined' || !window.Jupiter || typeof window.Jupiter.syncProps !== 'function') {
            console.log("[Jupiter Debug] SyncProps Effect: Conditions not met for syncing. Initialized:", isJupiterInitialized.current, "syncProps available:", !!(window.Jupiter && window.Jupiter.syncProps));
            return;
        }
        
        console.log("[Jupiter Debug] SyncProps Effect: Start. Wallet connected:", walletHookValues.connected);
        console.log("[Jupiter Debug] SyncProps Effect: Selected walletHookValues:", {
            connected: walletHookValues.connected,
            publicKey: walletHookValues.publicKey?.toBase58(),
            wallet: walletHookValues.wallet?.adapter.name,
        });

        try {
            console.log("[Jupiter Debug] SyncProps Effect: Calling window.Jupiter.syncProps.");
            window.Jupiter.syncProps({ passthroughWalletContextState: walletHookValues });
            console.log("[Jupiter Debug] SyncProps Effect: syncProps call successful.");
        } catch (e) {
            console.error("[Jupiter Debug] SyncProps Effect: Error calling syncProps:", e);
        }
        console.log("[Jupiter Debug] SyncProps Effect: End");

    }, [walletHookValues]);

    return (
        <div 
            ref={terminalRef}
            id={JUPITER_INTEGRATED_TARGET_ID} 
            className={`relative z-10 ${className || ''}`}
            style={{
                width: '100%', 
                maxWidth: '420px',
                borderRadius: '12px',
            }}
        />
    );
};

JupiterSwapTerminal.displayName = 'JupiterSwapTerminal'; 