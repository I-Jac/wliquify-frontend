import React, { useState } from 'react';
import { BN } from '@coral-xyz/anchor';
import Image from 'next/image';
import {
    calculateTokenValueUsdScaled,
    calculateTargetPercentageScaled,
    formatScaledBnToDollarString,
    formatRawAmountString,
    usdToWlqiAmount
} from '@/utils/app/calculations';
import { formatScaledToPercentageString } from '@/utils/app/formatUtils';
import { calculateButtonStates } from '@/utils/app/buttonState';
import { calculateFees } from '@/utils/app/fees';
import { TokenInputControls } from './TokenInputControls';
import {
    USD_SCALE,
    BPS_SCALE,
    BTN_DELISTED_WITHDRAW,
    DELISTED_WITHDRAW_BONUS_BPS,
    EXPLORER_CLUSTER,
    DEFAULT_EXPLORER_OPTIONS,
    DEFAULT_PREFERRED_EXPLORER,
} from '@/utils/core/constants';
import { parseUnits, formatUnits } from 'ethers';
import { TokenRowProps } from './TokenRow';
import { safeConvertBnToNumber } from '@/utils/core/helpers';
import { useTranslation } from 'react-i18next';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '../../wallet/WalletModalProvider';

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
    targetRank,
    showRankColumn,
    preferredExplorer,
    explorerOptions,
}) => {
    const { t } = useTranslation();
    const { publicKey: walletPublicKey } = useWallet();
    const { setVisible: setWalletModalVisible } = useWalletModal();
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

    // Calculate USD value BNs first
    const depositValueUsdBN = isDepositInputFilled && decimals !== null && priceData ?
        calculateTokenValueUsdScaled(new BN(parseUnits(currentDepositAmount, decimals).toString()), decimals, priceData)
        : undefined;

    const withdrawValueUsdBN = isWithdrawInputFilled && wLqiDecimals !== null && wLqiValueScaled && !wLqiValueScaled.isZero() && wLqiDecimals !== null && new BN(10).pow(new BN(wLqiDecimals)).gtn(0) ?
        new BN(parseUnits(currentWithdrawAmount, wLqiDecimals).toString()).mul(wLqiValueScaled).div(new BN(10).pow(new BN(wLqiDecimals)))
        : undefined;

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
        t,
        publicKey: walletPublicKey,
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
        depositInputValueUsd: depositValueUsdBN ? safeConvertBnToNumber(depositValueUsdBN, USD_SCALE) : undefined,
        withdrawInputValueUsd: withdrawValueUsdBN ? safeConvertBnToNumber(withdrawValueUsdBN, USD_SCALE) : undefined,
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
    const handleActualDeposit = () => {
        if (!walletPublicKey) {
            setWalletModalVisible(true);
            return;
        }
        onDeposit(mintAddress, currentDepositAmount, decimals);
    };

    const handleActualWithdraw = () => {
        if (!walletPublicKey) {
            setWalletModalVisible(true);
            return;
        }
        onWithdraw(mintAddress, currentWithdrawAmount, false);
    };

    const handleFullDelistedWithdraw = () => {
        if (!walletPublicKey) {
            setWalletModalVisible(true);
            return;
        }
        onWithdraw(mintAddress, "0", true);
    };
    let requiredWlqiForDelistedBn: BN | null = null;
    let requiredWlqiForDelistedFormatted: string | null = null;
    let userHasEnoughForDelisted = false;
    let delistedFullWithdrawBonusAmountString: string | null = null;
    let delistedFullWithdrawBonusPercentString: string | null = null;

    if (isDelisted && vaultBalance && !vaultBalance.isZero() && decimals !== null && wLqiValueScaled && !wLqiValueScaled.isZero() && wLqiDecimals !== null) {
        try {
            const T_usd_scaled = calculateTokenValueUsdScaled(vaultBalance, decimals, priceData);
            if (T_usd_scaled && T_usd_scaled.gtn(0)) {
                const vaultBalanceUsdString = formatUnits(T_usd_scaled.toString(), USD_SCALE);
                const vaultBalanceUsd = parseFloat(vaultBalanceUsdString);
                const bonusAmount = vaultBalanceUsd * (Math.abs(DELISTED_WITHDRAW_BONUS_BPS) / BPS_SCALE);
                delistedFullWithdrawBonusAmountString = bonusAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                delistedFullWithdrawBonusPercentString = (Math.abs(DELISTED_WITHDRAW_BONUS_BPS) / BPS_SCALE * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
            delistedFullWithdrawBonusAmountString = null;
            delistedFullWithdrawBonusPercentString = null;
        }
    }

    // --- Handle Symbol Click for Explorer Link ---
    const handleSymbolClick = () => {
        if (!mintAddress) return;

        // Ensure preferredExplorer and explorerOptions are available, falling back to defaults
        const currentPreferredExplorer = preferredExplorer || DEFAULT_PREFERRED_EXPLORER;
        const currentExplorerOptions = explorerOptions || DEFAULT_EXPLORER_OPTIONS;

        const explorerInfo = currentExplorerOptions[currentPreferredExplorer] || currentExplorerOptions[DEFAULT_PREFERRED_EXPLORER];
        const clusterQuery = explorerInfo.getClusterQueryParam(EXPLORER_CLUSTER);
        
        const templateUrl = explorerInfo.tokenUrlTemplate || explorerInfo.addressUrlTemplate;

        if (!templateUrl) {
            console.warn(`No token or address URL template found for explorer: ${explorerInfo.name}, falling back to Solscan.`);
            const fallbackExplorer = DEFAULT_EXPLORER_OPTIONS['Solscan']; // Use the direct constant here
            const fallbackTemplateUrl = fallbackExplorer.tokenUrlTemplate || fallbackExplorer.addressUrlTemplate;
            if (fallbackTemplateUrl) {
                 const url = fallbackTemplateUrl
                    .replace('{token_address}', mintAddress)
                    .replace('{address}', mintAddress) 
                    .replace('{cluster}', fallbackExplorer.getClusterQueryParam(EXPLORER_CLUSTER));
                window.open(url, '_blank', 'noopener,noreferrer');
            }
            return;
        }

        const url = templateUrl
            .replace('{token_address}', mintAddress)
            .replace('{address}', mintAddress) 
            .replace('{cluster}', clusterQuery);
        
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    // --- Tooltip Content for Symbol ---
    const explorerInfoForTitle = (explorerOptions || DEFAULT_EXPLORER_OPTIONS)[preferredExplorer || DEFAULT_PREFERRED_EXPLORER] || (explorerOptions || DEFAULT_EXPLORER_OPTIONS)[DEFAULT_PREFERRED_EXPLORER];
    const tooltipContent = t('main.poolInfoDisplay.tokenTable.tooltips.symbolExplorer', { 
        symbol: displaySymbol, 
        explorerName: explorerInfoForTitle.name 
    });

    return (
        <div className={`border border-gray-600 rounded-lg p-3 ${isDelisted ? 'bg-red-900/20' : 'bg-gray-750'} ${actionDisabled ? 'opacity-50' : ''}`}>
            {/* --- Header --- */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-600">
                {/* Left Part: Icon and Symbol */}
                <div 
                    className="flex items-center space-x-2 cursor-pointer"
                    onClick={handleSymbolClick}
                    title={tooltipContent}
                >
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
                    {/* Symbol is now directly here */}
                    <span className="font-semibold text-white text-lg">{displaySymbol}</span>
                </div>

                {/* Right Part: Rank or Delisted Badge */}
                <div> 
                    {showRankColumn && targetRank !== null && !isDelisted && (
                        <span className="text-xs text-gray-400 font-normal">{t('main.poolInfoDisplay.tokenTable.tokenCard.rankDisplay', { rank: targetRank })}</span>
                    )}
                    {isDelisted && (
                        <span className="text-xs text-red-400 font-medium bg-red-900/50 px-1.5 py-0.5 rounded">{t('main.poolInfoDisplay.tokenTable.delisted.badge')}</span>
                    )}
                </div>
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
                    <h4 className="text-sm font-semibold mb-2 text-gray-200">{t('main.poolInfoDisplay.tokenTable.tokenCard.depositHeader', { symbol: displaySymbol })}</h4>
                    <TokenInputControls
                        mintAddress={mintAddress}
                        symbol={displaySymbol}
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
                    <button onClick={handleActualDeposit} disabled={depositButtonDisabled} className={`w-full px-3 py-1.5 text-sm rounded text-white font-medium ${depositBtnClass} ${depositButtonDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`} title={depositTitle}>{depositLabel}</button>
                </div>
            )}

            {/* --- Withdraw Section --- */}
            <div className={`${!hideDepositColumn && !isDelisted ? 'border-t border-gray-600 pt-3' : '' }`}>
                <h4 className="text-sm font-semibold mb-2 text-gray-200">{t('main.poolInfoDisplay.tokenTable.tokenCard.withdrawHeader', { symbol: displaySymbol })}</h4>
                <TokenInputControls
                    mintAddress={mintAddress}
                    symbol={displaySymbol}
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
                <button onClick={handleActualWithdraw} disabled={withdrawButtonDisabled} className={`w-full px-3 py-1.5 text-sm rounded text-white font-medium ${withdrawBtnClass} ${withdrawButtonDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`} title={withdrawTitle}>{withdrawLabel}</button>
                {isDelisted && (
                    <div className="mt-2">
                        <button onClick={handleFullDelistedWithdraw}
                            disabled={actionDisabled || (!vaultBalance || vaultBalance.isZero()) || !requiredWlqiForDelistedBn}
                            className={`w-full px-3 py-1.5 text-sm rounded text-white font-medium ${BTN_DELISTED_WITHDRAW} ${(actionDisabled || (!vaultBalance || vaultBalance.isZero()) || !requiredWlqiForDelistedBn) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                            title={actionDisabled ? t('main.poolInfoDisplay.tokenTable.delisted.tooltips.actionInProgress') :
                                   (!vaultBalance || vaultBalance.isZero()) ? t('main.poolInfoDisplay.tokenTable.delisted.tooltips.poolEmpty', { symbol }) :
                                   !requiredWlqiForDelistedFormatted ? t('main.poolInfoDisplay.tokenTable.delisted.tooltips.calcError') :
                                   !userHasEnoughForDelisted ? t('main.poolInfoDisplay.tokenTable.delisted.tooltips.needWlqi', { amount: requiredWlqiForDelistedFormatted }) :
                                   (delistedFullWithdrawBonusAmountString && delistedFullWithdrawBonusPercentString) ?
                                        t('main.poolInfoDisplay.tokenTable.delisted.withdrawFullBalanceBonus', {
                                            bonusPercent: delistedFullWithdrawBonusPercentString,
                                            bonusUsd: delistedFullWithdrawBonusAmountString
                                        }) :
                                        t('main.poolInfoDisplay.tokenTable.delisted.tooltips.withdrawEntireBalanceNoBonus', { symbol, amount: requiredWlqiForDelistedFormatted })
                            }
                        >
                            {actionDisabled ? (isWithdrawing ? t('main.poolInfoDisplay.tokenTable.buttonState.withdrawing') : t('main.poolInfoDisplay.tokenTable.delisted.actionInProgress')) :
                             (!vaultBalance || vaultBalance.isZero()) ? t('main.poolInfoDisplay.tokenTable.delisted.poolEmpty') :
                             !requiredWlqiForDelistedBn ? t('main.poolInfoDisplay.tokenTable.delisted.calcError') :
                             (delistedFullWithdrawBonusAmountString && delistedFullWithdrawBonusPercentString) ?
                                t('main.poolInfoDisplay.tokenTable.delisted.withdrawFullBalanceBonus', {
                                    bonusPercent: delistedFullWithdrawBonusPercentString,
                                    bonusUsd: delistedFullWithdrawBonusAmountString
                                }) :
                                t('main.poolInfoDisplay.tokenTable.delisted.tooltips.withdrawEntireBalanceNoBonus', { symbol, amount: requiredWlqiForDelistedFormatted })}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});
TokenCard.displayName = 'TokenCard';
