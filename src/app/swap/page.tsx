'use client';

import React, { useEffect } from 'react';
import { SwapViewContainer } from '@/components/swap/SwapViewContainer';
import { ScrollToTopButton } from "@/components/layout/ScrollToTopButton"; // Assuming you want this here too
// import { useTranslation } from 'react-i18next';

export default function SwapPage() {
  // const { t } = useTranslation(); // If SwapViewContainer or this page uses t directly

  // Scroll to top on initial mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="grid grid-rows-[auto_1fr_auto] items-center justify-items-center min-h-screen pt-[calc(56px_+_1rem)] px-4 sm:px-8 lg:px-16 pb-20 gap-8 font-[family-name:var(--font-geist-sans)] relative">
      <main className="flex flex-col items-center justify-center w-full">
        {/* Add any page-specific error display for swap if needed */}
        <SwapViewContainer />
      </main>

      <ScrollToTopButton />
    </div>
  );
} 