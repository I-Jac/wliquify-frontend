'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { BN } from '@coral-xyz/anchor';
import { formatUnits, parseUnits } from 'ethers';
import {
    ProcessedTokenData,
    calculateTokenValueUsdScaled,
    calculateTotalTargetDominance,
    calculateTargetPercentageScaled,
    formatScaledBnToDollarString,
    formatRawAmountString,
    formatScaledToPercentageString,
    usdToTokenAmount,
    usdToWlqiAmount,
    calculateRelativeDeviationBpsBN
} from '@/utils/calculations';
import { calculateButtonStates } from '@/utils/buttonState';
import { calculateFees } from '@/utils/fees';
import { TokenInputControls } from './TokenInputControls';
import { SkeletonTokenTable } from './SkeletonTokenTable';
import {
    USD_SCALE,
    DOMINANCE_SCALE_FACTOR,
    BN_DOMINANCE_SCALE,
    PRICE_SCALE_FACTOR,
    PERCENTAGE_CALC_SCALE,
    BN_PERCENTAGE_CALC_SCALE,
    BPS_SCALE,
    BN_BPS_SCALE,
    BASE_FEE_BPS,
    BN_BASE_FEE_BPS,
    FEE_K_FACTOR_NUMERATOR,
    BN_FEE_K_FACTOR_NUMERATOR,
    FEE_K_FACTOR_DENOMINATOR,
    BN_FEE_K_FACTOR_DENOMINATOR,
    DEPOSIT_PREMIUM_CAP_BPS,
    BN_DEPOSIT_PREMIUM_CAP_BPS,
    WITHDRAW_FEE_FLOOR_BPS,
    BN_WITHDRAW_FEE_FLOOR_BPS,
    DEPOSIT_MAX_FEE_BPS,
    BN_DEPOSIT_MAX_FEE_BPS,
    WITHDRAW_MAX_FEE_BPS,
    BN_WITHDRAW_MAX_FEE_BPS,
    PRECISION_SCALE_FACTOR,
    BTN_GREEN,
    BTN_RED,
    BTN_GRAY
} from '@/utils/constants';
import toast from 'react-hot-toast';
import Image from 'next/image';

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
    hideDepositColumn?: boolean;
}

// --- ADDED: TokenRow Props ---
interface TokenRowProps {
    token: ProcessedTokenData;
    index: number;
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
    hideDepositColumn: boolean;
    // Callbacks from TokenTable
    handleSetAmount: (mintAddress: string, action: 'deposit' | 'withdraw', fraction: number) => void;
    handleSetTargetAmount: (mintAddress: string, action: 'deposit' | 'withdraw') => void;
    // Calculated values from TokenTable
    totalTargetDominance: BN;
}

// --- ADDED: TokenCard Props --- 
type TokenCardProps = Omit<TokenRowProps, 'index'>;

// Define type for sortable keys
type SortableKey = 'symbol' | 'value' | 'actualPercent' | 'targetPercent';

