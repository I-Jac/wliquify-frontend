'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useAnchorProgram } from '@/hooks/useAnchorProgram';
import { useWallet } from '@solana/wallet-adapter-react';
import {
    USD_SCALE,
} from '@/utils/constants';
import {
    ProcessedTokenData,
    formatScaledBnToDollarString,
    formatRawAmountString,
} from '@/utils/calculations';
import { TokenTable } from './TokenTable';
import { usePoolInteractions } from '@/hooks/usePoolInteractions';
import { SkeletonBlock } from './SkeletonBlock';
import { SkeletonTokenTable } from './SkeletonTokenTable';
import { useAmountState } from '@/hooks/useAmountState';
import { PoolConfig, AggregatedOracleDataDecoded } from '@/utils/types';

// --- Define Props Interface ---
export interface PoolInfoDisplayProps {
    poolConfig: PoolConfig | null;
    poolConfigPda: PublicKey | null;
    oracleData: AggregatedOracleDataDecoded | null;
    wLqiSupply: BN | null;
    wLqiDecimals: number | null;
    processedTokenData: ProcessedTokenData[] | null;
    totalPoolValueScaled: BN | null;
    wLqiValueScaled: BN | null;
    userWlqiBalance: BN | null;
    isLoadingPublicData: boolean;
    isLoadingUserData: boolean;
    error: string | null;
    refreshAllData: () => Promise<void> | void;
}

