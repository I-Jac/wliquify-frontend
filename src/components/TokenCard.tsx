import React, { useState } from 'react';
import { BN } from '@coral-xyz/anchor';
import Image from 'next/image';
// import { ProcessedTokenData } from '@/utils/types'; // Removed as it's implicitly covered by TokenRowProps
import {
    calculateTokenValueUsdScaled,
    calculateTargetPercentageScaled,
    formatScaledBnToDollarString,
    formatRawAmountString,
    formatScaledToPercentageString,
    usdToWlqiAmount
} from '@/utils/calculations';
import { calculateButtonStates } from '@/utils/buttonState';
import { calculateFees } from '@/utils/fees';
import { TokenInputControls } from './TokenInputControls';
import {
    USD_SCALE,
    BTN_GRAY,
    BPS_SCALE,
    BTN_DELISTED_WITHDRAW
} from '@/utils/constants';
import { parseUnits } from 'ethers';
import { TokenRowProps } from './TokenRow'; // Import TokenRowProps to base TokenCardProps on it

// --- TokenCard Props (Omit 'index' from TokenRowProps) ---
export type TokenCardProps = Omit<TokenRowProps, 'index'>;

// --- TokenCard Component ---
export const TokenCard: React.FC<TokenCardProps> = React.memo(({
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
    const actualPercentBN = token.actualDominancePercent !== null && token.actualDominancePercent !== undefined
        ? new BN(Math.round(token.actualDominancePercent * BPS_SCALE))
        : null;

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
                    userBalance={userWlqiBalance} // For withdraw, this should be wLQI balance, handled by TokenInputControls logic
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
                        <button onClick={handleFullDelistedWithdraw} disabled={actionDisabled || !userHasEnoughForDelisted || (!vaultBalance || vaultBalance.isZero())} className={`w-full px-3 py-1.5 text-sm rounded text-white font-medium ${!userHasEnoughForDelisted ? BTN_GRAY : BTN_DELISTED_WITHDRAW} ${(actionDisabled || !userHasEnoughForDelisted || (!vaultBalance || vaultBalance.isZero())) ? 'cursor-not-allowed opacity-50' : ''}`} title={actionDisabled ? "..." : (!vaultBalance || vaultBalance.isZero()) ? `Pool vault empty.` : !requiredWlqiForDelistedFormatted ? "Calc error." : !userHasEnoughForDelisted ? `Insufficient wLQI. Need ~${requiredWlqiForDelistedFormatted}` : `Withdraw entire ${symbol} balance with 5% bonus. Requires ~${requiredWlqiForDelistedFormatted} wLQI.`}>{actionDisabled ? (isWithdrawing ? 'Withdrawing...' : '...') : (!vaultBalance || vaultBalance.isZero()) ? "Pool Empty" : !userHasEnoughForDelisted ? "Insufficient wLQI" : `Withdraw Full Balance (5% Bonus)`}</button>
                    </div>
                )}
            </div>
        </div>
    );
});
TokenCard.displayName = 'TokenCard';
