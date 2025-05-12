'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { BN } from '@coral-xyz/anchor';
import { formatUnits } from 'ethers';
import { ProcessedTokenData } from '@/utils/types';
import {
    calculateTokenValueUsdScaled,
    calculateTotalTargetDominance,
    calculateTargetPercentageScaled,
    usdToTokenAmount,
    usdToWlqiAmount,
    estimateFeeBpsBN
} from '@/utils/calculations';
import { SkeletonTokenTable } from './SkeletonTokenTable';
import {
    PRECISION_SCALE_FACTOR,
    BPS_SCALE,
} from '@/utils/constants';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from './WalletModalProvider';

// Import the new components
import { TokenRow } from './TokenRow';
import { TokenCard } from './TokenCard';
import { MobileSortControls } from './MobileSortControls';

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
    handleAmountChange: (mintAddress: string, action: 'deposit' | 'withdraw', amount: string, decimals: number | null) => void;
    isLoadingUserData: boolean;
    isLoadingPublicData: boolean;
    hideDepositColumn?: boolean;
}

// Define type for sortable keys
export type SortableKey = 'symbol' | 'value' | 'actualPercent' | 'targetPercent' | 'depositFeeBonus' | 'withdrawFeeBonus';

// Fallback for sorting if fee/bonus cannot be estimated
const FEE_SORT_FALLBACK = new BN(1_000_000_000); // A very large fee