// --- Adjust the component signature to accept props ---
export const PoolInfoDisplay = ({
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
    refreshAllData // Receive refresh function as prop
}: PoolInfoDisplayProps) => {
    // Hooks not related to usePoolData
    const { program } = useAnchorProgram(); // Keep if needed by usePoolInteractions
    const wallet = useWallet(); // Keep if needed by usePoolInteractions

    const {
        depositAmounts,
        withdrawAmounts,
        handleAmountChange,
        handleClearInput,
    } = useAmountState();

    // --- State Synchronization Logic --- START (Uses props now)
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

    // --- Pass refreshAllData prop down to usePoolInteractions ---
    const refreshUserBalances = useCallback(async (affectedMintAddress?: string) => {
        console.log(`PoolInfoDisplay: Triggering FULL data refresh via prop. Affected: ${affectedMintAddress ?? 'None'}`);
        await refreshAllData(); // Use the prop
    }, [refreshAllData]);

    const {
        handleDeposit: actualHandleDeposit,
        handleWithdraw: actualHandleWithdraw,
        isDepositing,
        isWithdrawing
    } = usePoolInteractions({
        program, // Make sure useAnchorProgram is still available/needed
        poolConfig, // Now from props
        poolConfigPda, // Now from props
        oracleData, // Now from props
        onTransactionSuccess: refreshUserBalances, // Use the wrapped refresh function
        onClearInput: handleClearInput
    });

    const disabledDeposit = useCallback(async () => { alert('Pool data loading...'); }, []);
    const disabledWithdraw = useCallback(async () => { alert('Pool data loading...'); }, []);
    // Check dependencies using props and wallet
    const interactionsReady = !!program && !!wallet.publicKey && !!poolConfig && !!poolConfigPda && !!oracleData;

    // --- MOVED UP: Calculate token lists using useMemo *before* conditional returns --- (Uses props)
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
    }, [processedTokenData]); // Use prop

    // Determine if we should show the full initial skeleton state (Uses props)
    const showInitialSkeletons = effectiveIsLoadingPublic && !processedTokenData;

    // Determine if we should show the "could not process" message (Uses props)
    const showProcessingError = !effectiveIsLoadingPublic && !error && processedTokenData === null;

    if (showInitialSkeletons) {
        // Render full skeleton UI only on initial load when no data exists yet
        return (
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-md max-w-4xl mx-auto mt-10 font-[family-name:var(--font-geist-mono)]">
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

    if (error) return <div className="text-center p-4 text-red-500">Error: {error}</div>; // Use error prop
    if (showProcessingError) return <div className="text-center p-4">Pool data could not be fully processed.</div>;

    // --- Data Formatting (Uses props) ---
    const formattedWlqiSupply = formatRawAmountString(wLqiSupply, wLqiDecimals, true, 2);
    const formattedWlqiValue = formatScaledBnToDollarString(wLqiValueScaled, USD_SCALE);
    const formattedTvl = formatScaledBnToDollarString(totalPoolValueScaled, USD_SCALE);

    // Render the main UI, potentially indicating refresh state via button disable
    return (
        <div className="bg-gray-800 text-white p-6 rounded-lg shadow-md max-w-4xl mx-auto mt-10 font-[family-name:var(--font-geist-mono)]">
            <h2 className="text-2xl font-bold mb-4 text-center border-b border-gray-600 pb-2">Pool Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mb-6 bg-gray-700 p-4 rounded">
                 {/* Show current (possibly stale) values during refresh, or skeleton if value is null (Uses props) */}
                <div><h4 className="text-lg font-semibold text-purple-400">wLQI Token Value</h4><div className="text-xl font-bold">{formattedWlqiValue ?? <SkeletonBlock className="h-6 w-1/2 mx-auto"/>}</div></div>
                <div><h4 className="text-lg font-semibold text-green-400">wLQI Total Supply</h4><div className="text-xl font-bold">{formattedWlqiSupply ?? <SkeletonBlock className="h-6 w-1/2 mx-auto"/>}</div></div>
                <div><h4 className="text-lg font-semibold text-yellow-400">Total Pool Value (TVL)</h4><div className="text-xl font-bold">{formattedTvl ?? <SkeletonBlock className="h-6 w-1/2 mx-auto"/>}</div></div>
            </div>
            <div className="mt-6 border-t border-gray-600 pt-4">
                <h3 className="text-lg font-semibold text-center text-yellow-400 mb-3">Top 30 Tokens</h3>
                 {/* Pass activeTokens which comes from processedTokenData prop */}
                 {activeTokens.length > 0 ? (
                     <TokenTable
                         tokenData={activeTokens}
                         totalPoolValueScaled={totalPoolValueScaled} // from prop
                         wLqiValueScaled={wLqiValueScaled} // from prop
                         wLqiDecimals={wLqiDecimals} // from prop
                         userWlqiBalance={userWlqiBalance} // from prop - Check TokenTable usage
                         onDeposit={interactionsReady ? actualHandleDeposit : disabledDeposit}
                         onWithdraw={interactionsReady ? actualHandleWithdraw : disabledWithdraw}
                         isDepositing={isDepositing}
                         isWithdrawing={isWithdrawing}
                         depositAmounts={depositAmounts}
                         withdrawAmounts={withdrawAmounts}
                         handleAmountChange={handleAmountChange}
                         isLoadingUserData={effectiveIsLoadingUser} // from prop
                         isLoadingPublicData={effectiveIsLoadingPublic} // from prop
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
                         totalPoolValueScaled={totalPoolValueScaled} // from prop
                         wLqiValueScaled={wLqiValueScaled} // from prop
                         wLqiDecimals={wLqiDecimals} // from prop
                         userWlqiBalance={userWlqiBalance} // from prop
                         onDeposit={async () => { alert('Deposits disabled for delisted tokens.')}}
                         onWithdraw={interactionsReady ? actualHandleWithdraw : disabledWithdraw}
                         isDepositing={false} // Correct
                         isWithdrawing={isWithdrawing} // Correct
                         depositAmounts={{}} // Correct
                         withdrawAmounts={withdrawAmounts} // Correct
                         handleAmountChange={handleAmountChange} // Correct
                         isLoadingUserData={effectiveIsLoadingUser} // from prop
                         isLoadingPublicData={effectiveIsLoadingPublic} // from prop
                         hideDepositColumn={true} // Correct
                     />
                </div>
            )}
        </div>
    );
};