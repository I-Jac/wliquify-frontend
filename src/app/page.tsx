'use client';

import React from 'react';
import { PoolInfoDisplay } from "@/components/PoolInfoDisplay";
import { usePoolData } from '@/hooks/usePoolData';
import { useAnchorProgram } from '@/hooks/useAnchorProgram';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

export default function Home() {
  const { program, provider, readOnlyProvider } = useAnchorProgram();
  const { connection } = useConnection();
  const wallet = useWallet();

  const {
    poolConfig,
    poolConfigPda,
    oracleData,
    wLqiSupply,
    wLqiDecimals,
    processedTokenData,
    totalPoolValueScaled,
    wLqiValueScaled,
    userWlqiBalance,
    isLoadingPublicData,
    isLoadingUserData,
    error,
    refreshAllData,
  } = usePoolData({
    program,
    provider,
    readOnlyProvider,
    connection,
    wallet,
  });

  const openTokenFaucet = () => {
    window.open('https://i-jac.github.io/faucet-frontend/', '_blank', 'noopener,noreferrer');
  };
  const openSolFaucet = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="grid grid-rows-[auto_1fr_auto] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)] relative">
       <div className="fixed top-4 left-4 z-50 flex space-x-2">
           <button
               onClick={openTokenFaucet}
               className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm"
               title="Faucet for minting test tokens and adding price feeds"
           >
               Token Mint & Change Token Price
           </button>
           <button
               onClick={() => openSolFaucet('https://solfaucet.com/')}
               className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-1 px-3 rounded text-sm"
               title="Link to SolFaucet (solfaucet.com) for Devnet/Testnet SOL"
           >
               Solana Airdrop 1
           </button>
           <button
               onClick={() => openSolFaucet('https://solfate.com/faucet')}
               className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-1 px-3 rounded text-sm"
               title="Link to Solfate Faucet (solfate.com) for Devnet/Testnet SOL"
           >
               Solana Airdrop 2
           </button>
       </div>

      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start w-full max-w-4xl">
        <PoolInfoDisplay
          poolConfig={poolConfig}
          poolConfigPda={poolConfigPda}
          oracleData={oracleData}
          wLqiSupply={wLqiSupply}
          wLqiDecimals={wLqiDecimals}
          processedTokenData={processedTokenData}
          totalPoolValueScaled={totalPoolValueScaled}
          wLqiValueScaled={wLqiValueScaled}
          userWlqiBalance={userWlqiBalance}
          isLoadingPublicData={isLoadingPublicData}
          isLoadingUserData={isLoadingUserData}
          error={error}
          refreshAllData={refreshAllData}
        />
      </main>
    </div>
  );
}
