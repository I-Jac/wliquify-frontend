'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSettings } from '@/contexts/SettingsContext';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { clusterApiUrl } from '@solana/web3.js';
import type { IForm, PlatformFeeAndAccounts } from '@/types/jupiter-terminal';

// Helper function to determine Jupiter cluster from RPC URL
const getJupiterCluster = (rpcUrl: string): 'mainnet-beta' | 'devnet' | 'testnet' | undefined => {
  if (rpcUrl.includes('devnet')) { // Check for 'devnet' substring first for custom devnet rpcs
    return 'devnet';
  }
  if (rpcUrl.includes('testnet')) { // Check for 'testnet' substring
    return 'testnet';
  }
  // Check against standard clusterApiUrls
  if (rpcUrl === clusterApiUrl(WalletAdapterNetwork.Devnet)) {
    return 'devnet';
  }
  if (rpcUrl === clusterApiUrl(WalletAdapterNetwork.Testnet)) {
    return 'testnet';
  }
  // Default to mainnet-beta if it's a mainnet URL or a custom URL not identified as devnet/testnet
  // Jupiter might also infer from the endpoint. Explicitly setting undefined if unsure might be safer if Jupiter has good inference.
  // However, if the URL contains 'mainnet' or is the standard mainnet URL, explicitly set it.
  if (rpcUrl.includes('mainnet') || rpcUrl === clusterApiUrl(WalletAdapterNetwork.Mainnet)) {
    return 'mainnet-beta';
  }
  return undefined; // Let Jupiter infer if we can't determine
};

