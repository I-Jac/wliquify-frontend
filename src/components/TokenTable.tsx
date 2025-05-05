'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { BN } from '@coral-xyz/anchor';
import { formatUnits, parseUnits } from 'ethers'; // Import formatUnits and parseUnits
import {
    ProcessedTokenData,
    calculateTokenValueUsdScaled,
    calculateTotalTargetDominance,
    calculateTargetPercentageScaled,
    formatScaledBnToDollarString,
    formatRawAmountString,
    formatScaledToPercentageString,
    // formatPercentageString, // Remove unused
    // calculateTotalPoolValue, // Remove unused
    // calculateWLqiValue, // Remove unused
    // decodePriceData, // Remove unused
} from '@/utils/calculations';
import { USD_SCALE } from '@/utils/constants';
import { SkeletonTokenTable } from './SkeletonTokenTable'; // Import existing skeleton
import toast from 'react-hot-toast'; // Import toast

// --- Component Props ---
interface TokenTableProps {
    tokenData: ProcessedTokenData[] | null;
    totalPoolValueScaled: BN | null;
    wLqiValueScaled: BN | null;
    wLqiDecimals: number | null;
    userWlqiBalance: BN | null;
    onDeposit: (mintAddress: string, amountString: string, decimals: number | null) => Promise<void>;
    onWithdraw: (mintAddress: string, amountString: string, isFullDelistedWithdraw?: boolean) => Promise<void>;
    isDepositing: boolean;
    isWithdrawing: boolean;
    depositAmounts: Record<string, string>;
    withdrawAmounts: Record<string, string>;
    handleAmountChange: (mintAddress: string, action: 'deposit' | 'withdraw', amount: string) => void;
    isLoadingUserData: boolean;
    isLoadingPublicData: boolean;
    hideDepositColumn?: boolean; // New prop
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
const DEPOSIT_PREMIUM_CAP_BPS = -500; // Max dynamic *discount* is 500 BPS
const WITHDRAW_FEE_FLOOR_BPS = 0;     // Min total fee is 0 BPS
const DEPOSIT_MAX_FEE_BPS = 9999; // Max total deposit fee is 99.99%
const WITHDRAW_MAX_FEE_BPS = 9999; // Max total withdraw fee is 99.99%

// Define a precision scale factor
const PRECISION_SCALE_FACTOR = new BN(10).pow(new BN(12)); // 1e12 for high precision

// BN versions for precise calculations
const BN_BPS_SCALE = new BN(BPS_SCALE);
const BN_BASE_FEE_BPS = new BN(BASE_FEE_BPS);
const BN_DEPOSIT_PREMIUM_CAP_BPS = new BN(DEPOSIT_PREMIUM_CAP_BPS);
const BN_WITHDRAW_FEE_FLOOR_BPS = new BN(WITHDRAW_FEE_FLOOR_BPS);
const BN_FEE_K_FACTOR_NUMERATOR = new BN(FEE_K_FACTOR_NUMERATOR);
const BN_FEE_K_FACTOR_DENOMINATOR = new BN(FEE_K_FACTOR_DENOMINATOR);
const BN_DEPOSIT_MAX_FEE_BPS = new BN(DEPOSIT_MAX_FEE_BPS);
const BN_WITHDRAW_MAX_FEE_BPS = new BN(WITHDRAW_MAX_FEE_BPS);

// --- Calculation Helper: Convert USD to Token Amount ---
// FIX: Corrected implementation based on derived formula
const usdToTokenAmount = (usdValueScaled: BN, decimals: number, priceData: ProcessedTokenData['priceData']): BN => {
    if (!priceData || priceData.price.isZero() || priceData.price.isNeg() || usdValueScaled.isNeg()) return new BN(0);
    if (usdValueScaled.isZero()) return new BN(0); // Handle zero USD input

    try {
        const price_bn = priceData.price; // Price scaled by 10^abs(Expo)
        const expo = priceData.expo;

        // Derived formula: Amount_Native = (USD_Value_Scaled * 10^Decimals) / (Price_Scaled * 10^(Expo + USD_SCALE))
        const total_exponent: number = expo + USD_SCALE; // Note: USD_SCALE is 6

        let final_numerator = usdValueScaled.mul(new BN(10).pow(new BN(decimals)));
        let final_denominator = price_bn;

        // Adjust numerator or denominator based on the sign of total_exponent
        if (total_exponent >= 0) {
            // If exponent is non-negative, multiply the denominator
            final_denominator = price_bn.mul(new BN(10).pow(new BN(total_exponent)));
        } else {
            // If exponent is negative, multiply the numerator by 10^abs(total_exponent)
            final_numerator = final_numerator.mul(new BN(10).pow(new BN(Math.abs(total_exponent))));
        }

        // Safety check for zero denominator AFTER potential adjustments
        if (final_denominator.isZero()) {
            console.error("usdToTokenAmount: Calculated denominator is zero!");
            return new BN(0);
        }

        // Apply PRECISION_SCALE_FACTOR for precision during division
        const resultScaled = final_numerator.mul(PRECISION_SCALE_FACTOR).div(final_denominator);
        return resultScaled; // Returns Lamports * 1e12

    } catch (e) {
        console.error("Error converting USD to token amount:", e);
        return new BN(0);
    }
}

// --- Calculation Helper: Convert USD to wLQI Amount ---
const usdToWlqiAmount = (usdValueScaled: BN, wLqiValueScaled: BN | null, wLqiDecimals: number | null): BN => {
    if (!wLqiValueScaled || wLqiValueScaled.isZero() || wLqiValueScaled.isNeg() || wLqiDecimals === null) return new BN(0);
    try {
        const wLqiMultiplier = new BN(10).pow(new BN(wLqiDecimals));
        // wLqiAmount = (usdValue * 10^wLqiDecimals) / wLqiValue
        return usdValueScaled.mul(wLqiMultiplier).div(wLqiValueScaled);
    } catch (e) {
        console.error("Error converting USD to wLQI amount:", e);
        return new BN(0);
    }
}

// --- Calculation Helper --- 

/**
 * Calculates relative deviation scaled by BPS_SCALE (1e4).
 * Inputs are scaled by DOMINANCE_SCALE (1e10).
 * Returns BN representing BPS (scaled by 1).
 */
const calculateRelativeDeviationBpsBN = (actualDominanceScaled: BN, targetDominanceScaled: BN): BN => {
    if (targetDominanceScaled.isZero() || targetDominanceScaled.isNeg()) {
        // Avoid division by zero. If target is 0, deviation is large if actual > 0.
        // Return 100% * BPS_SCALE as BN
        return actualDominanceScaled.gtn(0) ? BN_BPS_SCALE.mul(new BN(100)) : new BN(0);
    }
    try {
        const deviationScaled = actualDominanceScaled.sub(targetDominanceScaled);
        // Scale deviation by BN_BPS_SCALE before dividing by target dominance
        // Use BN arithmetic: (deviationScaled * BN_BPS_SCALE) / targetDominanceScaledBn
        const deviationBpsBN = deviationScaled.mul(BN_BPS_SCALE).div(targetDominanceScaled);
        return deviationBpsBN;
    } catch (e) {
        console.error("Error calculating relative deviation BPS (BN):", e);
        return new BN(0); // Return BN(0) on error
    }
};

// --- TokenTable Component ---
export const TokenTable = React.memo<TokenTableProps>(({
    tokenData,
    totalPoolValueScaled,
    wLqiValueScaled,
    wLqiDecimals,
    userWlqiBalance,
    onDeposit,
    onWithdraw,
    isDepositing,
    isWithdrawing,
    depositAmounts,
    withdrawAmounts,
    handleAmountChange,
    isLoadingUserData,
    isLoadingPublicData,
    hideDepositColumn = false, // Default to false
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
            const targetScaled = calculateTargetPercentageScaled(token.targetDominance, totalTargetDominance);
            return {
                symbol: token.symbol,
                value: tokenValueUsd ?? new BN(-1), // Use -1 for null value sorting
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
                case 'targetPercent': // Added sort case
                    compareResult = valuesA.targetPercent.cmp(valuesB.targetPercent);
                    break;
            }
            return sortDirection === 'asc' ? compareResult : -compareResult;
        });

        return dataToSort;
    }, [tokenData, sortKey, sortDirection, totalTargetDominance]);

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

    // --- ADD: Handler for the Target button --- 
    const handleSetTargetAmount = useCallback((mintAddress: string, action: 'deposit' | 'withdraw') => {
        console.log(`Calculating target amount for ${mintAddress}, action: ${action}`); // Debug

        // Find the specific token first to check if it's delisted
        const token = tokenData?.find(t => t.mintAddress === mintAddress);

        // --- First check: Validate token data based on action --- 
        if (!token || token.decimals === null || token.targetDominance.isNeg()) {
            toast.error("Token data invalid for target calculation.");
            return;
        }

        // --- Second check: Validate token data based on action --- 
        let isTokenDataInvalid = false;
        if ((action === 'deposit' || !token.isDelisted) && token.targetDominance.isZero()) {
            isTokenDataInvalid = true; // Invalid if target is zero for deposits or non-delisted withdraws
        }

        if (isTokenDataInvalid) {
            toast.error("Token data invalid for target calculation.");
            return;
        }

        // Current state values
        const T = token.vaultBalance !== null && token.decimals !== null
            ? calculateTokenValueUsdScaled(token.vaultBalance, token.decimals, token.priceData) ?? new BN(0)
            : new BN(0);
        const P = totalPoolValueScaled;

        let amountToSet = '0';

        try {
            if (action === 'deposit') {
                // Solve for V (USD deposit): V = (target_value_in_pool - T) * totalTargetDominance / one_minus_target_dom_fraction_numer
                // Calculate these values here for deposit
                const target_value_in_pool = P!.mul(token.targetDominance).div(totalTargetDominance);
                const one_minus_target_dom_fraction_numer = totalTargetDominance.sub(token.targetDominance);

                if (target_value_in_pool.lte(T)) {
                    console.log("Token already at or above target, cannot deposit to reach target.");
                    toast.error("Cannot deposit to reach target, token already at or above.");
                    return;
                }

                const valueDiff = target_value_in_pool.sub(T);
                const V_usd_scaled = valueDiff.mul(totalTargetDominance).div(one_minus_target_dom_fraction_numer);

                // Convert V (USD) to token amount (result is scaled by PRECISION_SCALE_FACTOR)
                const tokenAmountScaledBn = usdToTokenAmount(V_usd_scaled, token.decimals, token.priceData);

                // FIX: Unscale the result before checks and formatting
                if (PRECISION_SCALE_FACTOR.isZero()) { // Safety check
                    toast.error("Internal error: Precision scale factor is zero.");
                    return;
                }
                const finalAmountBn = tokenAmountScaledBn.div(PRECISION_SCALE_FACTOR);

                // FIX: Perform checks on the *unscaled* final amount
                // Check specifically for truncation to zero
                if (finalAmountBn.isZero() && tokenAmountScaledBn.gtn(0)) {
                    toast.error("Target deposit amount is less than minimum transferable unit.");
                    console.warn("Target calculation resulted in < 1 lamport.")
                    return;
                }
                // General check for negative (shouldn't happen but good practice)
                if (finalAmountBn.isNeg()) {
                    toast.error("Calculated target amount is invalid (negative).");
                    console.warn("Target calculation resulted in negative token amount.")
                    return;
                }

                if (token.userBalance && finalAmountBn.gt(token.userBalance)) {
                    console.log(`Target amount (${finalAmountBn.toString()}) exceeds user balance (${token.userBalance.toString()}). Falling back to max.`);
                    toast("Required amount exceeds balance. Setting to max.", { icon: '⚠️' });
                    // Use userBalance directly for formatting
                    amountToSet = formatUnits(token.userBalance.toString(), token.decimals);
                } else {
                    // Use the calculated finalAmountBn for formatting
                    amountToSet = formatUnits(finalAmountBn.toString(), token.decimals);
                }

            } else { // withdraw
                // --- Handle Delisted Withdraw Target --- START
                if (token.isDelisted) {
                    if (!token.vaultBalance || token.vaultBalance.isZero() || token.vaultBalance.isNeg() || token.decimals === null) {
                        toast.error("No pool balance to withdraw for this delisted token.");
                        return;
                    }
                    const T_usd_scaled = calculateTokenValueUsdScaled(token.vaultBalance, token.decimals, token.priceData);
                    if (!T_usd_scaled || T_usd_scaled.isZero() || T_usd_scaled.isNeg()) {
                        toast.error("Cannot calculate value of delisted token balance.");
                        return;
                    }

                    // Adjust the target USD value to account for the 5% bonus
                    // We want to find X wLQI such that Value(X) * 1.05 = T_usd_scaled
                    // So, the target value to convert to wLQI is T_usd_scaled / 1.05
                    const bonusNumerator = new BN(100);
                    const bonusDenominator = new BN(105);
                    const T_usd_scaled_adjusted = T_usd_scaled.mul(bonusNumerator).div(bonusDenominator);

                    const requiredWlqiAmountBn = usdToWlqiAmount(T_usd_scaled_adjusted, wLqiValueScaled, wLqiDecimals);
                    if (requiredWlqiAmountBn.isZero() || requiredWlqiAmountBn.isNeg()) {
                        toast.error("Calculated wLQI amount is zero or negative.");
                        return;
                    }
                    if (wLqiDecimals === null) {
                        toast.error("wLQI decimals not available.");
                        return;
                    }

                    // Simplified Liquidity Check: Already checked vaultBalance > 0 at the start of the isDelisted block.
                    // We are calculating wLQI for the *entire* vault balance.

                    // Check against user's wLQI balance AFTER potentially adjusting for liquidity
                    if (userWlqiBalance && requiredWlqiAmountBn.gt(userWlqiBalance)) {
                        console.log(`Target wLQI withdraw amount (${requiredWlqiAmountBn.toString()}) exceeds user balance (${userWlqiBalance.toString()}). Falling back to max user balance.`);
                        toast("Required wLQI withdraw amount exceeds your balance. Setting to max.", { icon: '⚠️' });
                        // Set to user's max wLQI, no +1 needed here as it's the absolute limit
                        amountToSet = formatUnits(userWlqiBalance.toString(), wLqiDecimals);
                    } else {
                        // Add 1 smallest unit (lamport) to ensure full withdrawal due to potential floor division
                        const finalWlqiAmountBn = requiredWlqiAmountBn.add(new BN(1));
                        amountToSet = formatUnits(finalWlqiAmountBn.toString(), wLqiDecimals);
                    }
                }
                // --- Handle Delisted Withdraw Target --- END
                else {
                    // Moved calculations here as they are only needed for active tokens
                    const target_value_in_pool = P!.mul(token.targetDominance).div(totalTargetDominance);
                    const one_minus_target_dom_fraction_numer = totalTargetDominance.sub(token.targetDominance);

                    // --- Original Withdraw Target Logic for Active Tokens --- START
                    // Solve for V (USD withdraw): V = (T - target_value_in_pool) * totalTargetDominance / one_minus_target_dom_fraction_numer
                    if (T.lte(target_value_in_pool)) {
                        console.log("Token already at or below target, cannot withdraw to reach target.");
                        toast.error("Cannot withdraw to reach target, token already at or below.");
                        return; // Cannot withdraw if already at or below target
                    }
                    if (one_minus_target_dom_fraction_numer.isZero() || one_minus_target_dom_fraction_numer.isNeg()) {
                        toast.error("Invalid target dominance for calculation.");
                        return;
                    }

                    const valueDiff = T.sub(target_value_in_pool);
                    const V_usd_scaled = valueDiff.mul(totalTargetDominance).div(one_minus_target_dom_fraction_numer);

                    // Convert V (USD) to wLQI amount
                    const wLqiAmountBn = usdToWlqiAmount(V_usd_scaled, wLqiValueScaled, wLqiDecimals);
                    if (wLqiAmountBn.isZero() || wLqiAmountBn.isNeg()) {
                        toast.error("Calculated wLQI amount is zero or negative.");
                        return;
                    }
                    if (wLqiDecimals === null) { // Extra check
                        toast.error("wLQI decimals not available.");
                        return;
                    }

                    // FIX: Add check for user's wLQI balance
                    if (userWlqiBalance && wLqiAmountBn.gt(userWlqiBalance)) {
                        console.log(`Target wLQI withdraw amount (${wLqiAmountBn.toString()}) exceeds user balance (${userWlqiBalance.toString()}). Falling back to max.`);
                        toast("Required wLQI withdraw amount exceeds balance. Setting to max.", { icon: '⚠️' });
                        // Use userWlqiBalance directly for formatting
                        amountToSet = formatUnits(userWlqiBalance.toString(), wLqiDecimals);
                    } else {
                        // Use the calculated wLqiAmountBn for formatting
                        amountToSet = formatUnits(wLqiAmountBn.toString(), wLqiDecimals);
                    }
                    // --- Original Withdraw Target Logic for Active Tokens --- END
                }
            }

            // Remove trailing .0 if present before setting
            if (amountToSet.endsWith('.0')) {
                amountToSet = amountToSet.substring(0, amountToSet.length - 2);
            }
            if (parseFloat(amountToSet) <= 0) {
                toast.error("Calculated target amount is too small.");
                return;
            }

            handleAmountChange(mintAddress, action, amountToSet);

        } catch (error) {
            console.error(`Error calculating target amount for ${action}:`, error);
            toast.error(`Failed to calculate target ${action} amount.`);
        }

    }, [tokenData, totalPoolValueScaled, totalTargetDominance, wLqiValueScaled, wLqiDecimals, handleAmountChange, userWlqiBalance]);

    // Null check for tokenData before rendering table
    if (!tokenData) {
        return <SkeletonTokenTable />; // Use the existing skeleton component
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
        const { mintAddress, symbol, icon, priceData, vaultBalance, decimals, targetDominance, isDelisted } = token;

        // --- Recalculate values needed for display --- 
        const tokenValueUsd = vaultBalance !== null && decimals !== null
            ? calculateTokenValueUsdScaled(vaultBalance, decimals, priceData)
            : null;
        const targetScaled = calculateTargetPercentageScaled(targetDominance, totalTargetDominance);

        // --- Get Input Values ---
        const currentDepositAmount = depositAmounts[mintAddress] || '';
        const currentWithdrawAmount = withdrawAmounts[mintAddress] || '';
        const isDepositInputFilled = currentDepositAmount !== '' && parseFloat(currentDepositAmount) > 0;
        const isWithdrawInputFilled = currentWithdrawAmount !== '' && parseFloat(currentWithdrawAmount) > 0;

        // --- ADD: Check for insufficient TOKEN balance for deposit ---
        let depositInsufficientBalance = false;
        if (isDepositInputFilled && token.userBalance && decimals !== null) {
            try {
                const inputAmountBn = new BN(parseUnits(currentDepositAmount, decimals).toString());
                const isInsufficient = inputAmountBn.gt(token.userBalance);
                if (isInsufficient) {
                    depositInsufficientBalance = true;
                }
            } catch (e) {
                console.warn(`Error parsing deposit amount for ${symbol} balance check:`, e);
            }
        }

        // --- ADD: Check for insufficient wLQI balance for withdrawal ---
        let withdrawInsufficientBalance = false;
        if (isWithdrawInputFilled && userWlqiBalance && wLqiDecimals !== null) {
            try {
                const inputWlqiAmountBn = new BN(parseUnits(currentWithdrawAmount, wLqiDecimals).toString());
                if (inputWlqiAmountBn.gt(userWlqiBalance)) {
                    withdrawInsufficientBalance = true;
                }
            } catch (e) {
                console.warn("Error parsing withdraw amount for balance check:", e);
                // Potentially disable if parsing fails?
            }
        }

        // --- Advanced Fee Calculation --- Refactored to use BN
        let estimatedDepositFeeBps = BASE_FEE_BPS; // Default for Deposit
        let estimatedWithdrawFeeBps = BASE_FEE_BPS; // Default for Withdraw
        let withdrawDynamicFeeBpsBN: BN | null = null; // Store intermediate dynamic fee
        let withdrawalExceedsLiquidity = false;

        try {
            // --- Liquidity Check (Moved Up & Separated) ---
            // Check if the manually entered wLQI withdraw amount requires more underlying tokens than the pool holds.
            if (isWithdrawInputFilled && wLqiDecimals !== null && wLqiValueScaled && !wLqiValueScaled.isZero() && priceData && decimals !== null && vaultBalance && !vaultBalance.isZero()) {
                try {
                    const inputWlqiAmountBn = new BN(parseUnits(currentWithdrawAmount, wLqiDecimals).toString());
                    const scaleFactorWlqi = new BN(10).pow(new BN(wLqiDecimals));
                    let valueChangeUsdScaled = new BN(0);
                    if (!scaleFactorWlqi.isZero()) {
                        valueChangeUsdScaled = inputWlqiAmountBn.mul(wLqiValueScaled).div(scaleFactorWlqi);
                    }

                    // Convert USD value to required token amount
                    const requiredTokenAmountBn_scaled = usdToTokenAmount(valueChangeUsdScaled, decimals, priceData);
                    const requiredTokenAmountBn = requiredTokenAmountBn_scaled.div(PRECISION_SCALE_FACTOR);

                    if (requiredTokenAmountBn.gt(vaultBalance)) {
                        // console.log(`Liquidity Check: Required ${symbol} (${requiredTokenAmountBn.toString()}) > Vault (${vaultBalance.toString()})`);
                        withdrawalExceedsLiquidity = true;
                    } else {
                        // console.log(`Liquidity Check: Required ${symbol} (${requiredTokenAmountBn.toString()}) <= Vault (${vaultBalance.toString()})`);
                        withdrawalExceedsLiquidity = false; // Explicitly set to false if liquidity is sufficient
                    }
                } catch (e) {
                    console.error("Error during withdrawal liquidity check:", e);
                    withdrawalExceedsLiquidity = false; // Assume sufficient if calculation fails?
                }
            } else {
                // If input isn't filled or data is missing, assume liquidity is not exceeded by the input
                withdrawalExceedsLiquidity = false;
            }

            // --- ADDED: Check if TVL is available before calculating dynamic fees ---
            if (!totalPoolValueScaled) {
                // If TVL is null (e.g., during refresh), default fees to base and skip dynamic calc
                estimatedDepositFeeBps = BASE_FEE_BPS;
                estimatedWithdrawFeeBps = BASE_FEE_BPS;
                withdrawDynamicFeeBpsBN = null;
                // console.log(`Fee Estimation for ${symbol}: Skipping dynamic calc (TVL null)`);
            } else {
                // TVL is available, proceed with dynamic fee calculation
                const targetDominanceScaledBn = (totalTargetDominance && !totalTargetDominance.isZero())
                    ? targetDominance.mul(DOMINANCE_SCALE).div(totalTargetDominance)
                    : new BN(0);
                // Refined: Default actualDomPreScaled to null if TVL is missing
                const actualDomPreScaled = (tokenValueUsd && !totalPoolValueScaled.isZero()) // Check zero here too
                    ? tokenValueUsd.mul(DOMINANCE_SCALE).div(totalPoolValueScaled)
                    : null;

                // --- ADDED: Check if actualDomPreScaled is valid before using it ---
                if (actualDomPreScaled === null) {
                    // Should not happen if totalPoolValueScaled check passed, but safety first
                    estimatedDepositFeeBps = BASE_FEE_BPS;
                    estimatedWithdrawFeeBps = BASE_FEE_BPS;
                    withdrawDynamicFeeBpsBN = null;
                    // console.log(`Fee Estimation for ${symbol}: Skipping dynamic calc (ActualDomPre null)`);
                } else {
                    // Both TVL and ActualDomPreScaled are valid, calculate relative deviation
                    const relDevPreBps = calculateRelativeDeviationBpsBN(actualDomPreScaled, targetDominanceScaledBn);

                    // --- Calculate Deposit Fee Estimate --- Refactored to use BN
                    if (isDepositInputFilled && decimals !== null && priceData && !totalPoolValueScaled.isZero() && totalTargetDominance && !totalTargetDominance.isZero()) {
                        let valueChangeUsdScaled = new BN(0);
                        try {
                            const inputAmountBn = new BN(parseUnits(currentDepositAmount, decimals).toString());
                            valueChangeUsdScaled = calculateTokenValueUsdScaled(inputAmountBn, decimals, priceData);

                            if (!valueChangeUsdScaled.isZero()) {
                                const totalPoolValuePostScaled = totalPoolValueScaled.add(valueChangeUsdScaled);
                                const tokenValuePostScaled = (tokenValueUsd ?? new BN(0)).add(valueChangeUsdScaled);
                                // Refined: Check Post TVL before calculating Post Actual Dom
                                const actualDomPostScaled = (!totalPoolValuePostScaled.isZero())
                                    ? tokenValuePostScaled.mul(DOMINANCE_SCALE).div(totalPoolValuePostScaled)
                                    : null;

                                // --- ADDED: Check if Post Actual Dom is valid ---
                                if (actualDomPostScaled !== null) {
                                    const relDevPostBpsBN = calculateRelativeDeviationBpsBN(actualDomPostScaled, targetDominanceScaledBn);
                                    const scaleFactor = new BN(100);
                                    const avgRelDevBpsBN = relDevPreBps.add(relDevPostBpsBN).mul(scaleFactor).div(new BN(2).mul(scaleFactor));
                                    const rawDynamicFeeBpsBN = avgRelDevBpsBN.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                                    let effectiveDynamicFeeBpsBN = rawDynamicFeeBpsBN;
                                    if (effectiveDynamicFeeBpsBN.lt(BN_DEPOSIT_PREMIUM_CAP_BPS)) {
                                        effectiveDynamicFeeBpsBN = BN_DEPOSIT_PREMIUM_CAP_BPS;
                                    }
                                    let totalFeeBN = BN_BASE_FEE_BPS.add(effectiveDynamicFeeBpsBN);
                                    if (totalFeeBN.gt(BN_DEPOSIT_MAX_FEE_BPS)) {
                                        totalFeeBN = BN_DEPOSIT_MAX_FEE_BPS;
                                    }
                                    estimatedDepositFeeBps = Math.round(totalFeeBN.toNumber());
                                } else {
                                    // Cannot calculate post-state, fallback to pre-state fee
                                    console.warn(`Fee Estimation for Deposit ${symbol}: Could not calc Post Actual Dom, using Pre state`);
                                    const rawDynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                                    let effectiveDynamicFeePreBpsBN = rawDynamicFeePreBpsBN;
                                    if (effectiveDynamicFeePreBpsBN.lt(BN_DEPOSIT_PREMIUM_CAP_BPS)) {
                                        effectiveDynamicFeePreBpsBN = BN_DEPOSIT_PREMIUM_CAP_BPS;
                                    }
                                    let totalFeePreBN = BN_BASE_FEE_BPS.add(effectiveDynamicFeePreBpsBN);
                                    if (totalFeePreBN.gt(BN_DEPOSIT_MAX_FEE_BPS)) {
                                        totalFeePreBN = BN_DEPOSIT_MAX_FEE_BPS;
                                    }
                                    estimatedDepositFeeBps = Math.round(totalFeePreBN.toNumber());
                                }

                            } else {
                                // Value change is zero, estimate based on pre-state (using BN)
                                const rawDynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                                let effectiveDynamicFeePreBpsBN = rawDynamicFeePreBpsBN;
                                if (effectiveDynamicFeePreBpsBN.lt(BN_DEPOSIT_PREMIUM_CAP_BPS)) {
                                    effectiveDynamicFeePreBpsBN = BN_DEPOSIT_PREMIUM_CAP_BPS;
                                }
                                let totalFeePreBN = BN_BASE_FEE_BPS.add(effectiveDynamicFeePreBpsBN);
                                if (totalFeePreBN.gt(BN_DEPOSIT_MAX_FEE_BPS)) {
                                    totalFeePreBN = BN_DEPOSIT_MAX_FEE_BPS;
                                }
                                estimatedDepositFeeBps = Math.round(totalFeePreBN.toNumber());
                            }
                        } catch (e) {
                            console.error("Error during deposit fee estimation (BN):", e);
                            estimatedDepositFeeBps = BASE_FEE_BPS; // Fallback
                        }
                    } else {
                        // No deposit amount or missing data, estimate based on pre-state (using BN)
                        const rawDynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                        let effectiveDynamicFeePreBpsBN = rawDynamicFeePreBpsBN;
                        if (effectiveDynamicFeePreBpsBN.lt(BN_DEPOSIT_PREMIUM_CAP_BPS)) {
                            effectiveDynamicFeePreBpsBN = BN_DEPOSIT_PREMIUM_CAP_BPS;
                        }
                        let totalFeePreBN = BN_BASE_FEE_BPS.add(effectiveDynamicFeePreBpsBN);
                        if (totalFeePreBN.gt(BN_DEPOSIT_MAX_FEE_BPS)) {
                            totalFeePreBN = BN_DEPOSIT_MAX_FEE_BPS;
                        }
                        estimatedDepositFeeBps = Math.round(totalFeePreBN.toNumber());
                    }

                    // --- Calculate Withdraw Fee Estimate --- Refactored to use BN
                    if (isWithdrawInputFilled && wLqiDecimals !== null && wLqiValueScaled && !wLqiValueScaled.isZero() && priceData && decimals !== null && vaultBalance && !vaultBalance.isZero()) {
                        let valueChangeUsdScaled = new BN(0);
                        try {
                            const inputWlqiAmountBn = new BN(parseUnits(currentWithdrawAmount, wLqiDecimals).toString());
                            const scaleFactorWlqi = new BN(10).pow(new BN(wLqiDecimals));

                            if (!scaleFactorWlqi.isZero()) {
                                valueChangeUsdScaled = inputWlqiAmountBn.mul(wLqiValueScaled).div(scaleFactorWlqi);
                            }

                            // Calculate fee only if liquidity check passed (flag is false)
                            // and valueChange is non-zero
                            if (!withdrawalExceedsLiquidity && !valueChangeUsdScaled.isZero()) {
                                const totalPoolValuePostScaled = totalPoolValueScaled.gt(valueChangeUsdScaled) ? totalPoolValueScaled.sub(valueChangeUsdScaled) : new BN(0);
                                const currentTokenValue = tokenValueUsd ?? new BN(0);
                                const tokenValuePostScaled = currentTokenValue.gt(valueChangeUsdScaled) ? currentTokenValue.sub(valueChangeUsdScaled) : new BN(0);
                                // Refined: Check Post TVL before calculating Post Actual Dom
                                const actualDomPostScaled = (!totalPoolValuePostScaled.isZero())
                                    ? tokenValuePostScaled.mul(DOMINANCE_SCALE).div(totalPoolValuePostScaled)
                                    : null;

                                // --- ADDED: Check if Post Actual Dom is valid ---
                                if (actualDomPostScaled !== null) {
                                    const relDevPostBpsBN = calculateRelativeDeviationBpsBN(actualDomPostScaled, targetDominanceScaledBn);
                                    const avgRelDevBpsBN = relDevPreBps.add(relDevPostBpsBN).div(new BN(2));
                                    withdrawDynamicFeeBpsBN = avgRelDevBpsBN.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                                    let totalFeeBN = BN_BASE_FEE_BPS.sub(withdrawDynamicFeeBpsBN);
                                    if (totalFeeBN.lt(BN_WITHDRAW_FEE_FLOOR_BPS)) {
                                        totalFeeBN = BN_WITHDRAW_FEE_FLOOR_BPS;
                                    } else if (totalFeeBN.gt(BN_WITHDRAW_MAX_FEE_BPS)) {
                                        totalFeeBN = BN_WITHDRAW_MAX_FEE_BPS;
                                    }
                                    estimatedWithdrawFeeBps = Math.round(totalFeeBN.toNumber());
                                } else {
                                    // Cannot calculate post-state, fallback to pre-state fee
                                    console.warn(`Fee Estimation for Withdraw ${symbol}: Could not calc Post Actual Dom, using Pre state`);
                                    const dynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                                    let totalFeePreBN = BN_BASE_FEE_BPS.sub(dynamicFeePreBpsBN);
                                    if (totalFeePreBN.lt(BN_WITHDRAW_FEE_FLOOR_BPS)) {
                                        totalFeePreBN = BN_WITHDRAW_FEE_FLOOR_BPS;
                                    } else if (totalFeePreBN.gt(BN_WITHDRAW_MAX_FEE_BPS)) {
                                        totalFeePreBN = BN_WITHDRAW_MAX_FEE_BPS;
                                    }
                                    estimatedWithdrawFeeBps = Math.round(totalFeePreBN.toNumber());
                                }

                            } else if (!withdrawalExceedsLiquidity) {
                                // Value change zero or liquidity check failed, estimate based on pre-state (using BN)
                                const dynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                                let totalFeePreBN = BN_BASE_FEE_BPS.sub(dynamicFeePreBpsBN);
                                if (totalFeePreBN.lt(BN_WITHDRAW_FEE_FLOOR_BPS)) {
                                    totalFeePreBN = BN_WITHDRAW_FEE_FLOOR_BPS;
                                } else if (totalFeePreBN.gt(BN_WITHDRAW_MAX_FEE_BPS)) {
                                    totalFeePreBN = BN_WITHDRAW_MAX_FEE_BPS;
                                }
                                estimatedWithdrawFeeBps = Math.round(totalFeePreBN.toNumber());
                            }
                            // If withdrawalExceedsLiquidity is true, fee remains default (BASE_FEE) but button will be disabled/show error

                        } catch (e) {
                            console.error("Error during withdraw fee estimation (BN):", e);
                            estimatedWithdrawFeeBps = BASE_FEE_BPS; // Fallback
                        }
                    } else {
                        // No withdraw amount or missing data, estimate based on pre-state (using BN)
                        const dynamicFeePreBpsBN = relDevPreBps.mul(BN_FEE_K_FACTOR_NUMERATOR).div(BN_FEE_K_FACTOR_DENOMINATOR);
                        let totalFeePreBN = BN_BASE_FEE_BPS.sub(dynamicFeePreBpsBN);
                        if (totalFeePreBN.lt(BN_WITHDRAW_FEE_FLOOR_BPS)) {
                            totalFeePreBN = BN_WITHDRAW_FEE_FLOOR_BPS;
                        } else if (totalFeePreBN.gt(BN_WITHDRAW_MAX_FEE_BPS)) {
                            totalFeePreBN = BN_WITHDRAW_MAX_FEE_BPS;
                        }
                        estimatedWithdrawFeeBps = Math.round(totalFeePreBN.toNumber());
                    }
                } // End of main else block (TVL and ActualDomPreScaled are valid)
            } // End of outer else block (TVL is valid)
        } catch (e) {
            console.error("Error calculating fee estimate:", e);
            // Fallback to base fee for both on any error
            estimatedDepositFeeBps = BASE_FEE_BPS;
            estimatedWithdrawFeeBps = BASE_FEE_BPS;
        }

        // Calculate deviation strings for display (using token.actualDominancePercent)
        // Handle case where percentage might be null/undefined
        const actualPercentBN = token.actualDominancePercent !== null && token.actualDominancePercent !== undefined
            ? new BN(Math.round(token.actualDominancePercent * BPS_SCALE)) // Convert percentage back to scaled BN for comparison
            : null;

        // --- Button State Logic ---
        const actionDisabled = isDepositing || isWithdrawing || isLoadingPublicData || isLoadingUserData;
        let depositButtonDisabled = actionDisabled || !isDepositInputFilled || isDelisted;
        let withdrawButtonDisabled = actionDisabled || !isWithdrawInputFilled; // Declare and initialize withdrawButtonDisabled here

        // --- Create Fee Display Strings --- (Moved Up)
        const formatFeeString = (estimatedBps: number, isDeposit: boolean) => {
            let feeString: string;
            let title: string;

            if (isDeposit) {
                if (estimatedBps < 0) {
                    const bonusPercent = (Math.abs(estimatedBps) / BPS_SCALE * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    feeString = `(~${bonusPercent}% Bonus)`;
                    title = `Est. Bonus: ~${bonusPercent}%`;
                } else if (estimatedBps === 0) {
                    feeString = `(0.00%)`;
                    title = "Est. Total Fee: 0.00%";
                } else {
                    const displayPercent = (estimatedBps / BPS_SCALE * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    feeString = `(~${displayPercent}% Fee)`;
                    title = `Est. Total Fee: ~${displayPercent}%`;
                }
            } else {
                if (estimatedBps === 0) {
                    feeString = "(0.00%)";
                    title = "Minimum fee applied (0.00%)";
                } else if (estimatedBps > 0) {
                    const displayPercent = (estimatedBps / BPS_SCALE * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    feeString = `(~${displayPercent}% Fee)`;
                    title = `Est. Total Fee: ~${displayPercent}%`;
                } else {
                    feeString = "(Fee Error)";
                    title = "Error estimating fee";
                }
            }
            return { feeString, title };
        };

        const formatDelistedWithdrawFeeString = () => {
            // Delisted tokens have a fixed bonus resulting in a 0% net fee.
            // We display it as a bonus indication.
            const feeString = "(~5% Bonus)"; // Explicitly mention bonus
            const title = "Fixed bonus applied for delisted token withdrawal (0% net fee).";
            return { feeString, title };
        };

        // --- Determine Button Colors & Labels (Conditional on Loading State) ---
        let depositBtnClass = BTN_GRAY;
        let withdrawBtnClass = BTN_GRAY;
        let depositLabel = isDepositing ? 'Depositing...' : 'Deposit';
        let withdrawLabel = isWithdrawing ? 'Withdrawing...' : 'Withdraw';
        let depositTitle = 'Enter amount to deposit';
        let withdrawTitle = 'Enter wLQI amount to withdraw';

        if (!actionDisabled) { // Only calculate/display fees when not loading/transacting
            // Deposit Fee/Color
            if (estimatedDepositFeeBps <= 0) {
                depositBtnClass = BTN_GREEN;
            } else {
                depositBtnClass = BTN_RED;
            }

            // Withdraw Fee/Color
            // Check fee only if liquidity is sufficient (and not delisted - handled by override)
            if (!withdrawalExceedsLiquidity) {
                // Only check estimated fee for non-delisted tokens
                if (estimatedWithdrawFeeBps === 0) {
                    withdrawBtnClass = BTN_GREEN;
                } else if (estimatedWithdrawFeeBps > 0) {
                    withdrawBtnClass = BTN_RED;
                } // else stays BTN_GRAY
            }

            // Format Fee Strings
            const { feeString: depositFeeString, title: depositTitleBase } = formatFeeString(estimatedDepositFeeBps, true);
            depositLabel = `Deposit ${depositFeeString}`;
            depositTitle = depositTitleBase;

            const { feeString: withdrawFeeString, title: withdrawTitleBase } =
                isDelisted
                    ? formatDelistedWithdrawFeeString()
                    : formatFeeString(estimatedWithdrawFeeBps, false);
            withdrawLabel = `Withdraw ${withdrawFeeString}`;
            withdrawTitle = withdrawTitleBase;
        }

        // --- Withdrawal Overrides --- Apply in order:

        // 1. Check Insufficient User Balance
        if (withdrawInsufficientBalance) {
            withdrawLabel = "Insufficient wLQI";
            withdrawTitle = "Withdrawal amount exceeds your wLQI balance";
            withdrawButtonDisabled = true; // Assignment is now valid
            withdrawBtnClass = BTN_GRAY;
        }
        // 2. Check Zero Pool Balance (Only applies if user balance is sufficient)
        else if (isDelisted && (!vaultBalance || vaultBalance.isZero())) {
            withdrawLabel = "Pool Empty";
            withdrawTitle = "No balance of this delisted token in the pool to withdraw.";
            withdrawButtonDisabled = true; // Assignment is now valid
            withdrawBtnClass = BTN_GRAY;
        }
        // 3. Check Insufficient Pool Liquidity (Only applies if user balance sufficient AND pool not empty)
        else if (withdrawalExceedsLiquidity) {
            // Override withdraw display for liquidity error
            // FIX: Make label and title specific to the pool token
            withdrawTitle = `Pool lacks sufficient ${symbol} for withdrawal`;
            withdrawLabel = `Insufficient Pool ${symbol}`;
            withdrawButtonDisabled = true; // Assignment is now valid
            withdrawBtnClass = BTN_GRAY;
        }

        // --- Formatting & USD Value Calcs --- 
        const displayBalance = formatRawAmountString(vaultBalance?.toString(), decimals, true, 2);
        const displayValue = formatScaledBnToDollarString(tokenValueUsd, USD_SCALE);
        const displaySymbol = symbol;
        const displayTargetPercent = formatScaledToPercentageString(targetScaled);
        const displayActualPercent = (typeof token.actualDominancePercent === 'number')
            ? token.actualDominancePercent.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
            : '--.--';

        // Refined: Check userBalance from the token object directly for formatting
        const currentUserBalance = token.userBalance;
        const formattedUserTokenBalance = currentUserBalance !== null
            ? formatRawAmountString(currentUserBalance.toString(), decimals, true, 2)
            : null;
        const displayUserTokenBalance = formattedUserTokenBalance ? `${formattedUserTokenBalance} ${symbol}` : '--.--'; // Show placeholder instead of N/A

        // Refined: Check userWlqiBalance AND wLqiDecimals props directly for formatting
        const formattedUserWlqiBalance = userWlqiBalance !== null && wLqiDecimals !== null
            ? formatRawAmountString(userWlqiBalance.toString(), wLqiDecimals, true, 2)
            : null;
        const displayUserWlqiBalance = formattedUserWlqiBalance ? `${formattedUserWlqiBalance} wLQI` : '--.--'; // Show placeholder instead of N/A

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

        // --- Overrides for Insufficient Balance / Liquidity --- (Apply AFTER conditional fee logic)
        // NOTE: The order matters here. Insufficient user balance takes precedence.
        if (depositInsufficientBalance) {
            depositLabel = `Insufficient User ${symbol}`;
            depositTitle = `Deposit amount exceeds your ${symbol} balance`;
            depositButtonDisabled = true;
            depositBtnClass = BTN_GRAY;
        }
        // The check for withdrawInsufficientBalance is already handled above in the "Withdrawal Overrides" section,
        // so we don't need to repeat the assignment to withdrawButtonDisabled here.
        // if (withdrawInsufficientBalance) { ... }

        // --- Prepare Button Callbacks ---
        const handleActualDeposit = () => onDeposit(mintAddress, currentDepositAmount, decimals);
        const handleActualWithdraw = () => onWithdraw(mintAddress, currentWithdrawAmount, false);
        const handleFullDelistedWithdraw = () => onWithdraw(mintAddress, "0", true);

        // --- Calculate required wLQI for delisted --- START
        let requiredWlqiForDelistedBn: BN | null = null;
        let requiredWlqiForDelistedFormatted: string | null = null;
        let userHasEnoughForDelisted = false;

        if (isDelisted && vaultBalance && !vaultBalance.isZero() && decimals !== null && wLqiValueScaled && !wLqiValueScaled.isZero() && wLqiDecimals !== null) {
            try {
                const T_usd_scaled = calculateTokenValueUsdScaled(vaultBalance, decimals, priceData);
                if (T_usd_scaled && T_usd_scaled.gtn(0)) {
                    // Calculate target value (T_usd_scaled / 1.05)
                    const bonusNumerator = new BN(100);
                    const bonusDenominator = new BN(105);
                    const T_usd_scaled_adjusted = T_usd_scaled.mul(bonusNumerator).div(bonusDenominator);
                    const requiredWlqi = usdToWlqiAmount(T_usd_scaled_adjusted, wLqiValueScaled, wLqiDecimals);
                    // Add 1 lamport to ensure full withdrawal
                    requiredWlqiForDelistedBn = requiredWlqi.add(new BN(1));
                    requiredWlqiForDelistedFormatted = formatRawAmountString(requiredWlqiForDelistedBn.toString(), wLqiDecimals, true, 4); // Show more precision

                    if (userWlqiBalance && requiredWlqiForDelistedBn.lte(userWlqiBalance)) {
                        userHasEnoughForDelisted = true;
                    }
                }
            } catch (e) {
                console.error(`Error calculating required wLQI for delisted ${symbol}:`, e);
                requiredWlqiForDelistedBn = null;
                requiredWlqiForDelistedFormatted = null;
                userHasEnoughForDelisted = false;
            }
        }
        // --- Calculate required wLQI for delisted --- END

        // --- Render Row --- 
        return (
            <tr key={mintAddress} className={`border-b border-gray-600 ${index % 2 === 0 ? 'bg-gray-700' : 'bg-gray-750'} hover:bg-gray-600 ${actionDisabled ? 'opacity-50' : ''} ${isDelisted ? 'bg-red-900/30' : ''}`}>
                {/* Symbol Column - Use inner div for flex centering */}
                <td className="p-0 font-semibold align-middle text-center" title={token.mintAddress}> {/* Keep align-middle, remove padding/flex/etc */}
                    <div className="flex items-center justify-center h-full space-x-2 px-2"> {/* Add inner div with flex, height, spacing, padding */}
                        <img
                            src={icon}
                            alt={symbol}
                            className="w-5 h-5 rounded-full" // Basic size/shape
                            onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = '/tokens/btc.png'; // REVERTED: Fallback to btc.png
                                target.onerror = null; // Prevent infinite loop if fallback also fails
                            }}
                        />
                        <span className="">{displaySymbol}</span> {/* Basic span */}
                    </div>
                </td>
                {/* Pool Balance */}
                <td className="p-2 align-middle text-center">
                    <div>{displayValue}</div>
                    <div className="text-gray-400">{displayBalance} {displaySymbol}</div>
                </td>
                {/* Actual % */}
                <td className="p-2 align-middle text-center">{displayActualPercent}%</td>
                {/* Target % */}
                <td className="p-2 align-middle text-center">{displayTargetPercent}%</td>
                {/* Deposit Column */}
                {!hideDepositColumn && (
                    <td className="p-2 align-middle">
                        {isDelisted ? (
                            <div className="text-center text-gray-500 italic">N/A</div>
                        ) : (
                            <div className="flex flex-col space-y-1">
                                <div className="flex items-center justify-between">
                                    <div className="text-gray-400 text-[10px] flex items-center">
                                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="mr-1">
                                            <path d="M13.8205 12.2878C13.8205 12.4379 13.791 12.5865 13.7335 12.7252C13.6761 12.8638 13.5919 12.9898 13.4858 13.0959C13.3797 13.2021 13.2537 13.2863 13.115 13.3437C12.9764 13.4011 12.8278 13.4307 12.6777 13.4307H3.04911C2.746 13.4307 2.45531 13.3103 2.24099 13.0959C2.02666 12.8816 1.90625 12.5909 1.90625 12.2878V4.18992C1.90625 3.68474 2.10693 3.20026 2.46414 2.84305C2.82135 2.48584 3.30584 2.28516 3.81101 2.28516H10.3718C10.6749 2.28516 10.9656 2.40556 11.1799 2.61989C11.3942 2.83422 11.5146 3.12491 11.5146 3.42801L11.5142 4.20668H12.6777C12.8278 4.20668 12.9764 4.23624 13.115 4.29367C13.2537 4.35111 13.3797 4.43529 13.4858 4.54141C13.5919 4.64754 13.6761 4.77353 13.7335 4.91218C13.791 5.05084 13.8205 5.19946 13.8205 5.34954V12.2878ZM12.6777 5.34954H3.04911V12.2878H12.6777L12.6773 10.356H8.43996V7.28173L12.6773 7.28135V5.34992L12.6777 5.34954ZM12.6777 8.4242H9.58244V9.21316H12.6773V8.42459L12.6777 8.4242ZM10.3718 3.42801H3.81101C3.60894 3.42801 3.41515 3.50829 3.27226 3.65117C3.12938 3.79405 3.04911 3.98785 3.04911 4.18992L3.04873 4.20668H10.3714V3.42801H10.3718Z"></path>
                                        </svg>
                                        <span>{displayUserTokenBalance}</span>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        <button
                                            onClick={() => handleSetAmount(token.mintAddress, 'deposit', 0.5)}
                                            disabled={actionDisabled || token.userBalance === null || isDelisted}
                                            className={`px-1 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(actionDisabled || token.userBalance === null || isDelisted) ? 'cursor-not-allowed opacity-50' : ''}`}
                                            title="Set amount to 50% of your balance"
                                        > Half </button>
                                        <button
                                            onClick={() => handleSetAmount(token.mintAddress, 'deposit', 1)}
                                            disabled={actionDisabled || token.userBalance === null || isDelisted}
                                            className={`px-1 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(actionDisabled || token.userBalance === null || isDelisted) ? 'cursor-not-allowed opacity-50' : ''}`}
                                            title="Set amount to your maximum balance"
                                        > Max </button>
                                    </div>
                                </div>

                                <div className="flex items-center">
                                    <div className="relative w-full">
                                        <input
                                            id={`deposit-${mintAddress}`}
                                            type="number"
                                            step="any"
                                            min="0"
                                            placeholder={`Amount (${symbol})`}
                                            value={currentDepositAmount}
                                            onChange={(e) => handleAmountChange(token.mintAddress, 'deposit', e.target.value)}
                                            className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 w-full text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            disabled={actionDisabled || isDelisted}
                                        />
                                        {!actionDisabled && actualPercentBN?.lt(targetScaled) && (
                                            <button
                                                onClick={() => handleSetTargetAmount(token.mintAddress, 'deposit')}
                                                disabled={actionDisabled}
                                                className={`ml-1 px-1 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 rounded text-white text-center ${actionDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                                                title="Set amount needed to reach target dominance"
                                            > To Target </button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <div className="text-gray-400 text-[10px] h-3">
                                        {displayDepositInputUsdValue}
                                    </div>
                                </div>

                                <button
                                    onClick={handleActualDeposit}
                                    disabled={depositButtonDisabled}
                                    className={`w-full px-1 py-0.5 text-xs rounded text-white truncate ${depositBtnClass} ${depositButtonDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                                    title={depositTitle}
                                >
                                    {depositLabel}
                                </button>
                            </div>
                        )}
                    </td>
                )}
                {/* Withdraw Column */}
                <td className="p-2 align-middle">
                    <div className="flex flex-col space-y-1">
                        <div className="flex items-center justify-between">
                            <div className="text-gray-400 text-[10px] flex items-center">
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="mr-1">
                                    <path d="M13.8205 12.2878C13.8205 12.4379 13.791 12.5865 13.7335 12.7252C13.6761 12.8638 13.5919 12.9898 13.4858 13.0959C13.3797 13.2021 13.2537 13.2863 13.115 13.3437C12.9764 13.4011 12.8278 13.4307 12.6777 13.4307H3.04911C2.746 13.4307 2.45531 13.3103 2.24099 13.0959C2.02666 12.8816 1.90625 12.5909 1.90625 12.2878V4.18992C1.90625 3.68474 2.10693 3.20026 2.46414 2.84305C2.82135 2.48584 3.30584 2.28516 3.81101 2.28516H10.3718C10.6749 2.28516 10.9656 2.40556 11.1799 2.61989C11.3942 2.83422 11.5146 3.12491 11.5146 3.42801L11.5142 4.20668H12.6777C12.8278 4.20668 12.9764 4.23624 13.115 4.29367C13.2537 4.35111 13.3797 4.43529 13.4858 4.54141C13.5919 4.64754 13.6761 4.77353 13.7335 4.91218C13.791 5.05084 13.8205 5.19946 13.8205 5.34954V12.2878ZM12.6777 5.34954H3.04911V12.2878H12.6777L12.6773 10.356H8.43996V7.28173L12.6773 7.28135V5.34992L12.6777 5.34954ZM12.6777 8.4242H9.58244V9.21316H12.6773V8.42459L12.6777 8.4242ZM10.3718 3.42801H3.81101C3.60894 3.42801 3.41515 3.50829 3.27226 3.65117C3.12938 3.79405 3.04911 3.98785 3.04911 4.18992L3.04873 4.20668H10.3714V3.42801H10.3718Z"></path>
                                </svg>
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

                        {/* --- Standard Withdraw Input & Button --- */}
                        {/* Always render this block, but disable standard withdraw for delisted if needed */}
                        <>
                            <div className="flex items-center">
                                <div className="relative w-full">
                                    <input
                                        id={`withdraw-${mintAddress}`}
                                        type="number"
                                        step="any"
                                        min="0"
                                        placeholder="Amount (wLQI)"
                                        value={currentWithdrawAmount}
                                        onChange={(e) => handleAmountChange(token.mintAddress, 'withdraw', e.target.value)}
                                        className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 w-full text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                                        disabled={actionDisabled}
                                    />
                                    {/* Hide 'To Target' button for delisted tokens */}
                                    {!isDelisted && !actionDisabled && actualPercentBN?.gt(targetScaled) && (
                                        <button
                                            onClick={() => handleSetTargetAmount(token.mintAddress, 'withdraw')}
                                            disabled={actionDisabled}
                                            className={`ml-1 px-1 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 rounded text-white text-center ${actionDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                                            title="Set wLQI amount needed to reach target dominance"
                                        > To Target </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <div className="text-gray-400 text-[10px] h-3">
                                    {displayWithdrawInputUsdValue}
                                </div>
                            </div>

                            <button
                                onClick={handleActualWithdraw} // Standard withdraw
                                // Update disabled logic and button class/label for delisted state
                                disabled={actionDisabled || withdrawInsufficientBalance || withdrawalExceedsLiquidity || (!vaultBalance || vaultBalance.isZero()) || withdrawButtonDisabled /* Use the declared variable */}
                                className={`w-full px-1 py-0.5 text-xs rounded text-white truncate ${actionDisabled || withdrawInsufficientBalance || withdrawalExceedsLiquidity || (!vaultBalance || vaultBalance.isZero()) ? BTN_GRAY : (isDelisted ? BTN_GREEN : withdrawBtnClass)} ${(actionDisabled || withdrawInsufficientBalance || withdrawalExceedsLiquidity || (!vaultBalance || vaultBalance.isZero()) || withdrawButtonDisabled /* Use the declared variable */) ? 'cursor-not-allowed opacity-50' : ''}`}
                                title={withdrawInsufficientBalance ? "Insufficient wLQI" :
                                    withdrawalExceedsLiquidity ? `Insufficient Pool ${symbol}` :
                                        (!vaultBalance || vaultBalance.isZero()) ? `Pool vault for ${symbol} is empty.` :
                                            isDelisted ? "Withdraw specified wLQI amount (~5% Bonus, 0% net fee)" :
                                                withdrawTitle
                                }
                            >
                                {withdrawInsufficientBalance ? "Insufficient wLQI" :
                                    withdrawalExceedsLiquidity ? `Insufficient Pool ${symbol}` :
                                        (!vaultBalance || vaultBalance.isZero()) ? "Pool Empty" :
                                            actionDisabled ? (isWithdrawing ? 'Withdrawing...' : 'Loading...') :
                                                isDelisted ? "Withdraw (~5% Bonus)" : // Special label for delisted standard withdraw
                                                    withdrawLabel // Original label for active tokens
                                }
                            </button>
                        </>

                        {/* --- Withdraw Full Balance Button (Only for Delisted) --- */}
                        {isDelisted && (
                            <div className="mt-1"> {/* Add some space */}
                                <button
                                    onClick={handleFullDelistedWithdraw}
                                    disabled={actionDisabled || !userHasEnoughForDelisted || (!vaultBalance || vaultBalance.isZero())}
                                    className={`w-full px-1 py-0.5 text-xs rounded text-white truncate ${BTN_RED} ${(actionDisabled || !userHasEnoughForDelisted || (!vaultBalance || vaultBalance.isZero())) ? 'cursor-not-allowed opacity-50' : ''}`}
                                    title={ // Tooltip logic remains the same
                                        actionDisabled ? "Action in progress..." :
                                            (!vaultBalance || vaultBalance.isZero()) ? `Pool vault for ${symbol} is empty.` :
                                                !requiredWlqiForDelistedFormatted ? "Could not calculate required wLQI." :
                                                    !userHasEnoughForDelisted ? `Insufficient wLQI. Need ~${requiredWlqiForDelistedFormatted} wLQI, You have ${formattedUserWlqiBalance ?? '--'}.` :
                                                        `Withdraw entire ${symbol} balance (~${formatRawAmountString(vaultBalance?.toString(), decimals, true, 2)} ${symbol}). Requires ~${requiredWlqiForDelistedFormatted} wLQI.`
                                    }
                                >
                                    {/* Dynamic Label */}
                                    {actionDisabled ? (isWithdrawing ? 'Withdrawing...' : 'Loading...') :
                                        (!vaultBalance || vaultBalance.isZero()) ? "Pool Empty" :
                                            !userHasEnoughForDelisted ? "Insufficient wLQI" :
                                                `Withdraw Full Balance`
                                    }
                                </button>
                            </div>
                        )}
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
                        <th className="p-2 w-16 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('symbol')}>
                            Symbol{getSortIndicator('symbol')}
                        </th>
                        <th className="p-2 w-32 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('value')}>
                            Pool Balance{getSortIndicator('value')}
                        </th>
                        <th className="p-2 w-28 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('actualPercent')}>
                            Actual %{getSortIndicator('actualPercent')}
                        </th>
                        <th className="p-2 w-28 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('targetPercent')}>
                            Target %{getSortIndicator('targetPercent')}
                        </th>
                        {!hideDepositColumn && (
                            <th className="p-2 w-40 text-center">Deposit</th>
                        )}
                        <th className="p-2 w-40 text-center">Withdraw</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedTokenData.map((token, index) => renderRow(token, index))}
                </tbody>
            </table>
        </div>
    );
});

// Optional: Add display name for better debugging
TokenTable.displayName = 'TokenTable'; 