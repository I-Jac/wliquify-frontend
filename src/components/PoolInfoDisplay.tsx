'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { PublicKey, SystemProgram, AccountInfo, Connection } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useAnchorProgram } from '@/hooks/useAnchorProgram';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
    POOL_AUTHORITY_SEED,
    USD_SCALE,
} from '@/utils/constants';
import { Buffer } from 'buffer';
import { getAssociatedTokenAddressSync, getMint, MintLayout, AccountLayout } from '@solana/spl-token';
import {
    ProcessedTokenData,
    formatScaledBnToDollarString,
    formatRawAmountString,
} from '@/utils/calculations';
import { TokenTable } from './TokenTable';
import { usePoolInteractions } from '@/hooks/usePoolInteractions';
import { findPoolConfigPDA } from '@/utils/pda';
import { SkeletonBlock } from './SkeletonBlock';
import { SkeletonTokenTable } from './SkeletonTokenTable';
import { usePoolData } from '@/hooks/usePoolData';
import { useAmountState } from '@/hooks/useAmountState';

export const PoolInfoDisplay = () => {
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
        userTokenBalances,
        isLoadingPublicData,
        isLoadingUserData,
        error,
        refreshPublicData,
        refreshUserData,
        refreshAllData,
    } = usePoolData({
        program,
        provider,
        readOnlyProvider,
        connection,
        wallet,
    });

    const {
        depositAmounts,
        withdrawAmounts,
        handleAmountChange,
        handleClearInput,
    } = useAmountState();

    // --- State Synchronization Logic --- START
    const prevLoadingPublicRef = useRef(isLoadingPublicData);
    const prevLoadingUserRef = useRef(isLoadingUserData);
    const [isAwaitingPostLoadProcessing, setIsAwaitingPostLoadProcessing] = useState(false);

    useEffect(() => {
        // If loading just finished (flags went from true to false)
        if ((prevLoadingPublicRef.current && !isLoadingPublicData) || (prevLoadingUserRef.current && !isLoadingUserData)) {
            // console.log("PoolInfoDisplay: Loading flags turned false. Setting awaiting flag.");
            setIsAwaitingPostLoadProcessing(true);
        }

        // Update previous refs *after* comparison
        prevLoadingPublicRef.current = isLoadingPublicData;
        prevLoadingUserRef.current = isLoadingUserData;
    }, [isLoadingPublicData, isLoadingUserData]);

    useEffect(() => {
        // If we were awaiting processing, and processedTokenData is now available (and presumably updated)
        // Or if loading started again while awaiting (edge case)
        if (isAwaitingPostLoadProcessing) {
            // Check if data is ready OR loading restarted OR data became null unexpectedly
            if (processedTokenData || isLoadingPublicData || isLoadingUserData || (!processedTokenData && !isLoadingPublicData && !isLoadingUserData)) {
                 // Use setTimeout to delay clearing the flag slightly
                 const timer = setTimeout(() => {
                    // Double-check the condition inside the timeout in case state changed again rapidly
                    // We only want to clear if we are *still* awaiting and the condition holds
                    if (isAwaitingPostLoadProcessing && (processedTokenData || isLoadingPublicData || isLoadingUserData || (!processedTokenData && !isLoadingPublicData && !isLoadingUserData))) {
                        // console.log("PoolInfoDisplay (setTimeout): Clearing awaiting flag.");
                        setIsAwaitingPostLoadProcessing(false);
                    }
                 }, 0); // 0ms delay, pushes to next event loop tick

                 return () => clearTimeout(timer); // Cleanup timeout if component unmounts or effect re-runs
            }
        }
    }, [processedTokenData, isAwaitingPostLoadProcessing, isLoadingPublicData, isLoadingUserData]);

    // Determine the effective loading state to pass down and use locally
    const effectiveIsLoadingPublic = isLoadingPublicData || isAwaitingPostLoadProcessing;
    const effectiveIsLoadingUser = isLoadingUserData || isAwaitingPostLoadProcessing;
    // --- State Synchronization Logic --- END

    const refreshUserBalances = useCallback(async (affectedMintAddress?: string) => {
        console.log(`PoolInfoDisplay: Triggering FULL data refresh via hook. Affected: ${affectedMintAddress ?? 'None'}`);
        await refreshAllData();
    }, [refreshAllData]);

    const {
        handleDeposit: actualHandleDeposit,
        handleWithdraw: actualHandleWithdraw,
        isDepositing,
        isWithdrawing
    } = usePoolInteractions({
        program,
        poolConfig,
        poolConfigPda,
        oracleData,
        onTransactionSuccess: refreshUserBalances,
        onClearInput: handleClearInput
    });

    const disabledDeposit = useCallback(async () => { alert('Pool data loading...'); }, []);
    const disabledWithdraw = useCallback(async () => { alert('Pool data loading...'); }, []);
    const interactionsReady = !!program && !!wallet.publicKey && !!poolConfig && !!poolConfigPda && !!oracleData;

    // --- MOVED UP: Calculate token lists using useMemo *before* conditional returns ---
    const { activeTokens, delistedTokens } = useMemo(() => {
        if (!processedTokenData) return { activeTokens: [], delistedTokens: [] };
        
        const active: ProcessedTokenData[] = [];
        const delisted: ProcessedTokenData[] = [];

        processedTokenData.forEach(token => {
            if (token.isDelisted) {
                delisted.push(token);
            } else {
                active.push(token);
            }
        });

        delisted.sort((a, b) => a.symbol.localeCompare(b.symbol));

        return { activeTokens: active, delistedTokens: delisted };
    }, [processedTokenData]);

    // Determine if we should show the full initial skeleton state
    const showInitialSkeletons = effectiveIsLoadingPublic && !processedTokenData;

    // Determine if we should show the "could not process" message
    const showProcessingError = !effectiveIsLoadingPublic && !error && processedTokenData === null;

    if (showInitialSkeletons) {
        // Render full skeleton UI only on initial load when no data exists yet
        return (
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-md max-w-4xl mx-auto mt-10 font-[family-name:var(--font-geist-mono)] relative">
                <h2 className="text-2xl font-bold mb-4 text-center border-b border-gray-600 pb-2">
                     Pool Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mb-6 bg-gray-700 p-4 rounded">
                    <div><SkeletonBlock className="h-6 w-3/4 mx-auto mb-1" /> <SkeletonBlock className="h-6 w-1/2 mx-auto" /></div>
                    <div><SkeletonBlock className="h-6 w-3/4 mx-auto mb-1" /> <SkeletonBlock className="h-6 w-1/2 mx-auto" /></div>
                    <div><SkeletonBlock className="h-6 w-3/4 mx-auto mb-1" /> <SkeletonBlock className="h-6 w-1/2 mx-auto" /></div>
                </div>
                <div className="mt-6 border-t border-gray-600 pt-4">
                     <h3 className="text-lg font-semibold text-center text-yellow-400 mb-3">
                     Top 30 Tokens
                     </h3>
                    <SkeletonTokenTable rowCount={5} />
                </div>
            </div>
        );
    }

    if (error) return <div className="text-center p-4 text-red-500">Error: {error}</div>;
    if (showProcessingError) return <div className="text-center p-4">Pool data could not be fully processed.</div>;

    // --- If we reach here, we have some processedTokenData (possibly stale during refresh) ---
    // --- Or, loading is finished and data is fresh ---

    const formattedWlqiSupply = formatRawAmountString(wLqiSupply, wLqiDecimals, true, 2);
    const formattedWlqiValue = formatScaledBnToDollarString(wLqiValueScaled, USD_SCALE);
    const formattedTvl = formatScaledBnToDollarString(totalPoolValueScaled, USD_SCALE);

    const openFaucet = () => {
        window.open('https://i-jac.github.io/faucet-frontend/', '_blank', 'noopener,noreferrer');
    };

    // Render the main UI, potentially indicating refresh state via button disable
    return (
        <div className="bg-gray-800 text-white p-6 rounded-lg shadow-md max-w-4xl mx-auto mt-10 font-[family-name:var(--font-geist-mono)] relative">
            <button 
                onClick={openFaucet}
                className="absolute top-4 left-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm"
            >
                Dev Faucet
            </button>
            <button 
                onClick={refreshAllData}
                className="absolute top-4 right-4 bg-purple-600 hover:bg-purple-700 text-white font-bold py-1 px-3 rounded text-sm disabled:opacity-50"
                disabled={effectiveIsLoadingPublic || effectiveIsLoadingUser}
            >
                {effectiveIsLoadingPublic || effectiveIsLoadingUser ? 'Refreshing...' : 'Refresh Data'}
            </button>

            <h2 className="text-2xl font-bold mb-4 text-center border-b border-gray-600 pb-2">Pool Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mb-6 bg-gray-700 p-4 rounded">
                 {/* Show current (possibly stale) values during refresh, or skeleton if value is null */}
                <div><h4 className="text-lg font-semibold text-purple-400">wLQI Token Value</h4><div className="text-xl font-bold">{formattedWlqiValue ?? <SkeletonBlock className="h-6 w-1/2 mx-auto"/>}</div></div>
                <div><h4 className="text-lg font-semibold text-green-400">wLQI Total Supply</h4><div className="text-xl font-bold">{formattedWlqiSupply ?? <SkeletonBlock className="h-6 w-1/2 mx-auto"/>}</div></div>
                <div><h4 className="text-lg font-semibold text-yellow-400">Total Pool Value (TVL)</h4><div className="text-xl font-bold">{formattedTvl ?? <SkeletonBlock className="h-6 w-1/2 mx-auto"/>}</div></div>
            </div>
            <div className="mt-6 border-t border-gray-600 pt-4">
                <h3 className="text-lg font-semibold text-center text-yellow-400 mb-3">Top 30 Tokens</h3>
                 {/* Pass activeTokens which comes from processedTokenData */}
                 {activeTokens.length > 0 ? (
                     <TokenTable
                         tokenData={activeTokens}
                         totalPoolValueScaled={totalPoolValueScaled}
                         wLqiValueScaled={wLqiValueScaled}
                         wLqiDecimals={wLqiDecimals}
                         userWlqiBalance={userWlqiBalance}
                         onDeposit={interactionsReady ? actualHandleDeposit : disabledDeposit}
                         onWithdraw={interactionsReady ? actualHandleWithdraw : disabledWithdraw}
                         isDepositing={isDepositing}
                         isWithdrawing={isWithdrawing}
                         depositAmounts={depositAmounts}
                         withdrawAmounts={withdrawAmounts}
                         handleAmountChange={handleAmountChange}
                         isLoadingUserData={effectiveIsLoadingUser}
                         isLoadingPublicData={effectiveIsLoadingPublic}
                     />
                 ) : (
                     // Handle case where there was data, but now it's empty after refresh (or initially empty)
                     <div className="text-center text-gray-400 italic p-4">
                          {(effectiveIsLoadingPublic || effectiveIsLoadingUser) ? "Refreshing tokens..." : "No active token data found."}
                     </div>
                 )}
            </div>

            {delistedTokens.length > 0 && (
                <div className="mt-8 border-t border-dashed border-gray-500 pt-4">
                    <h3 className="text-lg font-semibold text-center text-gray-400 mb-3">Delisted Tokens (Not In Top 30)</h3>
                     <TokenTable
                         tokenData={delistedTokens}
                         totalPoolValueScaled={totalPoolValueScaled}
                         wLqiValueScaled={wLqiValueScaled}
                         wLqiDecimals={wLqiDecimals}
                         userWlqiBalance={userWlqiBalance}
                         onDeposit={async () => { alert('Deposits disabled for delisted tokens.')}}
                         onWithdraw={interactionsReady ? actualHandleWithdraw : disabledWithdraw}
                         isDepositing={false}
                         isWithdrawing={isWithdrawing}
                         depositAmounts={{}}
                         withdrawAmounts={withdrawAmounts}
                         handleAmountChange={handleAmountChange}
                         isLoadingUserData={effectiveIsLoadingUser}
                         isLoadingPublicData={effectiveIsLoadingPublic}
                         hideDepositColumn={true}
                     />
                </div>
            )}
        </div>
    );
};