// --- ADDED: TokenRow Component ---
const TokenRow: React.FC<TokenRowProps> = React.memo(({
    token,
    index,
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
    hideDepositColumn,
    handleSetAmount,
    handleSetTargetAmount,
    totalTargetDominance,
}) => {
    // Destructure token object inside the function
    const { mintAddress, symbol, icon, priceData, vaultBalance, decimals, targetDominance, isDelisted } = token;
    const [currentIconSrc, setCurrentIconSrc] = useState(icon); // MOVED: State for icon source is now here

    // --- Action Disabled Flag ---
    const actionDisabled = isDepositing || isWithdrawing || isLoadingPublicData || isLoadingUserData;

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
        }
    }

    // --- Fee & Liquidity Calculations ---
    const { estimatedDepositFeeBps, estimatedWithdrawFeeBps, withdrawalExceedsLiquidity } = calculateFees({
        totalPoolValueScaled,
        totalTargetDominance,
        tokenValueUsd,
        targetDominance,
        isDepositInputFilled,
        isWithdrawInputFilled,
        currentDepositAmount,
        currentWithdrawAmount,
        decimals,
        wLqiDecimals,
        wLqiValueScaled,
        priceData,
        vaultBalance,
    });

    // --- Button State & Labels ---
    const buttonStates = calculateButtonStates({
        actionDisabled,
        isDepositing,
        isWithdrawing,
        isDepositInputFilled,
        isWithdrawInputFilled,
        isDelisted,
        depositInsufficientBalance,
        withdrawInsufficientBalance,
        withdrawalExceedsLiquidity,
        vaultBalance,
        symbol,
        estimatedDepositFeeBps,
        estimatedWithdrawFeeBps,
    });

    const {
        depositButtonDisabled,
        withdrawButtonDisabled,
        depositBtnClass,
        withdrawBtnClass,
        depositLabel,
        withdrawLabel,
        depositTitle,
        withdrawTitle,
    } = buttonStates;

    // Formatted display values
    const displayBalance = formatRawAmountString(vaultBalance?.toString(), decimals, true, 2);
    const displayValue = formatScaledBnToDollarString(tokenValueUsd, USD_SCALE);
    const displaySymbol = symbol;
    const displayTargetPercent = formatScaledToPercentageString(targetScaled);
    const displayActualPercent = (typeof token.actualDominancePercent === 'number')
        ? token.actualDominancePercent.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
        : '--.--';
    const currentUserBalance = token.userBalance;
    const formattedUserTokenBalance = currentUserBalance !== null
        ? formatRawAmountString(currentUserBalance.toString(), decimals, true, 2)
        : null;
    const displayUserTokenBalance = formattedUserTokenBalance ? `${formattedUserTokenBalance} ${symbol}` : '--.--';
    const formattedUserWlqiBalance = userWlqiBalance !== null && wLqiDecimals !== null
        ? formatRawAmountString(userWlqiBalance.toString(), wLqiDecimals, true, 2)
        : null;
    const displayUserWlqiBalance = formattedUserWlqiBalance ? `${formattedUserWlqiBalance} wLQI` : '--.--';
    let displayDepositInputUsdValue = '$ --.--';
    if (isDepositInputFilled && decimals !== null && priceData) {
        try {
            const inputAmountBn = new BN(parseUnits(currentDepositAmount, decimals).toString());
            const inputUsdValueScaled = calculateTokenValueUsdScaled(inputAmountBn, decimals, priceData);
            displayDepositInputUsdValue = formatScaledBnToDollarString(inputUsdValueScaled, USD_SCALE);
        } catch { displayDepositInputUsdValue = '$ Invalid'; }
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
        } catch { displayWithdrawInputUsdValue = '$ Invalid'; }
    } else if (currentWithdrawAmount === '' || currentWithdrawAmount === '0') {
        displayWithdrawInputUsdValue = '$ 0.00';
    }

    // Button callbacks
    const handleActualDeposit = () => onDeposit(mintAddress, currentDepositAmount, decimals);
    const handleActualWithdraw = () => onWithdraw(mintAddress, currentWithdrawAmount, false);
    const handleFullDelistedWithdraw = () => onWithdraw(mintAddress, "0", true);
    let requiredWlqiForDelistedBn: BN | null = null;
    let requiredWlqiForDelistedFormatted: string | null = null;
    let userHasEnoughForDelisted = false;
    if (isDelisted && vaultBalance && !vaultBalance.isZero() && decimals !== null && wLqiValueScaled && !wLqiValueScaled.isZero() && wLqiDecimals !== null) {
        try {
            const T_usd_scaled = calculateTokenValueUsdScaled(vaultBalance, decimals, priceData);
            if (T_usd_scaled && T_usd_scaled.gtn(0)) {
                const bonusNumerator = new BN(100);
                const bonusDenominator = new BN(105);
                const T_usd_scaled_adjusted = T_usd_scaled.mul(bonusNumerator).div(bonusDenominator);
                const requiredWlqi = usdToWlqiAmount(T_usd_scaled_adjusted, wLqiValueScaled, wLqiDecimals);
                requiredWlqiForDelistedBn = requiredWlqi.add(new BN(1));
                requiredWlqiForDelistedFormatted = formatRawAmountString(requiredWlqiForDelistedBn.toString(), wLqiDecimals, true, 4);
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
    const actualPercentBN = token.actualDominancePercent !== null && token.actualDominancePercent !== undefined
        ? new BN(Math.round(token.actualDominancePercent * BPS_SCALE))
        : null;

    return (
        <tr key={mintAddress} className={`border-b border-gray-600 ${index % 2 === 0 ? 'bg-gray-700' : 'bg-gray-750'} hover:bg-gray-600 ${actionDisabled ? 'opacity-50' : ''} ${isDelisted ? 'bg-red-900/30' : ''}`}>
            <td className="p-0 font-semibold align-middle text-center" title={token.mintAddress}>
                <div className="flex items-center justify-center h-full space-x-2 px-2">
                    <Image
                        src={currentIconSrc}
                        alt={symbol}
                        className="w-6 h-6 rounded-full"
                        width={24}
                        height={24}
                        onError={() => {
                            if (currentIconSrc !== '/tokens/default.png') {
                                setCurrentIconSrc('/tokens/default.png');
                            }
                        }}
                    />
                    <span className="">{displaySymbol}</span>
                </div>
            </td>
            <td className="p-2 align-middle text-center">
                <div>{displayValue}</div>
                <div className="text-gray-400">{displayBalance} {displaySymbol}</div>
            </td>
            <td className="p-2 align-middle text-center">{displayActualPercent}%</td>
            <td className="p-2 align-middle text-center">{displayTargetPercent}%</td>
            {!hideDepositColumn && (
                <td className="p-2 align-middle">
                    {isDelisted ? (
                        <div className="text-center text-gray-500 italic">N/A</div>
                    ) : (
                        <div className="flex flex-col space-y-1">
                            <TokenInputControls
                                mintAddress={mintAddress}
                                symbol={symbol}
                                action="deposit"
                                currentAmount={currentDepositAmount}
                                decimals={decimals}
                                priceData={priceData}
                                wLqiValueScaled={wLqiValueScaled}
                                wLqiDecimals={wLqiDecimals}
                                userBalance={token.userBalance}
                                actionDisabled={actionDisabled}
                                isDelisted={isDelisted}
                                handleAmountChange={handleAmountChange}
                                handleSetAmount={handleSetAmount}
                                handleSetTargetAmount={handleSetTargetAmount}
                                showTargetButton={!actionDisabled && actualPercentBN?.lt(targetScaled)}
                                isMobile={false}
                            />
                            <button onClick={handleActualDeposit} disabled={depositButtonDisabled} className={`w-full px-1 py-0.5 text-xs rounded text-white truncate ${depositBtnClass} ${depositButtonDisabled ? 'cursor-not-allowed opacity-50' : ''}`} title={depositTitle}>{depositLabel}</button>
                        </div>
                    )}
                </td>
            )}
            <td className="p-2 align-middle">
                <div className="flex flex-col space-y-1">
                    <TokenInputControls
                        mintAddress={mintAddress}
                        symbol={symbol}
                        action="withdraw"
                        currentAmount={currentWithdrawAmount}
                        decimals={decimals}
                        priceData={priceData}
                        wLqiValueScaled={wLqiValueScaled}
                        wLqiDecimals={wLqiDecimals}
                        userBalance={userWlqiBalance}
                        actionDisabled={actionDisabled}
                        isDelisted={isDelisted}
                        handleAmountChange={handleAmountChange}
                        handleSetAmount={handleSetAmount}
                        handleSetTargetAmount={handleSetTargetAmount}
                        showTargetButton={!isDelisted && !actionDisabled && actualPercentBN?.gt(targetScaled)}
                        isMobile={false}
                    />
                    <button onClick={handleActualWithdraw} disabled={withdrawButtonDisabled} className={`w-full px-1 py-0.5 text-xs rounded text-white truncate ${withdrawBtnClass} ${withdrawButtonDisabled ? 'cursor-not-allowed opacity-50' : ''}`} title={withdrawTitle}>{withdrawLabel}</button>
                    {isDelisted && (
                        <div className="mt-1">
                            <button onClick={handleFullDelistedWithdraw} disabled={actionDisabled || !userHasEnoughForDelisted || (!vaultBalance || vaultBalance.isZero())} className={`w-full px-1 py-0.5 text-xs rounded text-white truncate ${!userHasEnoughForDelisted ? BTN_GRAY : BTN_RED} ${(actionDisabled || !userHasEnoughForDelisted || (!vaultBalance || vaultBalance.isZero())) ? 'cursor-not-allowed opacity-50' : ''}`} title={actionDisabled ? "Action in progress..." : (!vaultBalance || vaultBalance.isZero()) ? `Pool vault empty.` : !requiredWlqiForDelistedFormatted ? "Calc error." : !userHasEnoughForDelisted ? `Insufficient wLQI. Need ~${requiredWlqiForDelistedFormatted}` : `Withdraw entire ${symbol} balance. Requires ~${requiredWlqiForDelistedFormatted} wLQI.`}>{actionDisabled ? (isWithdrawing ? 'Withdrawing...' : '...') : (!vaultBalance || vaultBalance.isZero()) ? "Pool Empty" : !userHasEnoughForDelisted ? "Insufficient wLQI" : `Withdraw Full Balance`}</button>
                        </div>
                    )}
                </div>
            </td>
        </tr>
    );
});
TokenRow.displayName = 'TokenRow';

// --- ADDED: TokenCard Component (Now with full fee logic) ---
const TokenCard: React.FC<TokenCardProps> = React.memo(({
    token,
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
    hideDepositColumn,
    handleSetAmount,
    handleSetTargetAmount,
    totalTargetDominance,
}) => {
    // --- Re-use calculations and formatting logic from TokenRow --- 
    const { mintAddress, symbol, icon, priceData, vaultBalance, decimals, targetDominance, isDelisted } = token;
    const [currentIconSrc, setCurrentIconSrc] = useState(icon);
    const actionDisabled = isDepositing || isWithdrawing || isLoadingPublicData || isLoadingUserData;
    const tokenValueUsd = vaultBalance !== null && decimals !== null
        ? calculateTokenValueUsdScaled(vaultBalance, decimals, priceData)
        : null;
    const targetScaled = calculateTargetPercentageScaled(targetDominance, totalTargetDominance);
    const currentDepositAmount = depositAmounts[mintAddress] || '';
    const currentWithdrawAmount = withdrawAmounts[mintAddress] || '';
    const isDepositInputFilled = currentDepositAmount !== '' && parseFloat(currentDepositAmount) > 0;
    const isWithdrawInputFilled = currentWithdrawAmount !== '' && parseFloat(currentWithdrawAmount) > 0;

    // Insufficient balance checks
    let depositInsufficientBalance = false;
    if (isDepositInputFilled && token.userBalance && decimals !== null) {
        try {
            const inputAmountBn = new BN(parseUnits(currentDepositAmount, decimals).toString());
            if (inputAmountBn.gt(token.userBalance)) depositInsufficientBalance = true;
        } catch (e) { console.warn("Error parsing deposit for card balance check:", e); }
    }
    let withdrawInsufficientBalance = false;
    if (isWithdrawInputFilled && userWlqiBalance && wLqiDecimals !== null) {
        try {
            const inputWlqiAmountBn = new BN(parseUnits(currentWithdrawAmount, wLqiDecimals).toString());
            if (inputWlqiAmountBn.gt(userWlqiBalance)) withdrawInsufficientBalance = true;
        } catch (e) { console.warn("Error parsing withdraw for card balance check:", e); }
    }

    // --- Fee & Liquidity Calculations ---
    const { estimatedDepositFeeBps, estimatedWithdrawFeeBps, withdrawalExceedsLiquidity } = calculateFees({
        totalPoolValueScaled,
        totalTargetDominance,
        tokenValueUsd,
        targetDominance,
        isDepositInputFilled,
        isWithdrawInputFilled,
        currentDepositAmount,
        currentWithdrawAmount,
        decimals,
        wLqiDecimals,
        wLqiValueScaled,
        priceData,
        vaultBalance,
    });

    // --- Button State & Labels ---
    const buttonStates = calculateButtonStates({
        actionDisabled,
        isDepositing,
        isWithdrawing,
        isDepositInputFilled,
        isWithdrawInputFilled,
        isDelisted,
        depositInsufficientBalance,
        withdrawInsufficientBalance,
        withdrawalExceedsLiquidity,
        vaultBalance,
        symbol,
        estimatedDepositFeeBps,
        estimatedWithdrawFeeBps,
    });

    const {
        depositButtonDisabled,
        withdrawButtonDisabled,
        depositBtnClass,
        withdrawBtnClass,
        depositLabel,
        withdrawLabel,
        depositTitle,
        withdrawTitle,
    } = buttonStates;

    // Formatted display values
    const displayBalance = formatRawAmountString(vaultBalance?.toString(), decimals, true, 2);
    const displayValue = formatScaledBnToDollarString(tokenValueUsd, USD_SCALE);
    const displaySymbol = symbol;
    const displayTargetPercent = formatScaledToPercentageString(targetScaled);
    const displayActualPercent = (typeof token.actualDominancePercent === 'number')
        ? token.actualDominancePercent.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
        : '--.--';
    const currentUserBalance = token.userBalance;
    const formattedUserTokenBalance = currentUserBalance !== null
        ? formatRawAmountString(currentUserBalance.toString(), decimals, true, 2)
        : null;
    const displayUserTokenBalance = formattedUserTokenBalance ? `${formattedUserTokenBalance} ${symbol}` : '--.--';
    const formattedUserWlqiBalance = userWlqiBalance !== null && wLqiDecimals !== null
        ? formatRawAmountString(userWlqiBalance.toString(), wLqiDecimals, true, 2)
        : null;
    const displayUserWlqiBalance = formattedUserWlqiBalance ? `${formattedUserWlqiBalance} wLQI` : '--.--';
    let displayDepositInputUsdValue = '$ --.--';
    if (isDepositInputFilled && decimals !== null && priceData) {
        try {
            const inputAmountBn = new BN(parseUnits(currentDepositAmount, decimals).toString());
            const inputUsdValueScaled = calculateTokenValueUsdScaled(inputAmountBn, decimals, priceData);
            displayDepositInputUsdValue = formatScaledBnToDollarString(inputUsdValueScaled, USD_SCALE);
        } catch { displayDepositInputUsdValue = '$ Invalid'; }
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
        } catch { displayWithdrawInputUsdValue = '$ Invalid'; }
    } else if (currentWithdrawAmount === '' || currentWithdrawAmount === '0') {
        displayWithdrawInputUsdValue = '$ 0.00';
    }

    // Button callbacks
    const handleActualDeposit = () => onDeposit(mintAddress, currentDepositAmount, decimals);
    const handleActualWithdraw = () => onWithdraw(mintAddress, currentWithdrawAmount, false);
    const handleFullDelistedWithdraw = () => onWithdraw(mintAddress, "0", true);
    let requiredWlqiForDelistedBn: BN | null = null;
    let requiredWlqiForDelistedFormatted: string | null = null;
    let userHasEnoughForDelisted = false;
    if (isDelisted && vaultBalance && !vaultBalance.isZero() && decimals !== null && wLqiValueScaled && !wLqiValueScaled.isZero() && wLqiDecimals !== null) {
        try {
            const T_usd_scaled = calculateTokenValueUsdScaled(vaultBalance, decimals, priceData);
            if (T_usd_scaled && T_usd_scaled.gtn(0)) {
                const bonusNumerator = new BN(100);
                const bonusDenominator = new BN(105);
                const T_usd_scaled_adjusted = T_usd_scaled.mul(bonusNumerator).div(bonusDenominator);
                const requiredWlqi = usdToWlqiAmount(T_usd_scaled_adjusted, wLqiValueScaled, wLqiDecimals);
                requiredWlqiForDelistedBn = requiredWlqi.add(new BN(1));
                requiredWlqiForDelistedFormatted = formatRawAmountString(requiredWlqiForDelistedBn.toString(), wLqiDecimals, true, 4);
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
    const actualPercentBN = token.actualDominancePercent !== null && token.actualDominancePercent !== undefined
        ? new BN(Math.round(token.actualDominancePercent * BPS_SCALE))
        : null;

    return (
        <div className={`border border-gray-600 rounded-lg p-3 ${isDelisted ? 'bg-red-900/20' : 'bg-gray-750'} ${actionDisabled ? 'opacity-50' : ''}`}>
            {/* --- Header --- */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-600">
                <div className="flex items-center space-x-2">
                    <Image
                        src={currentIconSrc}
                        alt={symbol}
                        className="w-6 h-6 rounded-full"
                        width={24}
                        height={24}
                        onError={() => {
                            if (currentIconSrc !== '/tokens/default.png') {
                                setCurrentIconSrc('/tokens/default.png');
                            }
                        }}
                    />
                    <span className="font-semibold text-white text-lg">{displaySymbol}</span>
                </div>
                {isDelisted && <span className="text-xs text-red-400 font-medium bg-red-900/50 px-1.5 py-0.5 rounded">Delisted</span>}
            </div>

            {/* --- Data Section --- */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-4 text-sm">
                <div className="text-gray-400">Pool Balance:</div>
                <div className="text-right text-white font-medium">{displayValue}</div>

                <div className="text-gray-400"></div> {/* Empty cell for alignment */}
                <div className="text-right text-gray-300 text-xs">{displayBalance} {displaySymbol}</div>

                <div className="text-gray-400 mt-1">Actual %:</div>
                <div className="text-right text-white font-medium mt-1">{displayActualPercent}%</div>

                <div className="text-gray-400">Target %:</div>
                <div className="text-right text-white font-medium">{displayTargetPercent}%</div>
            </div>

            {/* --- Deposit Section --- */}
            {!hideDepositColumn && !isDelisted && (
                <div className="mb-4 border-t border-gray-600 pt-3">
                    <h4 className="text-sm font-semibold mb-2 text-gray-200">Deposit {displaySymbol}</h4>
                    <TokenInputControls
                        mintAddress={mintAddress}
                        symbol={symbol}
                        action="deposit"
                        currentAmount={currentDepositAmount}
                        decimals={decimals}
                        priceData={priceData}
                        wLqiValueScaled={wLqiValueScaled}
                        wLqiDecimals={wLqiDecimals}
                        userBalance={token.userBalance}
                        actionDisabled={actionDisabled}
                        isDelisted={isDelisted}
                        handleAmountChange={handleAmountChange}
                        handleSetAmount={handleSetAmount}
                        handleSetTargetAmount={handleSetTargetAmount}
                        showTargetButton={!actionDisabled && actualPercentBN?.lt(targetScaled)}
                        isMobile={true}
                    />
                    <button onClick={handleActualDeposit} disabled={depositButtonDisabled} className={`w-full px-3 py-1.5 text-sm rounded text-white font-medium ${depositBtnClass} ${depositButtonDisabled ? 'cursor-not-allowed opacity-50' : ''}`} title={depositTitle}>{depositLabel}</button>
                </div>
            )}

            {/* --- Withdraw Section --- */}
            <div className={`${!hideDepositColumn && !isDelisted ? 'border-t border-gray-600 pt-3' : '' }`}>
                <h4 className="text-sm font-semibold mb-2 text-gray-200">Withdraw {displaySymbol}</h4>
                <TokenInputControls
                    mintAddress={mintAddress}
                    symbol={symbol}
                    action="withdraw"
                    currentAmount={currentWithdrawAmount}
                    decimals={decimals}
                    priceData={priceData}
                    wLqiValueScaled={wLqiValueScaled}
                    wLqiDecimals={wLqiDecimals}
                    userBalance={userWlqiBalance}
                    actionDisabled={actionDisabled}
                    isDelisted={isDelisted}
                    handleAmountChange={handleAmountChange}
                    handleSetAmount={handleSetAmount}
                    handleSetTargetAmount={handleSetTargetAmount}
                    showTargetButton={!isDelisted && !actionDisabled && actualPercentBN?.gt(targetScaled)}
                    isMobile={true}
                />
                <button onClick={handleActualWithdraw} disabled={withdrawButtonDisabled} className={`w-full px-3 py-1.5 text-sm rounded text-white font-medium ${withdrawBtnClass} ${withdrawButtonDisabled ? 'cursor-not-allowed opacity-50' : ''}`} title={withdrawTitle}>{withdrawLabel}</button>
                {isDelisted && (
                    <div className="mt-2">
                        <button onClick={handleFullDelistedWithdraw} disabled={actionDisabled || !userHasEnoughForDelisted || (!vaultBalance || vaultBalance.isZero())} className={`w-full px-3 py-1.5 text-sm rounded text-white font-medium ${!userHasEnoughForDelisted ? BTN_GRAY : BTN_RED} ${(actionDisabled || !userHasEnoughForDelisted || (!vaultBalance || vaultBalance.isZero())) ? 'cursor-not-allowed opacity-50' : ''}`} title={actionDisabled ? "..." : (!vaultBalance || vaultBalance.isZero()) ? `Pool vault empty.` : !requiredWlqiForDelistedFormatted ? "Calc error." : !userHasEnoughForDelisted ? `Insufficient wLQI. Need ~${requiredWlqiForDelistedFormatted}` : `Withdraw entire ${symbol} balance. Requires ~${requiredWlqiForDelistedFormatted} wLQI.`}>{actionDisabled ? (isWithdrawing ? 'Withdrawing...' : '...') : (!vaultBalance || vaultBalance.isZero()) ? "Pool Empty" : !userHasEnoughForDelisted ? "Insufficient wLQI" : `Withdraw Full Balance`}</button>
                    </div>
                )}
            </div>
        </div>
    );
});
TokenCard.displayName = 'TokenCard';

// --- TokenTable Component --- (Main component definition)
export const TokenTable = React.memo<TokenTableProps>(({ // Existing React.memo wrapper
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
    const [sortKey, setSortKey] = useState<SortableKey | null>('targetPercent');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const totalTargetDominance = useMemo(() => {
        if (!tokenData) return new BN(0);
        return calculateTotalTargetDominance(tokenData);
    }, [tokenData]);

    const handleSort = (key: SortableKey) => {
        if (sortKey === key) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    const sortedTokenData = useMemo(() => {
        if (!tokenData) return [];
        const dataToSort = [...tokenData];
        if (!sortKey) return dataToSort;
        const getCompareValues = (tokenItem: ProcessedTokenData) => {
            const tokenValueUsd = tokenItem.vaultBalance !== null && tokenItem.decimals !== null
                ? calculateTokenValueUsdScaled(tokenItem.vaultBalance, tokenItem.decimals, tokenItem.priceData)
                : null;
            const targetScaled = calculateTargetPercentageScaled(tokenItem.targetDominance, totalTargetDominance);
            return {
                symbol: tokenItem.symbol,
                value: tokenValueUsd ?? new BN(-1),
                targetPercent: targetScaled,
            };
        };
        dataToSort.sort((a, b) => {
            const valuesA = getCompareValues(a);
            const valuesB = getCompareValues(b);
            let compareResult = 0;
            switch (sortKey) {
                case 'symbol': compareResult = valuesA.symbol.localeCompare(valuesB.symbol); break;
                case 'value': compareResult = valuesA.value.cmp(valuesB.value); break;
                case 'targetPercent': compareResult = valuesA.targetPercent.cmp(valuesB.targetPercent); break;
            }
            return sortDirection === 'asc' ? compareResult : -compareResult;
        });
        return dataToSort;
    }, [tokenData, sortKey, sortDirection, totalTargetDominance]);

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
        handleAmountChange(mintAddress, action, amountToSet);
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
            handleAmountChange(mintAddress, action, amountToSet);
        } catch (error) {
            console.error(`Error calculating target amount for ${action}:`, error);
            toast.error(`Failed to calculate target ${action} amount.`);
        }
    }, [tokenData, totalPoolValueScaled, totalTargetDominance, wLqiValueScaled, wLqiDecimals, handleAmountChange, userWlqiBalance]);

    if (isLoadingPublicData && !tokenData) {
        return <SkeletonTokenTable />;
    }
    if (!tokenData || sortedTokenData.length === 0) {
        return <div className="text-center text-gray-400 italic p-4">No token data available.</div>;
    }

    const getSortIndicator = (key: SortableKey): string => {
        if (sortKey !== key) return '';
        return sortDirection === 'asc' ? ' ▲' : ' ▼';
    };

    return (
        <div className="overflow-x-auto">
            {/* --- Desktop Table (Hidden on Mobile) --- */}
            <div className="hidden md:block">
                <table className="min-w-full bg-gray-700 text-xs text-left table-fixed mb-2">
                    <thead className="bg-gray-600">
                        <tr><th className="p-2 w-16 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('symbol')}
                        >Symbol{getSortIndicator('symbol')}</th><th className="p-2 w-32 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('value')}
                        >Pool Balance{getSortIndicator('value')}</th><th className="p-2 w-28 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('actualPercent')}
                        >Actual %{/*getSortIndicator('actualPercent')*/}</th><th className="p-2 w-28 cursor-pointer hover:bg-gray-500 text-center" onClick={() => handleSort('targetPercent')}
                        >Target %{getSortIndicator('targetPercent')}</th>
                            {!hideDepositColumn && (
                                <th className="p-2 w-40 text-center">Deposit</th>
                            )}
                            <th className="p-2 w-40 text-center">Withdraw</th></tr>
                    </thead>
                    <tbody>
                        {sortedTokenData.map((tokenItem, idx) => (
                            <TokenRow
                                key={tokenItem.mintAddress}
                                token={tokenItem}
                                index={idx}
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
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* --- Mobile Card List (Visible on Mobile) --- */}
            <div className="block md:hidden space-y-3">
                {sortedTokenData.map((tokenItem) => (
                    <TokenCard
                        key={tokenItem.mintAddress}
                        token={tokenItem}
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
                    />
                ))}
            </div>
        </div>
    );
});

TokenTable.displayName = 'TokenTable';