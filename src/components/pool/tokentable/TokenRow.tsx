import React, { useState } from 'react';
import { BN } from '@coral-xyz/anchor';
import Image from 'next/image';
import { ProcessedTokenData } from '@/utils/core/types';
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
import { safeConvertBnToNumber } from '@/utils/core/helpers';
import { useTranslation } from 'react-i18next';
import { PublicKey } from '@solana/web3.js';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { createPortal } from 'react-dom';
import { useSettings } from '@/contexts/SettingsContext';
import toast from 'react-hot-toast';

// --- TokenRow Props ---
export interface TokenRowProps {
    token: ProcessedTokenData;
    index: number;
    totalPoolValueScaled: BN | null;
    wLqiValueScaled: BN | null;
    wLqiDecimals: number | null;
    userWlqiBalance: BN | null;
    onDeposit: (mintAddress: string, amountString: string, decimals: number | null) => Promise<void>;
    onWithdraw: (mintAddress: string, wliAmountString: string, minimumUnderlyingTokensOutString: string, outputTokenDecimals: number | null) => Promise<void>;
    isDepositing: boolean;
    isWithdrawing: boolean;
    depositAmounts: Record<string, string>;
    withdrawAmounts: Record<string, string>;
    handleAmountChange: (mintAddress: string, action: 'deposit' | 'withdraw', amount: string, decimals: number | null) => void;
    isLoadingUserData: boolean;
    isLoadingPublicData: boolean;
    hideDepositColumn: boolean;
    // Callbacks from TokenTable
    handleSetAmount: (mintAddress: string, action: 'deposit' | 'withdraw', fraction: number) => void;
    handleSetTargetAmount: (mintAddress: string, action: 'deposit' | 'withdraw') => void;
    // Calculated values from TokenTable
    totalTargetDominance: BN;
    targetRank: number | null;
    showRankColumn: boolean;
    publicKey: PublicKey | null;
    setVisible: (open: boolean) => void;
    preferredExplorer: string;
    explorerOptions: typeof DEFAULT_EXPLORER_OPTIONS;
}