// --- TokenTable Component --- (Main component definition)
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
    hideDepositColumn = false,
}) => {
    const { t } = useTranslation();
    const { publicKey } = useWallet();
    const { setVisible } = useWalletModal();
    const [sortKey, setSortKey] = useState<SortableKey | null>('targetPercent');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const totalTargetDominance = useMemo(() => {
        if (!tokenData) return new BN(0);
        return calculateTotalTargetDominance(tokenData);
    }, [tokenData]);

    const rankedTokenMap = useMemo(() => {
        if (!tokenData) return new Map<string, number>();

        const nonDelistedTokens = tokenData.filter(token => !token.isDelisted);

        // Sort by targetDominance descending. Higher targetDominance = better rank (e.g., #1)
        const sortedByTargetDominance = [...nonDelistedTokens].sort((a, b) => {
            // BN.cmp: a.cmp(b) returns >0 if a > b, <0 if a < b, 0 if a === b
            // For descending sort by targetDominance, we want b to come before a if b.targetDominance > a.targetDominance
            return b.targetDominance.cmp(a.targetDominance);
        });

        const rankMap = new Map<string, number>();
        sortedByTargetDominance.forEach((token, index) => {
            rankMap.set(token.mintAddress, index + 1); // 1-based ranking
        });
        return rankMap;
    }, [tokenData]);

    const handleSort = useCallback((key: SortableKey, explicitDirection?: 'asc' | 'desc') => {
        setSortKey(key); // Always set the key
        if (explicitDirection) {
            setSortDirection(explicitDirection);
        } else {
            // If the key is the same as the current sortKey, toggle direction
            // Otherwise, default to 'desc' for the new key
            setSortDirection(prevDirection => (sortKey === key && prevDirection === 'desc') ? 'asc' : 'desc');
        }
    }, [sortKey]); // Added sortKey to dependencies of useCallback

    const sortedTokenData = useMemo(() => {
        if (!tokenData) return [];
        const dataToSort = [...tokenData];
        if (!sortKey) return dataToSort;

        const getCompareValues = (tokenItem: ProcessedTokenData) => {
            const tokenValueUsd = tokenItem.vaultBalance !== null && tokenItem.decimals !== null
                ? calculateTokenValueUsdScaled(tokenItem.vaultBalance, tokenItem.decimals, tokenItem.priceData)
                : null;
            const targetScaled = calculateTargetPercentageScaled(tokenItem.targetDominance, totalTargetDominance);
            const actualPercent = tokenItem.actualDominancePercent !== null && tokenItem.actualDominancePercent !== undefined
                ? new BN(Math.round(tokenItem.actualDominancePercent * BPS_SCALE))
                : new BN(-1); // Using -1 for undefined actualPercent to sort them last if needed

            // Calculate estimated fees/bonuses for sorting
            const nominalValueChangeUsdScaled = new BN(1);

            const depositFeeBonusSortValue = estimateFeeBpsBN(
                tokenItem.isDelisted,
                true, // isDeposit
                tokenValueUsd,
                totalPoolValueScaled,
                tokenItem.targetDominance,
                nominalValueChangeUsdScaled,
                wLqiValueScaled,
                wLqiDecimals
            ) ?? FEE_SORT_FALLBACK;

            const withdrawFeeBonusSortValue = estimateFeeBpsBN(
                tokenItem.isDelisted,
                false, // isDeposit
                tokenValueUsd,
                totalPoolValueScaled,
                tokenItem.targetDominance,
                nominalValueChangeUsdScaled,
                wLqiValueScaled,
                wLqiDecimals
            ) ?? FEE_SORT_FALLBACK;

            return {
                symbol: tokenItem.symbol ? tokenItem.symbol.trim().toLowerCase() : '', // Trim and normalize symbol
                value: tokenValueUsd ?? new BN(-1),
                targetPercent: targetScaled,
                actualPercent: actualPercent,
                depositFeeBonusSortValue,
                withdrawFeeBonusSortValue,
            };
        };

        dataToSort.sort((aItem, bItem) => {
            const valuesA = getCompareValues(aItem);
            const valuesB = getCompareValues(bItem);
            let compareResult = 0;

            switch (sortKey) {
                case 'symbol':
                    const strA = String(valuesA.symbol); // Ensure primitive string
                    const strB = String(valuesB.symbol); // Ensure primitive string
                    compareResult = strA.localeCompare(strB, 'en-US-u-co-standard'); // Specify locale and standard collation
                    // For Symbol: ▼ (desc state) means A-Z (natural compareResult)
                    //             ▲ (asc state) means Z-A (negated compareResult)
                    if (sortDirection === 'asc') compareResult = -compareResult;
                    break;
                case 'value':
                    compareResult = valuesA.value.cmp(valuesB.value);
                    if (sortDirection === 'desc') compareResult = -compareResult;
                    break;
                case 'targetPercent':
                    compareResult = valuesA.targetPercent.cmp(valuesB.targetPercent);
                    if (sortDirection === 'desc') compareResult = -compareResult;
                    break;
                case 'actualPercent':
                    compareResult = valuesA.actualPercent.cmp(valuesB.actualPercent);
                    if (sortDirection === 'desc') compareResult = -compareResult;
                    break;
                case 'depositFeeBonus':
                    compareResult = sortDirection === 'desc'
                        ? valuesA.depositFeeBonusSortValue.cmp(valuesB.depositFeeBonusSortValue)
                        : valuesB.depositFeeBonusSortValue.cmp(valuesA.depositFeeBonusSortValue);
                    break;
                case 'withdrawFeeBonus':
                    compareResult = sortDirection === 'desc'
                        ? valuesA.withdrawFeeBonusSortValue.cmp(valuesB.withdrawFeeBonusSortValue)
                        : valuesB.withdrawFeeBonusSortValue.cmp(valuesA.withdrawFeeBonusSortValue);
                    break;
            }

            // Secondary sort by targetPercent descending if primary sort result is equal for ANY sortKey
            if (compareResult === 0) {
                compareResult = valuesB.targetPercent.cmp(valuesA.targetPercent);
            }

            return compareResult;
        });
        return dataToSort;
    }, [tokenData, sortKey, sortDirection, totalTargetDominance, totalPoolValueScaled, wLqiValueScaled, wLqiDecimals]);

    const showRankColumn = useMemo(() => {
        if (!sortedTokenData || sortedTokenData.length === 0) {
            return false; // No data, so no rank column
        }
        // Show rank column if at least one token is not delisted
        return sortedTokenData.some(token => !token.isDelisted);
    }, [sortedTokenData]);

    const handleSetAmount = useCallback((mintAddress: string, action: 'deposit' | 'withdraw', fraction: number) => {
        if (!tokenData) return;
        let amountToSet = '0';
        const currentToken = action === 'deposit' ? tokenData.find(t => t.mintAddress === mintAddress) : null;
        if (action === 'deposit') {
            if (!currentToken || currentToken.userBalance === null || currentToken.decimals === null) return;
            const fullAmountBn = currentToken.userBalance;
            const targetAmountBn = fraction === 1 ? fullAmountBn : fullAmountBn.div(new BN(2));
            amountToSet = formatUnits(targetAmountBn.toString(), currentToken.decimals);
        } else {
            if (!userWlqiBalance || wLqiDecimals === null) return;
            const fullAmountBn = userWlqiBalance;
            const targetAmountBn = fraction === 1 ? fullAmountBn : fullAmountBn.div(new BN(2));
            amountToSet = formatUnits(targetAmountBn.toString(), wLqiDecimals);
        }
        if (amountToSet.endsWith('.0')) {
            amountToSet = amountToSet.substring(0, amountToSet.length - 2);
        }
        handleAmountChange(mintAddress, action, amountToSet, action === 'deposit' ? currentToken?.decimals ?? null : wLqiDecimals);
    }, [tokenData, userWlqiBalance, wLqiDecimals, handleAmountChange]);

    const handleSetTargetAmount = useCallback((mintAddress: string, action: 'deposit' | 'withdraw') => {
        console.log(`Calculating target amount for ${mintAddress}, action: ${action}`);
        const currentToken = tokenData?.find(t => t.mintAddress === mintAddress);
        if (!currentToken || currentToken.decimals === null || currentToken.targetDominance.isNeg()) {
            toast.error("Token data invalid for target calculation."); return;
        }
        let isTokenDataInvalid = false;
        if ((action === 'deposit' || !currentToken.isDelisted) && currentToken.targetDominance.isZero()) {
            isTokenDataInvalid = true;
        }
        if (isTokenDataInvalid) {
            toast.error("Token data invalid for target calculation."); return;
        }
        const T = currentToken.vaultBalance !== null && currentToken.decimals !== null
            ? calculateTokenValueUsdScaled(currentToken.vaultBalance, currentToken.decimals, currentToken.priceData) ?? new BN(0)
            : new BN(0);
        const P = totalPoolValueScaled;
        let amountToSet = '0';
        try {
            if (action === 'deposit') {
                const target_value_in_pool = P!.mul(currentToken.targetDominance).div(totalTargetDominance);
                const one_minus_target_dom_fraction_numer = totalTargetDominance.sub(currentToken.targetDominance);
                if (target_value_in_pool.lte(T)) {
                    toast.error("Cannot deposit to reach target, token already at or above."); return;
                }
                const valueDiff = target_value_in_pool.sub(T);
                const V_usd_scaled = valueDiff.mul(totalTargetDominance).div(one_minus_target_dom_fraction_numer);
                const tokenAmountScaledBn = usdToTokenAmount(V_usd_scaled, currentToken.decimals, currentToken.priceData);
                if (PRECISION_SCALE_FACTOR.isZero()) {
                    toast.error("Internal error: Precision scale factor is zero."); return;
                }
                const finalAmountBn = tokenAmountScaledBn.div(PRECISION_SCALE_FACTOR);
                if (finalAmountBn.isZero() && tokenAmountScaledBn.gtn(0)) {
                    toast.error("Target deposit amount is less than minimum transferable unit."); return;
                }
                if (finalAmountBn.isNeg()) {
                    toast.error("Calculated target amount is invalid (negative)."); return;
                }
                if (currentToken.userBalance && finalAmountBn.gt(currentToken.userBalance)) {
                    toast("Required amount exceeds balance. Setting to max.", { icon: '⚠️' });
                    amountToSet = formatUnits(currentToken.userBalance.toString(), currentToken.decimals);
                } else {
                    amountToSet = formatUnits(finalAmountBn.toString(), currentToken.decimals);
                }
            } else {
                if (currentToken.isDelisted) {
                    if (!currentToken.vaultBalance || currentToken.vaultBalance.isZero() || currentToken.vaultBalance.isNeg() || currentToken.decimals === null) {
                        toast.error("No pool balance to withdraw for this delisted token."); return;
                    }
                    const T_usd_scaled = calculateTokenValueUsdScaled(currentToken.vaultBalance, currentToken.decimals, currentToken.priceData);
                    if (!T_usd_scaled || T_usd_scaled.isZero() || T_usd_scaled.isNeg()) {
                        toast.error("Cannot calculate value of delisted token balance."); return;
                    }
                    const bonusNumerator = new BN(100);
                    const bonusDenominator = new BN(105);
                    const T_usd_scaled_adjusted = T_usd_scaled.mul(bonusNumerator).div(bonusDenominator);
                    const requiredWlqiAmountBn = usdToWlqiAmount(T_usd_scaled_adjusted, wLqiValueScaled, wLqiDecimals);
                    if (requiredWlqiAmountBn.isZero() || requiredWlqiAmountBn.isNeg()) {
                        toast.error("Calculated wLQI amount is zero or negative."); return;
                    }
                    if (wLqiDecimals === null) {
                        toast.error("wLQI decimals not available."); return;
                    }
                    if (userWlqiBalance && requiredWlqiAmountBn.gt(userWlqiBalance)) {
                        toast("Required wLQI withdraw amount exceeds your balance. Setting to max.", { icon: '⚠️' });
                        amountToSet = formatUnits(userWlqiBalance.toString(), wLqiDecimals);
                    } else {
                        const finalWlqiAmountBn = requiredWlqiAmountBn.add(new BN(1));
                        amountToSet = formatUnits(finalWlqiAmountBn.toString(), wLqiDecimals);
                    }
                } else {
                    const target_value_in_pool = P!.mul(currentToken.targetDominance).div(totalTargetDominance);
                    const one_minus_target_dom_fraction_numer = totalTargetDominance.sub(currentToken.targetDominance);
                    if (T.lte(target_value_in_pool)) {
                        toast.error("Cannot withdraw to reach target, token already at or below."); return;
                    }
                    if (one_minus_target_dom_fraction_numer.isZero() || one_minus_target_dom_fraction_numer.isNeg()) {
                        toast.error("Invalid target dominance for calculation."); return;
                    }
                    const valueDiff = T.sub(target_value_in_pool);
                    const V_usd_scaled = valueDiff.mul(totalTargetDominance).div(one_minus_target_dom_fraction_numer);
                    const wLqiAmountBn = usdToWlqiAmount(V_usd_scaled, wLqiValueScaled, wLqiDecimals);
                    if (wLqiAmountBn.isZero() || wLqiAmountBn.isNeg()) {
                        toast.error("Calculated wLQI amount is zero or negative."); return;
                    }
                    if (wLqiDecimals === null) {
                        toast.error("wLQI decimals not available."); return;
                    }
                    if (userWlqiBalance && wLqiAmountBn.gt(userWlqiBalance)) {
                        toast("Required wLQI withdraw amount exceeds balance. Setting to max.", { icon: '⚠️' });
                        amountToSet = formatUnits(userWlqiBalance.toString(), wLqiDecimals);
                    } else {
                        amountToSet = formatUnits(wLqiAmountBn.toString(), wLqiDecimals);
                    }
                }
            }
            if (amountToSet.endsWith('.0')) {
                amountToSet = amountToSet.substring(0, amountToSet.length - 2);
            }
            if (parseFloat(amountToSet) <= 0) {
                toast.error("Calculated target amount is too small."); return;
            }
            handleAmountChange(mintAddress, action, amountToSet, action === 'deposit' ? currentToken?.decimals ?? null : wLqiDecimals);
        } catch (error) {
            console.error(`Error calculating target amount for ${action}:`, error);
            toast.error(`Failed to calculate target ${action} amount.`);
        }
    }, [tokenData, totalPoolValueScaled, totalTargetDominance, wLqiValueScaled, wLqiDecimals, handleAmountChange, userWlqiBalance]);

    if (isLoadingPublicData && !tokenData) {
        return <SkeletonTokenTable />;
    }
    if (!tokenData || sortedTokenData.length === 0) {
        return <div className="text-center text-gray-400 italic p-4">{t('tokenTable.noData')}</div>;
    }

    const getSortIndicator = (key: SortableKey): string => {
        if (sortKey !== key) return '';
        return sortDirection === 'asc' ? ' ▲' : ' ▼';
    };

    return (
        <div className="">
            {/* --- Desktop Table (Hidden on Mobile) --- */}
            <div className="hidden md:block">
                <table className="min-w-full bg-gray-700 text-xs text-left table-fixed mb-2">
                    <thead className="sticky top-14 z-10 bg-gray-600">
                        <tr className="bg-gray-600 rounded-tl-md rounded-tr-md overflow-hidden">
                            {showRankColumn && (
                                <th scope="col" className="p-2 text-center bg-gray-600 rounded-tl-md">{t('tokenTable.columns.rank')}</th>
                            )}
                            <th className="p-2 w-28 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('symbol')}>
                                {t('tokenTable.columns.symbol')}{getSortIndicator('symbol')}
                            </th>
                            <th className="p-2 w-48 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('value')}>
                                {t('tokenTable.columns.poolBalance')}{getSortIndicator('value')}
                            </th>
                            <th className="p-2 w-28 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('actualPercent')}>
                                {t('tokenTable.columns.actualPercent')}{getSortIndicator('actualPercent')}
                            </th>
                            <th className="p-2 w-28 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('targetPercent')}>
                                {t('tokenTable.columns.targetPercent')}{getSortIndicator('targetPercent')}
                            </th>
                            {!hideDepositColumn && (
                                <th className="p-2 w-40 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('depositFeeBonus')}>
                                    {t('tokenTable.columns.deposit')}{getSortIndicator('depositFeeBonus')}
                                </th>
                            )}
                            <th className="p-2 w-40 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('withdrawFeeBonus')}>
                                {t('tokenTable.columns.withdraw')}{getSortIndicator('withdrawFeeBonus')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedTokenData.map((tokenItem, idx) => {
                            const targetRank = tokenItem.isDelisted ? null : rankedTokenMap.get(tokenItem.mintAddress) ?? null;
                            return (
                                <TokenRow
                                    key={tokenItem.mintAddress}
                                    token={tokenItem}
                                    index={idx}
                                    targetRank={targetRank}
                                    showRankColumn={showRankColumn}
                                    totalPoolValueScaled={totalPoolValueScaled}
                                    wLqiValueScaled={wLqiValueScaled}
                                    wLqiDecimals={wLqiDecimals}
                                    userWlqiBalance={userWlqiBalance}
                                    onDeposit={onDeposit}
                                    onWithdraw={onWithdraw}
                                    isDepositing={isDepositing}
                                    isWithdrawing={isWithdrawing}
                                    depositAmounts={depositAmounts}
                                    withdrawAmounts={withdrawAmounts}
                                    handleAmountChange={handleAmountChange}
                                    isLoadingUserData={isLoadingUserData}
                                    isLoadingPublicData={isLoadingPublicData}
                                    hideDepositColumn={hideDepositColumn}
                                    handleSetAmount={handleSetAmount}
                                    handleSetTargetAmount={handleSetTargetAmount}
                                    totalTargetDominance={totalTargetDominance}
                                    publicKey={publicKey}
                                    setVisible={setVisible}
                                />
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* --- Mobile Card List (Visible on Mobile) --- */}
            <div className="block md:hidden space-y-3 px-2 py-2">
                <MobileSortControls
                    currentSortKey={sortKey}
                    currentSortDirection={sortDirection}
                    handleSort={handleSort}
                    hideDepositColumn={hideDepositColumn}
                />
                {sortedTokenData.map((tokenItem) => {
                    const targetRank = tokenItem.isDelisted ? null : rankedTokenMap.get(tokenItem.mintAddress) ?? null;
                    return (
                        <TokenCard
                            key={tokenItem.mintAddress}
                            token={tokenItem}
                            targetRank={targetRank}
                            showRankColumn={showRankColumn}
                            totalPoolValueScaled={totalPoolValueScaled}
                            wLqiValueScaled={wLqiValueScaled}
                            wLqiDecimals={wLqiDecimals}
                            userWlqiBalance={userWlqiBalance}
                            onDeposit={onDeposit}
                            onWithdraw={onWithdraw}
                            isDepositing={isDepositing}
                            isWithdrawing={isWithdrawing}
                            depositAmounts={depositAmounts}
                            withdrawAmounts={withdrawAmounts}
                            handleAmountChange={handleAmountChange}
                            isLoadingUserData={isLoadingUserData}
                            isLoadingPublicData={isLoadingPublicData}
                            hideDepositColumn={hideDepositColumn}
                            handleSetAmount={handleSetAmount}
                            handleSetTargetAmount={handleSetTargetAmount}
                            totalTargetDominance={totalTargetDominance}
                            publicKey={publicKey}
                            setVisible={setVisible}
                        />
                    );
                })}
            </div>
        </div>
    );
});

TokenTable.displayName = 'TokenTable';
