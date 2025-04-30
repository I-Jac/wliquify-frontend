'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { BN } from '@coral-xyz/anchor';
import { formatUnits, parseUnits } from 'ethers'; // Import formatUnits and parseUnits
import {
    ProcessedTokenData,
    calculateTokenValueUsdScaled,
    calculateTotalTargetDominance,
    calculateTargetPercentageScaled,
    calculateActualPercentageScaled,
    formatScaledBnToDollarString,
    formatRawAmountString,
    formatScaledToPercentageString,
    // formatPercentageString, // Remove unused
    // calculateTotalPoolValue, // Remove unused
    // calculateWLqiValue, // Remove unused
    // decodePriceData, // Remove unused
} from '@/utils/calculations';
import { USD_SCALE } from '@/utils/constants';

// --- Component Props ---
interface TokenTableProps {
    tokenData: ProcessedTokenData[] | null;
    totalPoolValueScaled: BN | null;
    wLqiValueScaled: BN | null; // ADDED: Prop for wLQI value
    wLqiDecimals: number | null; // ADDED: Prop for wLQI decimals
    userWlqiBalance: BN | null; // ADDED: Prop for User's wLQI Balance
    onDeposit: (mintAddress: string, amountString: string, decimals: number | null) => Promise<void>;
    onWithdraw: (mintAddress: string, amountString: string, decimals: number | null) => Promise<void>; // Note: 3rd arg (decimals) might be irrelevant for withdraw if amount is wLQI
    isDepositing: boolean;
    isWithdrawing: boolean;
    depositAmounts: Record<string, string>;
    withdrawAmounts: Record<string, string>;
    handleAmountChange: (mintAddress: string, action: 'deposit' | 'withdraw', amount: string) => void;
}

// Define type for sortable keys
type SortableKey = 'symbol' | 'value' | 'actualPercent' | 'targetPercent';

// --- Constants for Button Colors ---
const BTN_GREEN = "bg-green-600 hover:bg-green-700";
const BTN_RED = "bg-red-600 hover:bg-red-700";
const BTN_GRAY = "bg-gray-500 hover:bg-gray-600 cursor-not-allowed"; // Neutral/disabled look

// --- Fee Estimation Constants ---
const BASE_FEE_BPS = 10; // 0.1%
const BPS_SCALE = 10000; // For converting BPS to decimal percentage
const DOMINANCE_SCALE = new BN(10_000_000_000); // 10^10, matching Rust constant
const FEE_K_FACTOR_NUMERATOR = 2; // k = 0.2
const FEE_K_FACTOR_DENOMINATOR = 10;
const DEPOSIT_PREMIUM_CAP_BPS = -500; // -5%
const WITHDRAW_FEE_FLOOR_BPS = 0;     // 0%

// --- Calculation Helper --- 

/**
 * Calculates relative deviation scaled by BPS_SCALE (1e4).
 * Inputs are scaled by DOMINANCE_SCALE (1e10).
 * Returns number representing BPS.
 */
const calculateRelativeDeviationBps = (actualDominanceScaled: BN, targetDominanceScaled: BN): number => {
    if (targetDominanceScaled.isZero() || targetDominanceScaled.isNeg()) {
        // Avoid division by zero. If target is 0, deviation is large if actual > 0.
        return actualDominanceScaled.gtn(0) ? (BPS_SCALE * 100) : 0; // Use gtn(0) instead of isPos
    }
    try {
        const deviationScaled = actualDominanceScaled.sub(targetDominanceScaled);
        // Scale deviation by BPS_SCALE before dividing by target dominance
        // Use toNumber() carefully, might lose precision on extremely large intermediate numbers
        // but should be okay for dominance values.
        const deviationBps = deviationScaled.mul(new BN(BPS_SCALE)).div(targetDominanceScaled);
        return deviationBps.toNumber();
    } catch (e) {
        console.error("Error calculating relative deviation BPS:", e);
        return 0; // Return 0 on error
    }
};

