import React, { useState } from 'react';
import { BN } from '@coral-xyz/anchor';
import Image from 'next/image';
import {
    calculateTokenValueUsdScaled,
    calculateTargetPercentageScaled,
    usdToTokenAmount
} from '@/utils/app/calculations';
import { formatScaledToPercentageString, formatScaledBnToDollarString, formatRawAmountString } from '@/utils/app/formatUtils';
import { calculateButtonStates } from '@/utils/app/buttonState';
import { calculateFees } from '@/utils/app/fees';
import { TokenInputControls } from './TokenInputControls';
import {
    USD_SCALE,
    BPS_SCALE,
    PRECISION_SCALE_FACTOR,
    EXPLORER_CLUSTER,
    DEFAULT_EXPLORER_OPTIONS,
    DEFAULT_PREFERRED_EXPLORER,
    FEE_CONFIRM_BPS,
} from '@/utils/core/constants';
import { parseUnits, formatUnits } from 'ethers';
import { TokenRowProps } from './TokenRow';
import { safeConvertBnToNumber } from '@/utils/core/helpers';
import { useTranslation } from 'react-i18next';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '../../wallet/WalletModalProvider';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useSettings } from '@/contexts/SettingsContext';
import toast from 'react-hot-toast';

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
    const { slippageBps } = useSettings();
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

    // Helper to truncate withdraw amount string if it exceeds wLQI decimals (Same as in TokenRow.tsx)
    const getValidatedWithdrawAmountString = (amountStr: string, decimals: number | null): string => {
        if (decimals === null || amountStr === '' || !amountStr.includes('.')) {
            return amountStr;
        }
        const parts = amountStr.split('.');
        if (parts.length === 2 && parts[1].length > decimals) {
            return parts[0] + '.' + parts[1].slice(0, decimals);
        }
        return amountStr;
    };

    const validatedWithdrawAmountString = getValidatedWithdrawAmountString(currentWithdrawAmount, wLqiDecimals);

    // Calculate USD value BNs first
    const depositValueUsdBN = isDepositInputFilled && decimals !== null && priceData ?
        calculateTokenValueUsdScaled(new BN(parseUnits(currentDepositAmount, decimals).toString()), decimals, priceData)
        : undefined;

    // Use validatedWithdrawAmountString for USD value calculation
    const withdrawValueUsdBN = isWithdrawInputFilled && wLqiDecimals !== null && wLqiValueScaled && !wLqiValueScaled.isZero() && wLqiDecimals !== null && new BN(10).pow(new BN(wLqiDecimals)).gtn(0) ?
        new BN(parseUnits(validatedWithdrawAmountString, wLqiDecimals).toString()).mul(wLqiValueScaled).div(new BN(10).pow(new BN(wLqiDecimals)))
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
            // Use validatedWithdrawAmountString for balance check
            const inputWlqiAmountBn = new BN(parseUnits(validatedWithdrawAmountString, wLqiDecimals).toString());
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
        currentDepositAmount, // For deposits, this is fine
        currentWithdrawAmount: validatedWithdrawAmountString, // Pass the validated string for withdrawals
        decimals,
        wLqiDecimals,
        wLqiValueScaled,
        priceData,
        vaultBalance,
        isDelisted,
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
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<null | (() => void)>(null);
    const [confirmMessage, setConfirmMessage] = useState('');

    const handleActualDeposit = () => {
        if (!walletPublicKey) {
            setWalletModalVisible(true);
            return;
        }
        if (estimatedDepositFeeBps >= FEE_CONFIRM_BPS) {
            const percent = (FEE_CONFIRM_BPS / 100).toFixed(2);
            setConfirmMessage(t('poolInteractions.highFeeConfirmation', { action: t('poolInteractions.depositAction'), percent }));
            setPendingAction(() => () => onDeposit(mintAddress, currentDepositAmount, decimals));
            setConfirmModalOpen(true);
            return;
        }
        onDeposit(mintAddress, currentDepositAmount, decimals);
    };

    const handleActualWithdraw = () => {
        if (!walletPublicKey) {
            setWalletModalVisible(true);
            return;
        }

        // Use validatedWithdrawAmountString for minimumUnderlyingTokensOut calculation
        let minimumUnderlyingTokensOutString = "0";
        if (!isDelisted && wLqiDecimals !== null && wLqiValueScaled && !wLqiValueScaled.isZero() && priceData && decimals !== null) {
            try {
                const inputWlqiAmountBn = new BN(parseUnits(validatedWithdrawAmountString, wLqiDecimals).toString());
                const scaleFactorWlqi = new BN(10).pow(new BN(wLqiDecimals));
                const withdrawUsdValueScaled = inputWlqiAmountBn.mul(wLqiValueScaled).div(scaleFactorWlqi);
                
                const slippageAmountUsd = withdrawUsdValueScaled.mul(new BN(slippageBps)).div(new BN(BPS_SCALE));
                const minimumUsdValueOut = withdrawUsdValueScaled.sub(slippageAmountUsd);

                if (minimumUsdValueOut.isNeg()) {
                    console.warn("[TokenCard] Calculated minimumUsdValueOut is negative, setting minimum underlying to 0.");
                } else {
                    const minimumUnderlyingTokensScaledBn = usdToTokenAmount(minimumUsdValueOut, decimals, priceData);
                    const minimumUnderlyingTokensBn = minimumUnderlyingTokensScaledBn.div(PRECISION_SCALE_FACTOR);
                    minimumUnderlyingTokensOutString = formatUnits(minimumUnderlyingTokensBn.toString(), decimals);
                    if (minimumUnderlyingTokensOutString.endsWith('.0')) {
                        minimumUnderlyingTokensOutString = minimumUnderlyingTokensOutString.slice(0, -2);
                    }
                    if (parseFloat(minimumUnderlyingTokensOutString) < 0) minimumUnderlyingTokensOutString = "0"; // Safety net
                }
            } catch (e) {
                console.error("[TokenCard] Error calculating minimumUnderlyingTokensOutString for whitelisted withdraw:", e);
                toast.error(t('poolInteractions.slippageCalcError'));
                // Fallback to "0" or handle error appropriately, maybe disable button or show warning
            }
        }

        if (estimatedWithdrawFeeBps >= FEE_CONFIRM_BPS) {
            const percent = (FEE_CONFIRM_BPS / 100).toFixed(2);
            setConfirmMessage(t('poolInteractions.highFeeConfirmation', { action: t('poolInteractions.withdrawalAction'), percent }));
            setPendingAction(() => () => onWithdraw(mintAddress, validatedWithdrawAmountString, minimumUnderlyingTokensOutString, decimals));
            setConfirmModalOpen(true);
            return;
        }
        // IMPORTANT: Pass the original currentWithdrawAmount to onWithdraw
        onWithdraw(mintAddress, validatedWithdrawAmountString, minimumUnderlyingTokensOutString, decimals);
    };

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
                        vaultBalance={vaultBalance}
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
                    vaultBalance={vaultBalance}
                />
                <button onClick={handleActualWithdraw} disabled={withdrawButtonDisabled} className={`w-full px-3 py-1.5 text-sm rounded text-white font-medium ${withdrawBtnClass} ${withdrawButtonDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`} title={withdrawTitle}>{withdrawLabel}</button>
            </div>

            <ConfirmModal
                open={confirmModalOpen}
                message={confirmMessage}
                onProceed={() => {
                    setConfirmModalOpen(false);
                    if (pendingAction) pendingAction();
                }}
                onCancel={() => {
                    setConfirmModalOpen(false);
                }}
            />
        </div>
    );
});
TokenCard.displayName = 'TokenCard';
