'use client';

import React, { useEffect, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

export default function SwapPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const platformFeeAndAccounts = {
    // Define your platform fee and accounts here if you have any
    // Example: feeBps: 50, // 0.5% fee
    // feeAccounts: new Map<string, any>([['So11111111111111111111111111111111111111112', { /* fee account details for SOL */ }]])
  };

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
        // console.log("Backdrop clicked, attempting to click internal back button.", backButtonRef.current);
        backButtonRef.current.click();
      }
    };

    const observer = new MutationObserver((mutationsList, observerInstance) => {
      const modalWrapper = document.querySelector<HTMLDivElement>(JUPITER_MODAL_WRAPPER_SELECTOR);
      
      if (modalWrapper) {
        if (!modalWrapperRef.current) {
          // console.log("Jupiter modal wrapper found. Attaching click listener for backdrop.");
          modalWrapperRef.current = modalWrapper;
          modalWrapper.addEventListener('click', handleClickOutside);
        }
        if (!backButtonRef.current) {
          const backButton = modalWrapper.querySelector<HTMLElement>(JUPITER_BACK_BUTTON_SELECTOR);
          if (backButton) {
            // console.log("Jupiter internal back button found with new selector:", backButton);
            backButtonRef.current = backButton;
          } 
        }
      } else {
        if (modalWrapperRef.current) {
          // console.log("Jupiter modal wrapper disappeared. Removing click listener.");
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

  // Initialize Jupiter Terminal
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Jupiter) {
      // console.log("Attempting to initialize Jupiter Terminal...");
      window.Jupiter.init({
        displayMode: "integrated",
        integratedTargetId: "integrated-terminal-swap-page",
        endpoint: connection?.rpcEndpoint || 'https://api.mainnet-beta.solana.com',
        enableWalletPassthrough: true,
        onFormUpdate: (form: any) => {
          // console.log("Jupiter onFormUpdate:", form); // Optional: remove if not needed
        },
        platformFeeAndAccounts: Object.keys(platformFeeAndAccounts).length > 0 ? platformFeeAndAccounts : undefined,
        formProps: {
          initialInputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          initialOutputMint: "So11111111111111111111111111111111111111112",
        },
      });
      // console.log("Jupiter Terminal init called.");
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
    <div className="flex flex-col items-center pt-[calc(56px_+_1rem)] px-4 sm:px-8 lg:px-16 pb-8 font-[family-name:var(--font-geist-sans)] relative">
      <main className="relative z-40 flex flex-col items-center justify-start w-full max-w-7xl mx-auto">
        <div id="integrated-terminal-swap-page" className="w-full max-w-[420px] min-h-[600px] bg-gray-800 rounded-xl shadow-xl overflow-hidden mb-20"></div>
      </main>
    </div>
  );
} 