// --- TokenTable Component ---
export const TokenTable: React.FC<TokenTableProps> = ({
    tokenData,
    totalPoolValueScaled,
    wLqiValueScaled, // Destructure new prop
    wLqiDecimals,    // Destructure new prop
    userWlqiBalance, // Destructure new prop
    onDeposit,
    onWithdraw,
    isDepositing,
    isWithdrawing,
    depositAmounts,
    withdrawAmounts,
    handleAmountChange
}) => {

    // --- Sorting State ---
    const [sortKey, setSortKey] = useState<SortableKey | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    // Calculate total target dominance once using useMemo
    const totalTargetDominance = useMemo(() => {
        if (!tokenData) return new BN(0);
        return calculateTotalTargetDominance(tokenData);
    }, [tokenData]);

    // --- Sort Handler ---
    const handleSort = (key: SortableKey) => {
        if (sortKey === key) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    // --- Memoized Sorted Data ---
    const sortedTokenData = useMemo(() => {
        if (!tokenData) return [];

        const dataToSort = [...tokenData]; // Create a shallow copy to sort

        if (!sortKey) return dataToSort; // No sorting applied

        // Helper to get comparison values
        const getCompareValues = (token: ProcessedTokenData) => {
            // Check for null decimals before calculating value
            const tokenValueUsd = token.vaultBalance !== null && token.decimals !== null
                ? calculateTokenValueUsdScaled(token.vaultBalance, token.decimals, token.priceData)
                : null;
            const actualScaled = (tokenValueUsd && totalPoolValueScaled)
                ? calculateActualPercentageScaled(tokenValueUsd, totalPoolValueScaled)
                : new BN(0);
            // Calculate target scaled here for sorting
            const targetScaled = calculateTargetPercentageScaled(token.targetDominance, totalTargetDominance);
            return {
                symbol: token.symbol,
                value: tokenValueUsd ?? new BN(-1), // Use -1 for null value sorting
                actualPercent: actualScaled,
                targetPercent: targetScaled, // Add target for sorting
            };
        };

        dataToSort.sort((a, b) => {
            const valuesA = getCompareValues(a);
            const valuesB = getCompareValues(b);

            let compareResult = 0;
            switch (sortKey) {
                case 'symbol':
                    compareResult = valuesA.symbol.localeCompare(valuesB.symbol);
                    break;
                case 'value':
                    compareResult = valuesA.value.cmp(valuesB.value);
                    break;
                case 'actualPercent':
                    compareResult = valuesA.actualPercent.cmp(valuesB.actualPercent);
                    break;
                case 'targetPercent': // Added sort case
                    compareResult = valuesA.targetPercent.cmp(valuesB.targetPercent);
                    break;
            }
            return sortDirection === 'asc' ? compareResult : -compareResult;
        });

        return dataToSort;
    }, [tokenData, sortKey, sortDirection, totalPoolValueScaled, totalTargetDominance]);

    // Add handlers for the MAX/HALF buttons (using handleAmountChange prop)
    const handleSetAmount = useCallback((mintAddress: string, action: 'deposit' | 'withdraw', fraction: number) => {
        // Add null check for tokenData
        if (!tokenData) return;

        let amountToSet = '0';
        // Find token data only needed for deposit action
        const token = action === 'deposit' ? tokenData.find(t => t.mintAddress === mintAddress) : null; 
        
        if (action === 'deposit') {
            if (!token || token.userBalance === null || token.decimals === null) return;
            const fullAmountBn = token.userBalance;
            const targetAmountBn = fraction === 1 ? fullAmountBn : fullAmountBn.div(new BN(2));
            // Use token.decimals for formatting deposit amount
            amountToSet = formatUnits(targetAmountBn.toString(), token.decimals);
        } else { // withdraw (wLQI)
            if (!userWlqiBalance || wLqiDecimals === null) return;
            const fullAmountBn = userWlqiBalance;
            const targetAmountBn = fraction === 1 ? fullAmountBn : fullAmountBn.div(new BN(2));
            // Use wLqiDecimals for formatting withdraw amount (wLQI)
            amountToSet = formatUnits(targetAmountBn.toString(), wLqiDecimals);
        }
        
        // Remove trailing .0 if present
        if (amountToSet.endsWith('.0')) {
            amountToSet = amountToSet.substring(0, amountToSet.length - 2);
        }

        handleAmountChange(mintAddress, action, amountToSet);
    }, [tokenData, userWlqiBalance, wLqiDecimals, handleAmountChange]); // Add dependencies

    // Null check for tokenData before rendering table
    if (!tokenData) {
        return <div className="text-center text-gray-400 italic p-4">Processing token data...</div>;
    }

    if (sortedTokenData.length === 0) {
        return <div className="text-center text-gray-400 italic p-4">No token data available.</div>;
    }

    // --- Render Logic ---
    const getSortIndicator = (key: SortableKey): string => {
        if (sortKey !== key) return '';
        return sortDirection === 'asc' ? ' ▲' : ' ▼';
    };

    // Define renderRow function accepting index
    const renderRow = (token: ProcessedTokenData, index: number) => {
        // Destructure token object inside the function
        const { mintAddress, symbol, priceData, vaultBalance, decimals, targetDominance } = token;

        // --- Recalculate values needed for display --- 
        const tokenValueUsd = vaultBalance !== null && decimals !== null
           ? calculateTokenValueUsdScaled(vaultBalance, decimals, priceData)
           : null;
        const targetScaled = calculateTargetPercentageScaled(targetDominance, totalTargetDominance);
        const actualScaled = (tokenValueUsd && totalPoolValueScaled && !totalPoolValueScaled.isZero()) // Check totalPoolValueScaled null/zero
           ? calculateActualPercentageScaled(tokenValueUsd, totalPoolValueScaled)
           : new BN(0);

        // --- Get Input Values ---
        const currentDepositAmount = depositAmounts[mintAddress] || '';
        const currentWithdrawAmount = withdrawAmounts[mintAddress] || '';
        const isDepositInputFilled = currentDepositAmount !== '' && parseFloat(currentDepositAmount) > 0;
        const isWithdrawInputFilled = currentWithdrawAmount !== '' && parseFloat(currentWithdrawAmount) > 0;

        // --- Advanced Fee Calculation ---
        let estimatedDepositFeeBps = BASE_FEE_BPS; // Default for Deposit
        let estimatedWithdrawFeeBps = BASE_FEE_BPS; // Default for Withdraw
        let withdrawalExceedsLiquidity = false; 

        try {
             const targetDominanceScaledBn = (totalTargetDominance && !totalTargetDominance.isZero())
                ? targetDominance.mul(DOMINANCE_SCALE).div(totalTargetDominance)
                : new BN(0);
             const actualDomPreScaled = (tokenValueUsd && totalPoolValueScaled && !totalPoolValueScaled.isZero())
                ? tokenValueUsd.mul(DOMINANCE_SCALE).div(totalPoolValueScaled)
                : new BN(0);
             const relDevPreBps = calculateRelativeDeviationBps(actualDomPreScaled, targetDominanceScaledBn);
             const dynamicFeePreBps = relDevPreBps * FEE_K_FACTOR_NUMERATOR / FEE_K_FACTOR_DENOMINATOR;

             // --- Calculate Deposit Fee Estimate ---
             if (isDepositInputFilled && decimals !== null && priceData && totalPoolValueScaled && !totalPoolValueScaled.isZero()) {
                 let valueChangeUsdScaled = new BN(0);
                 try {
                     const inputAmountBn = new BN(parseUnits(currentDepositAmount, decimals).toString());
                     valueChangeUsdScaled = calculateTokenValueUsdScaled(inputAmountBn, decimals, priceData);
                     
                     if (!valueChangeUsdScaled.isZero()) {
                         const totalPoolValuePostScaled = totalPoolValueScaled.add(valueChangeUsdScaled);
                         const tokenValuePostScaled = (tokenValueUsd ?? new BN(0)).add(valueChangeUsdScaled);
                         const actualDomPostScaled = (!totalPoolValuePostScaled.isZero())
                             ? tokenValuePostScaled.mul(DOMINANCE_SCALE).div(totalPoolValuePostScaled)
                             : new BN(0);
                         const relDevPostBps = calculateRelativeDeviationBps(actualDomPostScaled, targetDominanceScaledBn);
                         const avgRelDevBps = (relDevPreBps + relDevPostBps) / 2;
                         console.log(`Deposit Fee Calc (Token: ${symbol}): PreDevBPS=${relDevPreBps}, PostDevBPS=${relDevPostBps}, AvgDevBPS=${avgRelDevBps}`); // DEBUG
                         const dynamicFeeAvgBps = avgRelDevBps * FEE_K_FACTOR_NUMERATOR / FEE_K_FACTOR_DENOMINATOR;
                         let totalFee = BASE_FEE_BPS + dynamicFeeAvgBps;
                         console.log(`Deposit Fee Calc (Token: ${symbol}): Base=${BASE_FEE_BPS}, Dynamic=${dynamicFeeAvgBps}, TotalBeforeCap=${totalFee}`); // DEBUG
                         totalFee = Math.max(totalFee, DEPOSIT_PREMIUM_CAP_BPS);
                         estimatedDepositFeeBps = Math.round(totalFee);
                         console.log(`Deposit Fee Calc (Token: ${symbol}): FinalBPS=${estimatedDepositFeeBps}`); // DEBUG
                     } else {
                        // Value change is zero, use pre-state fee
                        let totalFeePre = BASE_FEE_BPS + dynamicFeePreBps;
                        totalFeePre = Math.max(totalFeePre, DEPOSIT_PREMIUM_CAP_BPS);
                        estimatedDepositFeeBps = Math.round(totalFeePre);
                     }
                 } catch /* (error) Remove unused var */ { /* Fallback handled below */ }
             } else {
                 // No deposit amount or missing data, use pre-state fee
                 let totalFeePre = BASE_FEE_BPS + dynamicFeePreBps;
                 totalFeePre = Math.max(totalFeePre, DEPOSIT_PREMIUM_CAP_BPS);
                 estimatedDepositFeeBps = Math.round(totalFeePre);
             }

             // --- Calculate Withdraw Fee Estimate ---
             if (isWithdrawInputFilled && wLqiDecimals !== null && wLqiValueScaled && priceData && decimals !== null && vaultBalance && totalPoolValueScaled && !totalPoolValueScaled.isZero()) {
                 let valueChangeUsdScaled = new BN(0);
                 let requiredTokenAmount = new BN(0);
                 try {
                     // Check liquidity first
                     const inputWlqiAmountBn = new BN(parseUnits(currentWithdrawAmount, wLqiDecimals).toString());
                     const scaleFactorWlqi = new BN(10).pow(new BN(wLqiDecimals));
                     if (!scaleFactorWlqi.isZero()) {
                         valueChangeUsdScaled = inputWlqiAmountBn.mul(wLqiValueScaled).div(scaleFactorWlqi);
                     }
                     if (!valueChangeUsdScaled.isZero() && priceData.price.gtn(0)) {
                         const price_u128 = priceData.price;
                         const expo = priceData.expo;
                         const total_exponent: number = expo + USD_SCALE;
                         let final_numerator = valueChangeUsdScaled.mul(new BN(10).pow(new BN(decimals)));
                         let final_denominator = price_u128;
                         if (total_exponent >= 0) { final_denominator = price_u128.mul(new BN(10).pow(new BN(total_exponent))); }
                         else { final_numerator = final_numerator.mul(new BN(10).pow(new BN(Math.abs(total_exponent)))); }
                         if (!final_denominator.isZero()) {
                             requiredTokenAmount = final_numerator.div(final_denominator);
                             console.log(`Liquidity Check (Token: ${symbol}): Required=${requiredTokenAmount.toString()}, Vault=${vaultBalance?.toString() ?? 'N/A'}`); // DEBUG
                             if (vaultBalance && requiredTokenAmount.gt(vaultBalance)) { // Check vaultBalance exists
                                 withdrawalExceedsLiquidity = true;
                                 console.log(`----> Liquidity Exceeded for ${symbol}!`); // DEBUG
                             }
                         }
                     }
                     // If liquidity check passed, calculate fee
                     if (!withdrawalExceedsLiquidity && !valueChangeUsdScaled.isZero()) {
                        const totalPoolValuePostScaled = totalPoolValueScaled.gt(valueChangeUsdScaled) ? totalPoolValueScaled.sub(valueChangeUsdScaled) : new BN(0);
                        const currentTokenValue = tokenValueUsd ?? new BN(0);
                        const tokenValuePostScaled = currentTokenValue.gt(valueChangeUsdScaled) ? currentTokenValue.sub(valueChangeUsdScaled) : new BN(0);
                        const actualDomPostScaled = (!totalPoolValuePostScaled.isZero()) ? tokenValuePostScaled.mul(DOMINANCE_SCALE).div(totalPoolValuePostScaled) : new BN(0);
                        const relDevPostBps = calculateRelativeDeviationBps(actualDomPostScaled, targetDominanceScaledBn);
                        const avgRelDevBps = (relDevPreBps + relDevPostBps) / 2;
                        console.log(`Withdraw Fee Calc (Token: ${symbol}): PreDevBPS=${relDevPreBps}, PostDevBPS=${relDevPostBps}, AvgDevBPS=${avgRelDevBps}`); // DEBUG
                        console.log(`Withdraw Fee Calc (Token: ${token.symbol}): PreDevBPS=${relDevPreBps}, PostDevBPS=${relDevPostBps}, AvgDevBPS=${avgRelDevBps}`); // DEBUG
                        const dynamicFeeAvgBps = avgRelDevBps * FEE_K_FACTOR_NUMERATOR / FEE_K_FACTOR_DENOMINATOR;
                        let totalFee = BASE_FEE_BPS - dynamicFeeAvgBps;
                        console.log(`Withdraw Fee Calc (Token: ${token.symbol}): Base=${BASE_FEE_BPS}, Dynamic=${dynamicFeeAvgBps}, TotalBeforeFloor=${totalFee}`); // DEBUG
                        totalFee = Math.max(totalFee, WITHDRAW_FEE_FLOOR_BPS);
                        estimatedWithdrawFeeBps = Math.round(totalFee);
                        console.log(`Withdraw Fee Calc (Token: ${token.symbol}): FinalBPS=${estimatedWithdrawFeeBps}`); // DEBUG
                     } else if (!withdrawalExceedsLiquidity) {
                        // Value change zero or liquidity check failed somehow, use pre-state fee
                        let totalFeePre = BASE_FEE_BPS - dynamicFeePreBps;
                        totalFeePre = Math.max(totalFeePre, WITHDRAW_FEE_FLOOR_BPS);
                        estimatedWithdrawFeeBps = Math.round(totalFeePre);
                     }
                     // If withdrawalExceedsLiquidity is true, fee remains default (BASE_FEE) but button will be disabled/show error
                 } catch /* (error) Remove unused var */ { /* Fallback handled below */ }
            } else {
                // No withdraw amount or missing data, use pre-state fee
                let totalFeePre = BASE_FEE_BPS - dynamicFeePreBps;
                totalFeePre = Math.max(totalFeePre, WITHDRAW_FEE_FLOOR_BPS);
                estimatedWithdrawFeeBps = Math.round(totalFeePre);
            }

        } catch(e) {
            console.error("Error calculating fee estimate:", e);
            // Fallback to base fee for both on any error
            estimatedDepositFeeBps = BASE_FEE_BPS;
            estimatedWithdrawFeeBps = BASE_FEE_BPS;
        }

        // --- Disable Buttons/Inputs Logic ---
        const actionDisabled = isDepositing || isWithdrawing;
        const depositButtonDisabled = actionDisabled || !isDepositInputFilled;
        const withdrawButtonDisabled = actionDisabled || !isWithdrawInputFilled || withdrawalExceedsLiquidity;

        // --- Determine Button Colors (Based on Estimated Fee) ---
        let depositBtnClass = BTN_GRAY; // Default
        if (estimatedDepositFeeBps <= BASE_FEE_BPS) {
            depositBtnClass = BTN_GREEN; // Bonus or base fee
        } else {
            depositBtnClass = BTN_RED; // Penalty
        }

        let withdrawBtnClass = BTN_GRAY; // Default
        if (withdrawalExceedsLiquidity) {
            // Keep gray if liquidity exceeded (also handled by disabled)
        } else if (estimatedWithdrawFeeBps <= BASE_FEE_BPS) {
            withdrawBtnClass = BTN_GREEN; // Bonus or base fee
        } else {
            withdrawBtnClass = BTN_RED; // Penalty
        }

        // --- Formatting & USD Value Calcs --- 
        const displayBalance = formatRawAmountString(vaultBalance?.toString(), decimals, true, 2); 
        const displayValue = formatScaledBnToDollarString(tokenValueUsd, USD_SCALE);
        const displaySymbol = symbol;
        const displayTargetPercent = formatScaledToPercentageString(targetScaled);
        const displayActualPercent = formatScaledToPercentageString(actualScaled);
        
        // Re-add formatting for user's token balance
        const formattedUserTokenBalance = formatRawAmountString(token.userBalance?.toString(), decimals, true, 2);
        const displayUserTokenBalance = formattedUserTokenBalance ? `${formattedUserTokenBalance} ${symbol}` : 'N/A';

        // Re-add formatting for user's wLQI balance
        const formattedUserWlqiBalance = formatRawAmountString(userWlqiBalance?.toString(), wLqiDecimals, true, 2);
        const displayUserWlqiBalance = formattedUserWlqiBalance ? `${formattedUserWlqiBalance} wLQI` : 'N/A';

        let displayDepositInputUsdValue = '$ --.--';
        if (isDepositInputFilled && decimals !== null && priceData) {
           try {
                const inputAmountBn = new BN(parseUnits(currentDepositAmount, decimals).toString());
                const inputUsdValueScaled = calculateTokenValueUsdScaled(inputAmountBn, decimals, priceData);
                displayDepositInputUsdValue = formatScaledBnToDollarString(inputUsdValueScaled, USD_SCALE);
           } catch /* (error) Remove unused var */ { displayDepositInputUsdValue = '$ Invalid'; }
        } else if (currentDepositAmount === '' || currentDepositAmount === '0') {
           displayDepositInputUsdValue = '$ 0.00';
        }
        let displayWithdrawInputUsdValue = '$ --.--';
        if (isWithdrawInputFilled && wLqiDecimals !== null && wLqiValueScaled) {
            try {
                const inputWlqiAmountBn = new BN(parseUnits(currentWithdrawAmount, wLqiDecimals).toString());
                const scaleFactorWlqi = new BN(10).pow(new BN(wLqiDecimals));
                if (!scaleFactorWlqi.isZero()) {
                    const inputUsdValueScaled = inputWlqiAmountBn.mul(wLqiValueScaled).div(scaleFactorWlqi);
                    displayWithdrawInputUsdValue = formatScaledBnToDollarString(inputUsdValueScaled, USD_SCALE);
                }
            } catch /* (error) Remove unused var */ { displayWithdrawInputUsdValue = '$ Invalid'; }
        } else if (currentWithdrawAmount === '' || currentWithdrawAmount === '0') {
           displayWithdrawInputUsdValue = '$ 0.00';
        }

        // --- Create Fee Display Strings for Buttons ---
        let depositFeeLabel = estimatedDepositFeeBps <= BASE_FEE_BPS ? "Bonus" : "Fee";
        // Adjust label if exactly base fee
        if(estimatedDepositFeeBps === BASE_FEE_BPS) depositFeeLabel = "Fee"; 
        // Use absolute value for display percent if it's a bonus
        let depositDisplayRawPercent = estimatedDepositFeeBps <= BASE_FEE_BPS ? Math.abs(estimatedDepositFeeBps / (BPS_SCALE / 100)) : estimatedDepositFeeBps / (BPS_SCALE / 100);
        // Correct for base fee display being 0.10%
        if(estimatedDepositFeeBps === BASE_FEE_BPS) depositDisplayRawPercent = BASE_FEE_BPS / (BPS_SCALE / 100);

        // Format using locale string
        const depositDisplayPercentString = depositDisplayRawPercent.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const depositFeeString = `(~${depositDisplayPercentString}% ${depositFeeLabel})`;
        const depositTitle = `Est. Deposit ${depositFeeLabel}: ${depositFeeString}`;
        const depositLabel = isDepositing ? 'Depositing...' : `Deposit ${depositFeeString}`;

        let withdrawFeeLabel = estimatedWithdrawFeeBps <= BASE_FEE_BPS ? "Bonus" : "Fee";
        if(estimatedWithdrawFeeBps === BASE_FEE_BPS) withdrawFeeLabel = "Fee";
        let withdrawDisplayRawPercent = estimatedWithdrawFeeBps <= BASE_FEE_BPS ? Math.abs(estimatedWithdrawFeeBps / (BPS_SCALE / 100)) : estimatedWithdrawFeeBps / (BPS_SCALE / 100);
        if(estimatedWithdrawFeeBps === BASE_FEE_BPS) withdrawDisplayRawPercent = BASE_FEE_BPS / (BPS_SCALE / 100);
        
        // Format using locale string
        const withdrawDisplayPercentString = withdrawDisplayRawPercent.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const withdrawFeeString = `(~${withdrawDisplayPercentString}% ${withdrawFeeLabel})`;
        let withdrawTitle = `Est. Withdraw ${withdrawFeeLabel}: ${withdrawFeeString}`;
        let withdrawLabel = isWithdrawing ? 'Withdrawing...' : `Withdraw ${withdrawFeeString}`;

        if (withdrawalExceedsLiquidity) {
            // Override withdraw display for liquidity error
            withdrawTitle = "Insufficient pool liquidity";
            withdrawLabel = isWithdrawing ? 'Withdrawing...' : "Insufficient Liquidity";
        }

        // --- Prepare Button Callbacks ---
        const handleActualDeposit = () => onDeposit(mintAddress, currentDepositAmount, decimals);
        const handleActualWithdraw = () => onWithdraw(mintAddress, currentWithdrawAmount, wLqiDecimals);

        // --- Render Row --- 
        return (
            <tr key={mintAddress} className={`border-b border-gray-600 ${index % 2 === 0 ? 'bg-gray-700' : 'bg-gray-750'} hover:bg-gray-600 align-top ${actionDisabled ? 'opacity-50' : ''}`}>
                {/* Symbol - Center aligned */}
                <td className="p-2 font-semibold align-middle text-center" title={token.mintAddress}>{displaySymbol}</td>
                {/* Pool Balance - Center aligned */}
                <td className="p-2 align-middle text-center">
                    {/* Removed text-right from inner divs */}
                    <div>{displayValue}</div>
                    <div className="text-gray-400">{displayBalance} {displaySymbol}</div>
                </td>
                {/* Actual % - Center aligned */} 
                <td className="p-2 align-middle text-center">{displayActualPercent}%</td>
                {/* Target % - Center aligned */} 
                <td className="p-2 align-middle text-center">{displayTargetPercent}%</td>
                {/* --- Deposit Column - Revised Layout --- */}
                <td className="p-2 align-middle">
                    <div className="flex flex-col space-y-1"> 
                        {/* Top Row: Balance / Half / Max */} 
                        <div className="flex items-center justify-between"> 
                            <div className="text-gray-400 text-[10px] flex items-center"> 
                                {/* Wallet Icon SVG */} 
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="mr-1">
                                    <path d="M13.8205 12.2878C13.8205 12.4379 13.791 12.5865 13.7335 12.7252C13.6761 12.8638 13.5919 12.9898 13.4858 13.0959C13.3797 13.2021 13.2537 13.2863 13.115 13.3437C12.9764 13.4011 12.8278 13.4307 12.6777 13.4307H3.04911C2.746 13.4307 2.45531 13.3103 2.24099 13.0959C2.02666 12.8816 1.90625 12.5909 1.90625 12.2878V4.18992C1.90625 3.68474 2.10693 3.20026 2.46414 2.84305C2.82135 2.48584 3.30584 2.28516 3.81101 2.28516H10.3718C10.6749 2.28516 10.9656 2.40556 11.1799 2.61989C11.3942 2.83422 11.5146 3.12491 11.5146 3.42801L11.5142 4.20668H12.6777C12.8278 4.20668 12.9764 4.23624 13.115 4.29367C13.2537 4.35111 13.3797 4.43529 13.4858 4.54141C13.5919 4.64754 13.6761 4.77353 13.7335 4.91218C13.791 5.05084 13.8205 5.19946 13.8205 5.34954V12.2878ZM12.6777 5.34954H3.04911V12.2878H12.6777L12.6773 10.356H8.43996V7.28173L12.6773 7.28135V5.34992L12.6777 5.34954ZM12.6777 8.4242H9.58244V9.21316H12.6773V8.42459L12.6777 8.4242ZM10.3718 3.42801H3.81101C3.60894 3.42801 3.41515 3.50829 3.27226 3.65117C3.12938 3.79405 3.04911 3.98785 3.04911 4.18992L3.04873 4.20668H10.3714V3.42801H10.3718Z"></path>
                                </svg>
                                {/* Display formatted user token balance */}
                                <span>{displayUserTokenBalance}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                                <button
                                    onClick={() => handleSetAmount(token.mintAddress, 'deposit', 0.5)}
                                    disabled={actionDisabled || token.userBalance === null}
                                    className={`px-1 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(actionDisabled || token.userBalance === null) ? 'cursor-not-allowed opacity-50' : ''}`}
                                    title="Set amount to 50% of your balance"
                                > Half </button>
                                <button
                                    onClick={() => handleSetAmount(token.mintAddress, 'deposit', 1)}
                                    disabled={actionDisabled || token.userBalance === null}
                                    className={`px-1 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(actionDisabled || token.userBalance === null) ? 'cursor-not-allowed opacity-50' : ''}`}
                                    title="Set amount to your maximum balance"
                                > Max </button>
                            </div>
                        </div>

                        {/* Middle Row: Input Field */} 
                        <div className="flex items-center">
                            <div className="relative w-full"> {/* Wrapper for input + label */} 
                                <input
                                    id={`deposit-${mintAddress}`}
                                    type="number"
                                    step="any"
                                    min="0"
                                    placeholder={`Amount (${symbol})`} // Updated Placeholder
                                    value={currentDepositAmount}
                                    onChange={(e) => handleAmountChange(token.mintAddress, 'deposit', e.target.value)}
                                    className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 w-full text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    disabled={isDepositing || isWithdrawing} // Disable if any action is in progress
                                />
                            </div>
                        </div>

                        {/* Bottom Row: USD Value (Right Aligned) */}
                        <div className="flex justify-end"> 
                            <div className="text-gray-400 text-[10px] h-3">
                                {displayDepositInputUsdValue}
                            </div>
                        </div>
                        
                        {/* Preset Deposit Buttons */} 
                        <div className="flex space-x-1 w-full justify-end mt-1"> 
                            <button onClick={() => handleSetAmount(mintAddress, 'deposit', 0.5)} className="text-xs px-1.5 py-0.5 bg-gray-600 hover:bg-gray-500 rounded text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed" disabled={isDepositing || isWithdrawing || token.userBalance === null || token.userBalance.isZero()}>Half</button>
                            <button onClick={() => handleSetAmount(mintAddress, 'deposit', 1)} className="text-xs px-1.5 py-0.5 bg-gray-600 hover:bg-gray-500 rounded text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed" disabled={isDepositing || isWithdrawing || token.userBalance === null || token.userBalance.isZero()}>Max</button>
                        </div>

                        {/* Deposit Button */}
                        <button
                            onClick={handleActualDeposit}
                            disabled={depositButtonDisabled}
                            className={`w-full px-1 py-0.5 text-xs rounded text-white truncate ${depositBtnClass} ${depositButtonDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                            title={depositTitle}
                        >
                            {depositLabel}
                        </button>
                    </div>
                </td>
                {/* --- Withdraw Column - Revised Layout --- */}
                <td className="p-2 align-middle">
                    <div className="flex flex-col space-y-1"> 
                        {/* Top Row: Balance / Half / Max */} 
                        <div className="flex items-center justify-between"> 
                             <div className="text-gray-400 text-[10px] flex items-center"> 
                                {/* Wallet Icon SVG */} 
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="mr-1">
                                    <path d="M13.8205 12.2878C13.8205 12.4379 13.791 12.5865 13.7335 12.7252C13.6761 12.8638 13.5919 12.9898 13.4858 13.0959C13.3797 13.2021 13.2537 13.2863 13.115 13.3437C12.9764 13.4011 12.8278 13.4307 12.6777 13.4307H3.04911C2.746 13.4307 2.45531 13.3103 2.24099 13.0959C2.02666 12.8816 1.90625 12.5909 1.90625 12.2878V4.18992C1.90625 3.68474 2.10693 3.20026 2.46414 2.84305C2.82135 2.48584 3.30584 2.28516 3.81101 2.28516H10.3718C10.6749 2.28516 10.9656 2.40556 11.1799 2.61989C11.3942 2.83422 11.5146 3.12491 11.5146 3.42801L11.5142 4.20668H12.6777C12.8278 4.20668 12.9764 4.23624 13.115 4.29367C13.2537 4.35111 13.3797 4.43529 13.4858 4.54141C13.5919 4.64754 13.6761 4.77353 13.7335 4.91218C13.791 5.05084 13.8205 5.19946 13.8205 5.34954V12.2878ZM12.6777 5.34954H3.04911V12.2878H12.6777L12.6773 10.356H8.43996V7.28173L12.6773 7.28135V5.34992L12.6777 5.34954ZM12.6777 8.4242H9.58244V9.21316H12.6773V8.42459L12.6777 8.4242ZM10.3718 3.42801H3.81101C3.60894 3.42801 3.41515 3.50829 3.27226 3.65117C3.12938 3.79405 3.04911 3.98785 3.04911 4.18992L3.04873 4.20668H10.3714V3.42801H10.3718Z"></path>
                                </svg>
                                {/* Display formatted USER WlQI balance */}
                                <span>{displayUserWlqiBalance}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                                <button
                                    onClick={() => handleSetAmount(token.mintAddress, 'withdraw', 0.5)}
                                    disabled={actionDisabled || userWlqiBalance === null}
                                    className={`px-1 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(actionDisabled || userWlqiBalance === null) ? 'cursor-not-allowed opacity-50' : ''}`}
                                    title="Set amount to 50% of your wLQI balance"
                                > Half </button>
                                <button
                                    onClick={() => handleSetAmount(token.mintAddress, 'withdraw', 1)}
                                    disabled={actionDisabled || userWlqiBalance === null}
                                    className={`px-1 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(actionDisabled || userWlqiBalance === null) ? 'cursor-not-allowed opacity-50' : ''}`}
                                    title="Set amount to your maximum wLQI balance"
                                > Max </button>
                            </div>
                        </div>

                        {/* Middle Row: Input Field */} 
                        <div className="flex items-center">
                             <div className="relative w-full"> {/* Wrapper for input + label */} 
                                <input
                                    id={`withdraw-${mintAddress}`}
                                    type="number"
                                    step="any"
                                    min="0"
                                    placeholder="Amount (wLQI)" // Updated Placeholder
                                    value={currentWithdrawAmount}
                                    onChange={(e) => handleAmountChange(token.mintAddress, 'withdraw', e.target.value)}
                                    className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 w-full text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                                    disabled={isDepositing || isWithdrawing} // Disable if any action is in progress
                                />
                            </div>
                        </div>

                        {/* Bottom Row: USD Value (Right Aligned) */} 
                        <div className="flex justify-end"> 
                            <div className="text-gray-400 text-[10px] h-3">
                                {displayWithdrawInputUsdValue}
                            </div>
                        </div>

                        {/* Preset Withdraw Buttons */} 
                        <div className="flex space-x-1 w-full justify-end mt-1"> 
                            <button onClick={() => handleSetAmount(mintAddress, 'withdraw', 0.5)} className="text-xs px-1.5 py-0.5 bg-gray-600 hover:bg-gray-500 rounded text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed" disabled={isDepositing || isWithdrawing || userWlqiBalance === null || userWlqiBalance.isZero()}>Half</button>
                            <button onClick={() => handleSetAmount(mintAddress, 'withdraw', 1)} className="text-xs px-1.5 py-0.5 bg-gray-600 hover:bg-gray-500 rounded text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed" disabled={isDepositing || isWithdrawing || userWlqiBalance === null || userWlqiBalance.isZero()}>Max</button>
                        </div>

                        {/* Withdraw Button */}
                        <button
                            onClick={handleActualWithdraw}
                            disabled={withdrawButtonDisabled}
                            className={`w-full px-1 py-0.5 text-xs rounded text-white truncate ${withdrawalExceedsLiquidity ? BTN_GRAY : withdrawBtnClass} ${withdrawButtonDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                            title={withdrawTitle}
                        >
                            {withdrawLabel}
                        </button>
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full bg-gray-700 text-xs text-left table-fixed mb-2">
                <thead className="bg-gray-600">
                    <tr>
                        {/* Symbol Header - Centered */}
                        <th className="p-2 w-16 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('symbol')}>
                            Symbol{getSortIndicator('symbol')}
                        </th>
                        {/* Pool Balance Header - Centered (removed text-right) */}
                        <th className="p-2 w-32 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('value')}>
                            Pool Balance{getSortIndicator('value')}
                        </th>
                        {/* Actual % Header - Centered (removed text-right) */}
                        <th className="p-2 w-28 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('actualPercent')}>
                            Actual %{getSortIndicator('actualPercent')}
                        </th>
                        {/* Target % Header - Centered (removed text-right) */}
                        <th className="p-2 w-28 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('targetPercent')}>
                            Target %{getSortIndicator('targetPercent')}
                        </th>
                        {/* Deposit Header - Centered */}
                        <th className="p-2 w-40 text-center">Deposit</th> 
                        {/* Withdraw Header - Centered */}
                        <th className="p-2 w-40 text-center">Withdraw</th> 
                    </tr>
                </thead>
                <tbody>
                    {/* Map over sorted data, passing index to renderRow */}
                    {sortedTokenData.map((token, index) => renderRow(token, index))}
                </tbody>
            </table>
        </div>
    );
}; 