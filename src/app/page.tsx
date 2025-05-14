'use client';

import React from 'react';
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
    refreshAllData,
  } = usePoolData({ program, provider, readOnlyProvider, connection, wallet });

  const displayError = poolDataError;

  return (
    <div className="grid grid-rows-[auto_1fr_auto] items-center justify-items-center min-h-screen p-4 sm:p-8 lg:p-16 pb-20 gap-16 font-[family-name:var(--font-geist-sans)] relative">
      <main className="flex flex-col items-center justify-center w-full min-h-[600px]">
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
          refreshAllData={refreshAllData}
        />
        {/* Commented out TokenTable removed */}
      </main>

      <ScrollToTopButton />
    </div>
  );
}