// Helper to get a display-friendly network name
const getNetworkDisplayName = (rpcUrl: string): string => {
  if (rpcUrl.includes('mainnet')) return 'Mainnet';
  if (rpcUrl.includes('devnet')) return 'Devnet';
  if (rpcUrl.includes('testnet')) return 'Testnet';
  if (rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1')) return 'Localhost';
  return 'Custom Network';
};

export default function SwapPage() {
  const walletContext = useWallet();
  const { rpcEndpoint } = useSettings();
  const [jupiterKey, setJupiterKey] = useState(rpcEndpoint);

  // Log wallet's network adapter information
  useEffect(() => {
    if (walletContext.wallet && walletContext.wallet.adapter) {
      console.log("[SwapPage] Wallet adapter info:", {
        name: walletContext.wallet.adapter.name,
        connected: walletContext.connected,
        publicKey: walletContext.publicKey?.toBase58(),
      });
    }
  }, [walletContext]);

  const platformFeeAndAccounts: PlatformFeeAndAccounts = useMemo(() => ({
    // Define your platform fee and accounts here if you have any
    // Example: feeBps: 50, // 0.5% fee
    // feeAccounts: new Map<string, TransactionFee>([['So11111111111111111111111111111111111111112', { amount: '10000', mint: 'SOL_MINT_ADDRESS', account: 'FEE_ACCOUNT_ADDRESS' }]])
  }), []);

  const modalWrapperRef = useRef<HTMLDivElement | null>(null);
  const backButtonRef = useRef<HTMLElement | null>(null);

  // Scroll to top on initial mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Effect for handling click outside and finding elements
  useEffect(() => {
    const JUPITER_MODAL_WRAPPER_SELECTOR = '#jupiter-terminal > div[class*="absolute"][class*="bg-"][class*="overflow-hidden"]';
    const JUPITER_BACK_BUTTON_SELECTOR = `${JUPITER_MODAL_WRAPPER_SELECTOR} > div > div:nth-child(1) > div[class*="cursor-pointer"][class*="w-6"][class*="h-6"]:has(svg)`

    const handleClickOutside = (event: MouseEvent) => {
      if (modalWrapperRef.current && event.target === modalWrapperRef.current && backButtonRef.current) {
        backButtonRef.current.click();
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const observer = new MutationObserver((_mutationsList, _observerInstance) => {
      const modalWrapper = document.querySelector<HTMLDivElement>(JUPITER_MODAL_WRAPPER_SELECTOR);
      
      if (modalWrapper) {
        if (!modalWrapperRef.current) {
          modalWrapperRef.current = modalWrapper;
          modalWrapper.addEventListener('click', handleClickOutside);
        }
        if (!backButtonRef.current) {
          const backButton = modalWrapper.querySelector<HTMLElement>(JUPITER_BACK_BUTTON_SELECTOR);
          if (backButton) {
            backButtonRef.current = backButton;
          } 
        }
      } else {
        if (modalWrapperRef.current) {
          modalWrapperRef.current.removeEventListener('click', handleClickOutside);
          modalWrapperRef.current = null;
          backButtonRef.current = null;
        }
      }
    });

    const jupiterTerminalParent = document.getElementById('integrated-terminal-swap-page');
    observer.observe(jupiterTerminalParent || document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (modalWrapperRef.current) {
        modalWrapperRef.current.removeEventListener('click', handleClickOutside);
      }
    };
  }, []);

  useEffect(() => {
    setJupiterKey(rpcEndpoint);
  }, [rpcEndpoint]);

  // Initialize Jupiter Terminal
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Jupiter) {
      const calculatedCluster = getJupiterCluster(rpcEndpoint);
      console.log(`[SwapPage] Initializing Jupiter with endpoint: ${rpcEndpoint}, cluster: ${calculatedCluster}`);
      window.Jupiter.init({
        displayMode: "integrated",
        integratedTargetId: "integrated-terminal-swap-page",
        endpoint: rpcEndpoint,
        cluster: calculatedCluster,
        enableWalletPassthrough: true,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onFormUpdate: (_form: IForm) => {
          // console.log("Jupiter onFormUpdate:", _form);
        },
        onSuccess: ({ txid, swapResult }) => {
          console.log("Swap successful:", { txid, swapResult });
          if (window.Jupiter && window.Jupiter.syncProps && walletContext.wallet) {
            window.Jupiter.syncProps({
              passthroughWalletContextState: walletContext,
            });
          }
        },
        onSwapError: ({ error, quoteResponseMeta }) => {
          console.error("Swap failed:", error, "QuoteResponseMeta:", quoteResponseMeta);
        },
        platformFeeAndAccounts,
        strictTokenList: true,
      });
    }
  }, [jupiterKey, walletContext, platformFeeAndAccounts, rpcEndpoint]);

  // Sync wallet state with Jupiter Terminal (this handles initial sync and ongoing changes)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Jupiter && window.Jupiter.syncProps && walletContext.wallet) {
      window.Jupiter.syncProps({
        passthroughWalletContextState: walletContext,
        platformFeeAndAccounts: Object.keys(platformFeeAndAccounts).length > 0 ? platformFeeAndAccounts : undefined,
        endpoint: rpcEndpoint,
        formProps: {
          initialInputMint: rpcEndpoint.includes('mainnet') ? 'So11111111111111111111111111111111111111112' : 'So11111111111111111111111111111111111111112',
          initialOutputMint: rpcEndpoint.includes('mainnet') ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        }
      });
    }
  }, [walletContext, platformFeeAndAccounts, rpcEndpoint]);

  const appNetworkDisplayName = getNetworkDisplayName(rpcEndpoint);

  return (
    <div className="flex flex-col items-center pt-[calc(56px_+_1rem)] px-4 sm:px-8 lg:px-16 pb-8 font-[family-name:var(--font-geist-sans)] relative">
      <main className="relative z-40 flex flex-col items-center justify-start w-full max-w-7xl mx-auto">
        
        {/* Network Information Message */}
        <div className="w-full max-w-[420px] p-3 mb-4 text-xs text-yellow-200 bg-yellow-700 bg-opacity-30 border border-yellow-600 rounded-md">
          <p className="font-semibold">Network Configuration Note:</p>
          <ul className="list-disc list-inside pl-2 mt-1 space-y-1">
            <li>App is set to: <strong>{appNetworkDisplayName}</strong> (RPC: {rpcEndpoint})</li>
            <li>For token lists and balances to align with this setting, please ensure your wallet (e.g., Phantom) is also set to <strong>{appNetworkDisplayName}</strong>.</li>
            <li>Swaps will be executed on the network your wallet is currently connected to.</li>
          </ul>
        </div>

        <div id="integrated-terminal-swap-page" key={jupiterKey} className="w-full max-w-[420px] min-h-[600px] bg-gray-800 rounded-xl shadow-xl overflow-hidden mb-20"></div>
      </main>
    </div>
  );
} 