// --- TokenRow Component ---
export const TokenRow: React.FC<TokenRowProps> = React.memo(({
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
    targetRank,
    showRankColumn,
    publicKey,
    setVisible,
    preferredExplorer,
    explorerOptions,
}) => {
    const { t } = useTranslation();
    const { slippageBps } = useSettings();
    // Destructure token object inside the function
    const { mintAddress, symbol, icon, priceData, vaultBalance, decimals, targetDominance, isDelisted } = token;
    const [currentIconSrc, setCurrentIconSrc] = useState(icon);
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<null | (() => void)>(null);
    const [confirmMessage, setConfirmMessage] = useState('');

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

    // Helper to truncate withdraw amount string if it exceeds wLQI decimals
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

    // --- Check for insufficient TOKEN balance for deposit ---
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

    // --- Check for insufficient wLQI balance for withdrawal ---
    let withdrawInsufficientBalance = false;
    if (isWithdrawInputFilled && userWlqiBalance && wLqiDecimals !== null) {
        try {
            // Use validatedWithdrawAmountString for balance check
            const inputWlqiAmountBn = new BN(parseUnits(validatedWithdrawAmountString, wLqiDecimals).toString());
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
        currentWithdrawAmount: validatedWithdrawAmountString,
        decimals,
        wLqiDecimals,
        wLqiValueScaled,
        priceData,
        vaultBalance,
        isDelisted,
    });

    // --- Button State & Labels ---
    const depositValueUsdBN = isDepositInputFilled && decimals !== null && priceData ?
        calculateTokenValueUsdScaled(new BN(parseUnits(currentDepositAmount, decimals).toString()), decimals, priceData) 
        : undefined;

    // Use validatedWithdrawAmountString for USD value calculation
    const withdrawValueUsdBN = isWithdrawInputFilled && wLqiDecimals !== null && wLqiValueScaled && !wLqiValueScaled.isZero() && new BN(10).pow(new BN(wLqiDecimals)).gtn(0) ?
        new BN(parseUnits(validatedWithdrawAmountString, wLqiDecimals).toString()).mul(wLqiValueScaled).div(new BN(10).pow(new BN(wLqiDecimals)))
        : undefined;

    const buttonStates = calculateButtonStates({
        t,
        publicKey,
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

    // REMOVE calculation logic for requiredWlqiForDelistedBn, etc.
    // if (isDelisted && vaultBalance && !vaultBalance.isZero() && ... ) { ... }
    const actualPercentBN = token.actualDominancePercent !== null && token.actualDominancePercent !== undefined
        ? new BN(Math.round(token.actualDominancePercent * BPS_SCALE))
        : null;

    // Button callbacks
    const handleActualDeposit = () => {
        if (!publicKey) {
            setVisible(true);
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
        if (!publicKey) {
            setVisible(true);
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
                    console.warn("[TokenRow] Calculated minimumUsdValueOut is negative, setting minimum underlying to 0.");
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
                console.error("[TokenRow] Error calculating minimumUnderlyingTokensOutString for whitelisted withdraw:", e);
                toast.error(t('poolInteractions.slippageCalcError'));
                 // Fallback to "0" or handle error appropriately
            }
        }

        if (estimatedWithdrawFeeBps >= FEE_CONFIRM_BPS) {
            const percent = (FEE_CONFIRM_BPS / 100).toFixed(2);
            setConfirmMessage(t('poolInteractions.highFeeConfirmation', { action: t('poolInteractions.withdrawalAction'), percent }));
            setPendingAction(() => () => onWithdraw(mintAddress, validatedWithdrawAmountString, minimumUnderlyingTokensOutString, decimals));
            setConfirmModalOpen(true);
            return;
        }
        // IMPORTANT: Pass the original currentWithdrawAmount (which should be validated by useAmountState by now)
        // to the onWithdraw handler, as it expects the string that the user effectively confirmed.
        // The internal validatedWithdrawAmountString is for preventing parseUnits errors in this component's calculations.
        onWithdraw(mintAddress, validatedWithdrawAmountString, minimumUnderlyingTokensOutString, decimals);
    };

    const handleSymbolClick = () => {
        if (!token.mintAddress) return;

        const explorerInfo = explorerOptions[preferredExplorer] || explorerOptions[DEFAULT_PREFERRED_EXPLORER];
        const clusterQuery = explorerInfo.getClusterQueryParam(EXPLORER_CLUSTER);
        
        const templateUrl = explorerInfo.tokenUrlTemplate || explorerInfo.addressUrlTemplate;

        if (!templateUrl) {
            console.warn(`No token or address URL template found for explorer: ${explorerInfo.name}, falling back to Solscan.`);
            const fallbackExplorer = DEFAULT_EXPLORER_OPTIONS['Solscan'];
            const fallbackTemplateUrl = fallbackExplorer.tokenUrlTemplate || fallbackExplorer.addressUrlTemplate;
            if (fallbackTemplateUrl) {
                 const url = fallbackTemplateUrl
                    .replace('{token_address}', token.mintAddress)
                    .replace('{address}', token.mintAddress) 
                    .replace('{cluster}', fallbackExplorer.getClusterQueryParam(EXPLORER_CLUSTER));
                window.open(url, '_blank', 'noopener,noreferrer');
            }
            return;
        }

        const url = templateUrl
            .replace('{token_address}', token.mintAddress)
            .replace('{address}', token.mintAddress) 
            .replace('{cluster}', clusterQuery);
        
        window.open(url, '_blank', 'noopener,noreferrer');
    };
    
    const explorerInfoForTitle = explorerOptions[preferredExplorer] || explorerOptions[DEFAULT_PREFERRED_EXPLORER];
    const tooltipContent = t('main.poolInfoDisplay.tokenTable.tooltips.symbolExplorer', { 
        symbol: displaySymbol, 
        explorerName: explorerInfoForTitle.name 
    });

    return (
        <>
            <tr key={mintAddress} className={`border-b border-gray-600 ${index % 2 === 0 ? 'bg-gray-700' : 'bg-gray-750'} hover:bg-gray-600 ${actionDisabled ? 'opacity-50' : ''} ${isDelisted ? 'bg-red-900/30' : ''}`}>
                {showRankColumn && (
                    <td className="p-2 align-middle text-center" style={{ width: '40px' }}>
                        {isDelisted ? (
                            <div className="text-gray-500 italic font-normal">N/A</div>
                        ) : (
                            targetRank !== null ? <span className="font-semibold text-sm">{targetRank}</span> : ''
                        )}
                    </td>
                )}
                <td className="p-0 font-semibold align-middle text-left whitespace-nowrap truncate" style={{ width: '85px' }}>
                    <div 
                        className="flex items-center h-full space-x-1 px-1 cursor-pointer"
                        title={tooltipContent}
                        onClick={handleSymbolClick}
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
                        <span className="truncate">{displaySymbol}</span>
                    </div>
                </td>
                <td className="p-2 align-middle text-center whitespace-nowrap truncate" style={{ width: '155px' }}>
                    <div className="truncate">{displayValue}</div>
                    <div className="text-gray-400 truncate">{displayBalance} {displaySymbol}</div>
                </td>
                <td className="p-2 align-middle text-center" style={{ width: '80px' }}>
                    {displayActualPercent}%
                </td>
                <td className="p-2 align-middle text-center" style={{ width: '80px' }}>
                    {displayTargetPercent}%
                </td>
                {!hideDepositColumn && (
                    <td className="p-2 align-middle" style={{ width: '230px' }}>
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
                                    vaultBalance={vaultBalance}
                                />
                                <button onClick={handleActualDeposit} disabled={depositButtonDisabled} className={`w-full px-1 py-0.5 text-xs font-medium rounded text-white ${depositBtnClass} ${depositButtonDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`} title={depositTitle}>{depositLabel}</button>
                            </div>
                        )}
                    </td>
                )}
                <td className="p-2 align-middle" style={{ width: '230px' }}>
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
                            vaultBalance={vaultBalance}
                        />
                        <button onClick={handleActualWithdraw} disabled={withdrawButtonDisabled} className={`w-full px-1 py-0.5 text-xs font-medium rounded text-white ${withdrawBtnClass} ${withdrawButtonDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`} title={withdrawTitle}>{withdrawLabel}</button>
                    </div>
                </td>
            </tr>
            {confirmModalOpen && typeof window !== 'undefined' && createPortal(
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
                />, document.body
            )}
        </>
    );
});
TokenRow.displayName = 'TokenRow';