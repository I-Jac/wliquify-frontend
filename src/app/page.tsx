'use client';

import React from 'react';
import { PoolInfoDisplay } from "@/components/PoolInfoDisplay";
import { ScrollToTopButton } from "@/components/ScrollToTopButton";
import { usePoolData } from '@/hooks/usePoolData';
import { useAnchorProgram } from '@/hooks/useAnchorProgram';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

export default function Home() {

  const { program, provider, readOnlyProvider } = useAnchorProgram();
  const wallet = useWallet();
  const { connection } = useConnection();

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

  const displayError = poolDataError;

  return (
    <div className="grid grid-rows-[auto_1fr_auto] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)] relative">
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

      <ScrollToTopButton />
    </div>
  );
}
