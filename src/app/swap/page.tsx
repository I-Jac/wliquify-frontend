'use client';

import React, { useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

export default function SwapPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const platformFeeAndAccounts = {
    // Define your platform fee and accounts here if you have any
    // Example: feeBps: 50, // 0.5% fee
    // feeAccounts: new Map<string, any>([['So11111111111111111111111111111111111111112', { /* fee account details for SOL */ }]])
  };

  // Scroll to top on initial mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Initialize Jupiter Terminal
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Jupiter) {
      console.log("Attempting to initialize Jupiter Terminal...");
      window.Jupiter.init({
        displayMode: "integrated",
        integratedTargetId: "integrated-terminal-swap-page",
        endpoint: connection?.rpcEndpoint || 'https://api.mainnet-beta.solana.com',
        enableWalletPassthrough: true,
        onFormUpdate: (form: any) => {
          console.log("Jupiter onFormUpdate:", form);
        },
        platformFeeAndAccounts: Object.keys(platformFeeAndAccounts).length > 0 ? platformFeeAndAccounts : undefined,
        formProps: {
          initialInputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
          initialOutputMint: "So11111111111111111111111111111111111111112", // SOL
        },
      });
      console.log("Jupiter Terminal init called.");
    }
  }, [connection?.rpcEndpoint]);

  // Sync wallet state with Jupiter Terminal
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Jupiter && window.Jupiter.syncProps && wallet) {
      window.Jupiter.syncProps({
        passthroughWalletContextState: wallet,
        platformFeeAndAccounts: Object.keys(platformFeeAndAccounts).length > 0 ? platformFeeAndAccounts : undefined,
        endpoint: connection?.rpcEndpoint || 'https://api.mainnet-beta.solana.com',
      });
    }
  }, [wallet, wallet.connected, wallet.publicKey, platformFeeAndAccounts, connection?.rpcEndpoint]);

  return (
    <div className="grid grid-rows-[auto_1fr_auto] items-start justify-items-center min-h-screen pt-[calc(56px_+_1rem)] px-4 sm:px-8 lg:px-16 pb-20 gap-8 font-[family-name:var(--font-geist-sans)] relative">
      <main className="flex flex-col items-center justify-start w-full max-w-7xl mx-auto">
        <div id="integrated-terminal-swap-page" className="w-full max-w-[420px] min-h-[600px] bg-gray-800 rounded-xl shadow-xl overflow-hidden"></div>
      </main>
    </div>
  );
} 