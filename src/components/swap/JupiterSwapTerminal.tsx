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
    const walletHookValues = useWallet();
    const { endpoint: rpcEndpoint } = useSolanaNetwork();
    const platformFeeAndAccounts = undefined;

    const terminalRef = useRef<HTMLDivElement>(null);
    // Ref to track if window.Jupiter.init() has been *called*. Set synchronously.
    const hasJupiterInitBeenCalledRef = useRef(false);
    // Ref to track if window.Jupiter.init() has *successfully completed* (promise resolved).
    const isJupiterTerminalReadyRef = useRef(false);

    // Effect for initializing Jupiter Terminal (one-time attempt logic)
    useEffect(() => {
        console.log(`[Jupiter InitEffect] Start. Call attempted: ${hasJupiterInitBeenCalledRef.current}, Terminal ready: ${isJupiterTerminalReadyRef.current}`);

        // If init() has already been called successfully, do nothing.
        if (isJupiterTerminalReadyRef.current) {
            console.log("[Jupiter InitEffect] Terminal already reported as ready. Skipping.");
            return;
        }

        // If init() call was made but hasn't successfully completed yet (or failed and reset hasJupiterInitBeenCalledRef), don't call again.
        // This check is important if the effect re-runs while init promise is pending.
        if (hasJupiterInitBeenCalledRef.current && !isJupiterTerminalReadyRef.current) {
            console.log("[Jupiter InitEffect] Init call previously made, pending completion or failed. Skipping new call.");
            return;
        }

        // Precondition checks
        if (typeof window === 'undefined' || !window.Jupiter || !rpcEndpoint) {
            console.log(`[Jupiter InitEffect] Preconditions not met. window.Jupiter: ${!!window.Jupiter}, rpcEndpoint: ${!!rpcEndpoint}`);
            return;
        }
        if (!document.getElementById(JUPITER_INTEGRATED_TARGET_ID)) {
            console.error(`[Jupiter InitEffect] Target div '${JUPITER_INTEGRATED_TARGET_ID}' not found.`);
            return;
        }

        hasJupiterInitBeenCalledRef.current = true; // Mark *before* calling init - this is the primary synchronous guard.
        console.log(`[Jupiter InitEffect] Calling window.Jupiter.init(). Wallet connected: ${walletHookValues.connected}, PubKey: ${walletHookValues.publicKey?.toBase58()}`);

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
                console.log('[Jupiter SwapEvent] Swap successful!', { txid, swapResult });
            },
            onSwapError: ({ error, code }) => {
                console.error('[Jupiter SwapEvent] Swap error:', { error, code });
            },
        }).then(() => {
            console.log("[Jupiter InitEffect] window.Jupiter.init() successful (.then).");
            isJupiterTerminalReadyRef.current = true; // Mark terminal as ready
            // initInProgressOrDoneRef remains true as the call was made and succeeded.

            // Perform initial sync immediately after successful init
            if (typeof window.Jupiter?.syncProps === 'function') {
                console.log(`[Jupiter InitEffect .then()] Immediately calling syncProps. Wallet connected: ${walletHookValues.connected}`);
                try {
                    window.Jupiter.syncProps({ passthroughWalletContextState: walletHookValues });
                    console.log("[Jupiter InitEffect .then()] Immediate syncProps call successful.");
                } catch (e) {
                    console.error("[Jupiter InitEffect .then()] Error in immediate syncProps call:", e);
                }
            } else {
                console.warn("[Jupiter InitEffect .then()] syncProps function not available immediately after init?");
            }
        }).catch(initError => {
            console.error("[Jupiter InitEffect] window.Jupiter.init() failed (.catch):", initError);
            hasJupiterInitBeenCalledRef.current = false; // Reset: allow init to be called again on a subsequent effect run if init fails.
            isJupiterTerminalReadyRef.current = false;
        });
        console.log("[Jupiter InitEffect] End of synchronous block (init call has been made).");

    // Dependencies for InitEffect:
    // - rpcEndpoint: to ensure it's available.
    // - Key parts of walletHookValues: so if they are present on the first valid run of this effect 
    //   (i.e., when hasJupiterInitBeenCalledRef is false), the init() call gets the correct initial state.
    // The hasJupiterInitBeenCalledRef.current check is the main guard against re-running init logic.
    }, [rpcEndpoint, walletHookValues.connected, walletHookValues.publicKey, walletHookValues.wallet?.adapter.name]);

    // Effect for syncing wallet state with Jupiter Terminal *after* initialisation
    useEffect(() => {
        console.log(`[Jupiter SyncEffect] Start. Terminal ready: ${isJupiterTerminalReadyRef.current}. Wallet connected: ${walletHookValues.connected}`);

        if (!isJupiterTerminalReadyRef.current || typeof window === 'undefined' || !window.Jupiter || typeof window.Jupiter.syncProps !== 'function') {
            console.log(`[Jupiter SyncEffect] Conditions not met for syncProps. TerminalReady: ${isJupiterTerminalReadyRef.current}, JupiterGlobal: ${!!window.Jupiter}, SyncFunc: ${!!window.Jupiter?.syncProps}`);
            return;
        }
        
        // This effect is primarily for *subsequent* updates. The initial sync is handled in init().then().
        // However, calling it here ensures that if walletHookValues changes for any reason while terminal is ready,
        // Jupiter gets the update. Jupiter's syncProps should ideally be idempotent.
        console.log(`[Jupiter SyncEffect] Calling syncProps for wallet update. PubKey: ${walletHookValues.publicKey?.toBase58()}`);
        try {
            window.Jupiter.syncProps({ passthroughWalletContextState: walletHookValues });
            console.log("[Jupiter SyncEffect] syncProps call successful.");
        } catch (e) {
            console.error("[Jupiter SyncEffect] Error calling syncProps:", e);
        }
        console.log("[Jupiter SyncEffect] End.");

    }, [walletHookValues]); // Reacts to any change in walletHookValues

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