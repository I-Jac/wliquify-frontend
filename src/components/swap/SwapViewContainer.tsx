'use client';

import React from 'react';
import { JupiterSwapTerminal } from './JupiterSwapTerminal';
import { useTranslation } from 'react-i18next';

export const SwapViewContainer: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div className="flex flex-col items-center w-full">
            {/* 
                This container centers the title and the swap terminal.
                The terminal itself will define its appearance (background, border-radius).
            */}
            <div 
                className="w-full max-w-[420px] border-4 border-red-500" 
                style={{ 
                    minHeight: '700px', // Temporary explicit min height
                    overflow: 'visible !important' as any // Temporary, forcing overflow
                }}
            >
                <h2 className="text-2xl font-bold text-white mb-4 text-center">
                    {t('swapView.title', 'Swap Tokens')}
                </h2>
                <JupiterSwapTerminal className="border border-gray-700" />
            </div>
        </div>
    );
};

SwapViewContainer.displayName = 'SwapViewContainer'; 