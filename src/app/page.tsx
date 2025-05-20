'use client';

import React, { useEffect } from 'react';
import { PoolInfoDisplay } from "@/components/pool/PoolInfoDisplay";
import { ScrollToTopButton } from "@/components/layout/ScrollToTopButton";
import { usePoolData } from '@/hooks/usePoolData';
import { useAnchorProgram } from '@/hooks/useAnchorProgram';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useTranslation } from 'react-i18next';

export default function Home() {
  const { program, provider, readOnlyProvider } = useAnchorProgram();
  const wallet = useWallet();
  const { connection } = useConnection();
  const { t } = useTranslation();

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
    refreshAfterTransaction,
  } = usePoolData({
    program,
    provider,
    readOnlyProvider,
    connection,
    wallet,
    enabled: true,
  });

  const displayError = poolDataError;

  // Scroll to top on initial mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []); // Empty dependency array means it runs once on mount

  return (
    <div className="grid grid-rows-[auto_1fr_auto] items-center justify-items-center min-h-screen pt-[calc(56px_+_1rem)] px-4 sm:px-8 lg:px-16 pb-20 gap-8 font-[family-name:var(--font-geist-sans)] relative">
      <main className="flex flex-col items-center justify-center w-full">
        {displayError && <div className="text-red-500 bg-red-900/30 p-2 rounded">{t('global.error')}: {displayError}</div>}
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
          refreshAfterTransaction={refreshAfterTransaction}
        />
      </main>

      <ScrollToTopButton />
    </div>
  );
}
