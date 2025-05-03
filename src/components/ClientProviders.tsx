'use client'; // Make this a Client Component

import React, { useMemo, useState, useEffect } from 'react';
import {
    ConnectionProvider,
    WalletProvider,
} from "@solana/wallet-adapter-react";
import {
    WalletModalProvider,
    WalletMultiButton
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
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext'; // Import SettingsProvider and hook
import { SettingsModal } from '@/components/SettingsModal'; // Import SettingsModal
import { Toaster } from 'react-hot-toast';

// Re-define WalletSection here as it uses client hooks
const WalletSection = () => {
    const { openSettingsModal } = useSettings();
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) return null; // Don't render server-side

    return (
        <div className="absolute top-4 right-4 z-10 flex items-center space-x-2">
            <button
                onClick={openSettingsModal}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
                title="Wallet Settings"
            >
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.646.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.004.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 1.655c.007.379.138.75.43.992l1.005.827c.531.438.636 1.225.26 1.431l-1.296 2.247a1.125 1.125 0 01-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.075.124a6.57 6.57 0 01-.22.127c-.333.184-.583.496-.646.87l-.213 1.281c-.09.543-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.646-.87-.074-.04-.147-.083-.22-.127a6.501 6.501 0 01-1.075-.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.296-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.293-.24.438-.613.43-.992a6.932 6.932 0 010-1.655c-.007-.379-.138-.75-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.431l1.296-2.247a1.125 1.125 0 011.37-.49l1.217.456c.355.133.75.072 1.075-.124.073-.044.146-.087.22-.127.333-.184.583-.496.646-.87l.213-1.281z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            </button>
            <WalletMultiButton />
            <SettingsModal />
        </div>
    );
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
                            <WalletSection />
                            {children}
                            <Toaster position="bottom-center" />
                        </SettingsProvider>
                    </QueryClientProvider>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
} 