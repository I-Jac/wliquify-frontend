'use client'; // Make this a Client Component

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
    ConnectionProvider,
    WalletProvider,
} from "@solana/wallet-adapter-react";
import {
    WalletModalProvider,
} from "@solana/wallet-adapter-react-ui";
import {
    PhantomWalletAdapter,
    SolflareWalletAdapter,
    CoinbaseWalletAdapter,
    TrustWalletAdapter,
    LedgerWalletAdapter,
    // Add other wallets here if needed
} from "@solana/wallet-adapter-wallets";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RPC_URL } from '@/utils/constants'; // Import RPC URL
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext'; // Keep SettingsProvider and useSettings
import { Toaster } from 'react-hot-toast';
import { AnchorProgramProvider } from '@/hooks/useAnchorProgram'; // Import AnchorProgramProvider
import { Tooltip } from 'react-tooltip'; // Added import
import 'react-tooltip/dist/react-tooltip.css'; // Added CSS import

// Component to handle dynamic fee updates
function DynamicFeeUpdater() {
    const { rpcEndpoint, fetchDynamicFees, isSettingsModalOpen } = useSettings();
    const componentIsMountedRef = useRef(true);

    useEffect(() => {
        componentIsMountedRef.current = true;
        return () => {
            componentIsMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;

        const fetchFeesUsingSettingsRpc = async () => {
            if (!componentIsMountedRef.current) return;
            try {
                await fetchDynamicFees(); 
            } catch (error) {
                console.error("[DynamicFeeUpdater] Error fetching dynamic fees:", error);
            }
        };

        if (rpcEndpoint && !isSettingsModalOpen) {
            fetchFeesUsingSettingsRpc();
        }

        if (intervalId) {
            clearInterval(intervalId);
        }

        if (rpcEndpoint && !isSettingsModalOpen) {
            intervalId = setInterval(fetchFeesUsingSettingsRpc, 300000);
        } else {
            if (intervalId) clearInterval(intervalId);
        }

        return () => {
            if (intervalId) {
            }
        };
    }, [rpcEndpoint, fetchDynamicFees, isSettingsModalOpen]);

    return null; // This component does not render anything
}

export function ClientProviders({ children }: { children: React.ReactNode }) {
    // --- React Query Client Setup ---
    // Use state to ensure client is only created once
    const [queryClient] = useState(() => new QueryClient());
    // --- End React Query Client Setup ---

    const endpoint = useMemo(() => RPC_URL, []);
    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
            new CoinbaseWalletAdapter(),
            new TrustWalletAdapter(),
            new LedgerWalletAdapter(),
        ],
        []
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    {/* Wrap SettingsProvider with QueryClientProvider */}
                    <QueryClientProvider client={queryClient}>
                        <SettingsProvider>
                            <AnchorProgramProvider>
                                <DynamicFeeUpdater />
                                {children}
                                <Toaster position="bottom-center" />
                                <Tooltip id="app-tooltip" style={{ zIndex: 9999 }} className="app-tooltip-custom" />
                            </AnchorProgramProvider>
                        </SettingsProvider>
                    </QueryClientProvider>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
} 