'use client';

import React, { useState, useEffect, useRef } from 'react';
import { PoolInfoDisplay } from "@/components/PoolInfoDisplay";
import { usePoolData } from '@/hooks/usePoolData';
import { useAnchorProgram } from '@/hooks/useAnchorProgram';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

export default function Home() {

  const { program, provider, readOnlyProvider } = useAnchorProgram();
  const wallet = useWallet();
  const { connection } = useConnection();

  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const devToolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (devToolsRef.current && !devToolsRef.current.contains(event.target as Node)) {
        setIsDevToolsOpen(false);
      }
    }
    if (isDevToolsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDevToolsOpen]);

  const {
    poolConfig,
    poolConfigPda,
    processedTokenData,
    totalPoolValueScaled,
    wLqiValueScaled,
    wLqiDecimals,
    userWlqiBalance,
    wLqiSupply,
    oracleData,
    isLoadingPublicData,
    isLoadingUserData,
    error: poolDataError,
    refreshAllData,
  } = usePoolData({ program, provider, readOnlyProvider, connection, wallet });

  const openTokenFaucet = () => {
    window.open('https://i-jac.github.io/faucet-frontend/', '_blank', 'noopener,noreferrer');
  };
  const openSolFaucet = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const displayError = poolDataError;

  return (
    <div className="grid grid-rows-[auto_1fr_auto] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)] relative">
      <div className="fixed top-4 left-4 z-50">
        <div className="relative" ref={devToolsRef}>
          <button
            onClick={() => setIsDevToolsOpen(!isDevToolsOpen)}
            className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-3 rounded text-sm flex items-center space-x-1"
          >
            <span>Dev Tools</span>
            <svg className={`w-3 h-3 transition-transform ${isDevToolsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </button>

          {isDevToolsOpen && (
            <div className="absolute left-0 mt-2 w-60 rounded-md shadow-lg bg-gray-700 ring-1 ring-black ring-opacity-5 z-50">
              <div className="px-4 pt-2 pb-1 text-xs text-gray-400">
                <p>Tip: Click wallet button (top-right) & &apos;Copy address&apos; to paste into faucets.</p>
              </div>
              <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                <button
                  onClick={() => { openSolFaucet('https://solfaucet.com/'); setIsDevToolsOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white"
                  role="menuitem"
                  title="Get Devnet/Testnet SOL from solfaucet.com (Option 1)"
                >
                   1. Airdrop SOL (solfaucet.com)
                 </button>
                 <button
                   onClick={() => { openSolFaucet('https://solfate.com/faucet'); setIsDevToolsOpen(false); }}
                   className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white"
                   role="menuitem"
                   title="Get Devnet/Testnet SOL from solfate.com (Option 2)"
                 >
                   1. Airdrop SOL (solfate.com)
                 </button>
                <button
                  onClick={() => { openTokenFaucet(); setIsDevToolsOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white"
                  role="menuitem"
                  title="Faucet for minting test tokens (requires SOL for transaction fees)"
                >
                  2. Mint Test Tokens (after SOL Airdrop)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <main className="flex flex-col items-center gap-8 w-full max-w-4xl">
        {displayError && <div className="text-red-500 bg-red-900/30 p-2 rounded">Error: {displayError}</div>}
        <PoolInfoDisplay
          poolConfig={poolConfig}
          poolConfigPda={poolConfigPda}
          oracleData={oracleData}
          wLqiSupply={wLqiSupply}
          wLqiDecimals={wLqiDecimals}
          wLqiValueScaled={wLqiValueScaled}
          totalPoolValueScaled={totalPoolValueScaled}
          isLoadingPublicData={isLoadingPublicData}
          processedTokenData={processedTokenData}
          userWlqiBalance={userWlqiBalance}
          isLoadingUserData={isLoadingUserData}
          error={poolDataError}
          refreshAllData={refreshAllData}
        />
        {/* Commented out TokenTable removed */}
      </main>
    </div>
  );
}
