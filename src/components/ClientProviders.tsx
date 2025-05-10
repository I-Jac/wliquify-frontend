'use client'; // Make this a Client Component

import React, { useMemo, useState } from 'react';
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
import { SettingsProvider } from '@/contexts/SettingsContext'; // Keep SettingsProvider
import { Toaster } from 'react-hot-toast';
import { AnchorProgramProvider } from '@/hooks/useAnchorProgram'; // Import AnchorProgramProvider

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
                                {children}
                                <Toaster position="bottom-center" />
                            </AnchorProgramProvider>
                        </SettingsProvider>
                    </QueryClientProvider>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
} 