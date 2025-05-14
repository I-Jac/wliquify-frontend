'use client'; // Make this a Client Component

import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { i18n as I18nType } from 'i18next'; // Import i18n type for state
import {
    ConnectionProvider,
    WalletProvider,
} from "@solana/wallet-adapter-react";
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
import { I18nextProvider } from 'react-i18next'; // Added
import i18nPromise from '../i18n'; // Renamed from i18n
import { WalletModalProvider } from './WalletModalProvider'; // Import our custom WalletModalProvider

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
                clearInterval(intervalId); // Clear interval on unmount
            }
        };
    }, [rpcEndpoint, fetchDynamicFees, isSettingsModalOpen]);

    return null; // This component does not render anything
}

export function ClientProviders({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    const [resolvedI18nInstance, setResolvedI18nInstance] = useState<I18nType | null>(null);

    useEffect(() => {
        i18nPromise
            .then((instance) => {
                setResolvedI18nInstance(instance);
            })
            .catch((err) => {
                console.error("Failed to initialize i18n in ClientProviders:", err);
                // Optionally, set an error state or a fallback i18n instance here
            });
    }, []);

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

    if (!resolvedI18nInstance) {
        // You can render a loader here if you want
        // For now, returning null to prevent rendering children until i18n is ready
        return null; 
    }

    return (
        <I18nextProvider i18n={resolvedI18nInstance}>
            <SettingsProvider>
                <ConnectionProvider endpoint={endpoint}>
                    <WalletProvider wallets={wallets} autoConnect>
                        <WalletModalProvider>
                            <QueryClientProvider client={queryClient}>
                                <AnchorProgramProvider>
                                    <DynamicFeeUpdater />
                                    {children}
                                    <Toaster position="bottom-center" />
                                    <Tooltip id="app-tooltip" style={{ zIndex: 9999 }} className="app-tooltip-custom" />
                                </AnchorProgramProvider>
                            </QueryClientProvider>
                        </WalletModalProvider>
                    </WalletProvider>
                </ConnectionProvider>
            </SettingsProvider>
        </I18nextProvider>
    );
} 