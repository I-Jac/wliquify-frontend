'use client'; // Make this a Client Component

import React, { useMemo, useState, useEffect, useRef, Suspense } from 'react';
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
} from "@solana/wallet-adapter-wallets"; // Re-added wallet adapters
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext'; // Keep SettingsProvider and useSettings
import { Toaster } from 'react-hot-toast';
import { AnchorProgramProvider } from '@/hooks/useAnchorProgram'; // Import AnchorProgramProvider
import { Tooltip } from 'react-tooltip'; // Added import
import 'react-tooltip/dist/react-tooltip.css'; // Added CSS import
import { I18nextProvider } from 'react-i18next'; // Added
import i18nPromise from '../../i18n'; // Renamed from i18n
import { WalletModalProvider } from '../wallet/WalletModalProvider'; // Import our custom WalletModalProvider
import { AutoConnectProvider, useAutoConnect } from './AutoConnectProvider';
import { AlertProvider } from '@/contexts/AlertContext';
import { WalletProfileProvider } from '@/contexts/WalletProfileContext';
import dynamic from 'next/dynamic';
import { SolanaNetworkProvider, useSolanaNetwork } from '@/contexts/SolanaNetworkContext';

// Simple full screen loader component
const FullScreenLoader: React.FC = () => {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            width: '100vw',
            backgroundColor: '#1f2937', // Corresponds to gray-800
            color: 'white',
            fontSize: '1.5rem'
        }}>
            Loading Application...
        </div>
    );
};

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

// Dynamically import WalletProfilePanel
const WalletProfilePanel = dynamic(() => 
    import('@/components/wallet/WalletProfilePanel').then(mod => mod.WalletProfilePanel),
    { ssr: false, loading: () => null } // No specific loader for the panel itself, it manages its own visibility
);

const WalletContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { autoConnect } = useAutoConnect();
    const { endpoint } = useSolanaNetwork();

    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
            new CoinbaseWalletAdapter(),
            new TrustWalletAdapter(),
            new LedgerWalletAdapter(),
        ],
        [] // The network is not needed as a dependency here, adapters are static
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect={autoConnect}>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};

export const ClientProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [resolvedI18nInstance, setResolvedI18nInstance] = useState<I18nType | null>(null);

    useEffect(() => {
        const PPromise = i18nPromise;
        const initI18n = async () => {
            try {
                const instance = await PPromise;
                setResolvedI18nInstance(instance);
            } catch (error) {
                console.error("Failed to initialize i18n:", error);
                // Handle error, maybe set a fallback i18n instance or show error message
            }
        };
        initI18n();
    }, []);

    if (!resolvedI18nInstance) { // Show loader until i18n is resolved
        return <FullScreenLoader />;
    }

    return (
        <Suspense fallback={<FullScreenLoader />}>
            <I18nextProvider i18n={resolvedI18nInstance}> {/* Use resolved instance */}
                <SettingsProvider> {/* Moved SettingsProvider up */}
                    <SolanaNetworkProvider>
                        <AutoConnectProvider>
                            <WalletContextProvider>
                                <AlertProvider>
                                    <WalletProfileProvider>
                                        <AnchorProgramProvider>
                                            <DynamicFeeUpdater />
                                            {children}
                                            <Toaster position="bottom-center" />
                                            <Tooltip id="app-tooltip" style={{ zIndex: 9999 }} className="app-tooltip-custom" />
                                            <WalletProfilePanel />
                                        </AnchorProgramProvider>
                                    </WalletProfileProvider>
                                </AlertProvider>
                            </WalletContextProvider>
                        </AutoConnectProvider>
                    </SolanaNetworkProvider>
                </SettingsProvider>
            </I18nextProvider>
        </Suspense>
    );
} 