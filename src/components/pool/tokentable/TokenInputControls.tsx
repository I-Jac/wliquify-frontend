'use client';

import React from 'react';
import { BN } from '@coral-xyz/anchor';
import { formatUnits, parseUnits } from 'ethers';
import { calculateTokenValueUsdScaled, usdToWlqiAmount } from '@/utils/app/calculations';
import { formatScaledBnToDollarString } from '@/utils/app/formatUtils';
import { USD_SCALE, BPS_SCALE } from '@/utils/core/constants';
import { DecodedPriceData } from '@/utils/core/types';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

interface TokenInputControlsProps {
    mintAddress: string;
    symbol: string;
    action: 'deposit' | 'withdraw';
    currentAmount: string;
    decimals: number | null;
    priceData: DecodedPriceData | null;
    wLqiValueScaled: BN | null;
    wLqiDecimals: number | null;
    userBalance: BN | null;
    actionDisabled: boolean;
    isDelisted: boolean;
    handleAmountChange: (mintAddress: string, action: 'deposit' | 'withdraw', amount: string, decimals: number | null) => void;
    handleSetAmount: (mintAddress: string, action: 'deposit' | 'withdraw', fraction: number) => void;
    handleSetTargetAmount?: (mintAddress: string, action: 'deposit' | 'withdraw') => void;
    showTargetButton?: boolean;
    isMobile?: boolean;
    vaultBalance?: BN | null;
}

export const TokenInputControls: React.FC<TokenInputControlsProps> = ({
    mintAddress,
    symbol,
    action,
    currentAmount,
    decimals,
    priceData,
    wLqiValueScaled,
    wLqiDecimals,
    userBalance,
    actionDisabled,
    isDelisted,
    handleAmountChange,
    handleSetAmount,
    handleSetTargetAmount,
    showTargetButton = false,
    isMobile = false,
    vaultBalance,
}) => {
    const { t } = useTranslation();
    const isDeposit = action === 'deposit';
    const isInputFilled = currentAmount !== '' && parseFloat(currentAmount) > 0;

    // Helper to truncate amount string if it exceeds its relevant decimals
    // This is particularly for the withdrawal case where currentAmount is wLQI
    const getValidatedStringForParse = (amountStr: string, relevantDecimals: number | null): string => {
        if (relevantDecimals === null || amountStr === '' || !amountStr.includes('.')) {
            return amountStr;
        }
        const parts = amountStr.split('.');
        if (parts.length === 2 && parts[1].length > relevantDecimals) {
            return parts[0] + '.' + parts[1].slice(0, relevantDecimals);
        }
        return amountStr;
    };

    // Format user balance for display
    const displayUserBalance = userBalance !== null && (isDeposit ? decimals : wLqiDecimals) !== null
        ? formatUnits(userBalance.toString(), isDeposit ? decimals! : wLqiDecimals!)
        : '--.--';

    // Calculate USD value display
    let displayInputUsdValue = '$ --.--';
    if (isInputFilled) {
        try {
            if (isDeposit && decimals !== null && priceData) {
                // For DEPOSIT, currentAmount uses 'decimals' of the token being deposited
                // useAmountState should handle deposit input validation, so direct use is generally okay here
                // but for safety, especially if rapid input causes issues, validation could be added.
                // For now, assuming deposit path is less problematic due to how decimals are handled by user vs wLQI.
                const validatedDepositAmount = getValidatedStringForParse(currentAmount, decimals);
                const inputAmountBn = new BN(parseUnits(validatedDepositAmount, decimals).toString());
                const inputUsdValueScaled = calculateTokenValueUsdScaled(inputAmountBn, decimals, priceData);
                displayInputUsdValue = formatScaledBnToDollarString(inputUsdValueScaled, USD_SCALE);
            } else if (!isDeposit && wLqiDecimals !== null && wLqiValueScaled) {
                // For WITHDRAW, currentAmount (which is wLQI) uses 'wLqiDecimals'
                const validatedWithdrawAmount = getValidatedStringForParse(currentAmount, wLqiDecimals);
                const inputWlqiAmountBn = new BN(parseUnits(validatedWithdrawAmount, wLqiDecimals).toString());
                const inputUsdValueScaled = inputWlqiAmountBn.mul(wLqiValueScaled).div(new BN(10).pow(new BN(wLqiDecimals)));
                displayInputUsdValue = formatScaledBnToDollarString(inputUsdValueScaled, USD_SCALE);
            }
        } catch (e) {
            console.warn("Error calculating input USD value:", e);
            displayInputUsdValue = '$ Invalid';
        }
    } else if (currentAmount === '' || currentAmount === '0') {
        displayInputUsdValue = '$ 0.00';
    }

    const inputId = `${action}-${isMobile ? 'card-' : ''}${mintAddress}`;
    const inputPlaceholder = t('main.poolInfoDisplay.tokenTable.tokenInputControls.amount.placeholder', { symbol: isDeposit ? symbol : 'wLQI' });
    const inputClassName = `flex-grow bg-gray-${isMobile ? '800' : '700'} text-white px-2 py-${isMobile ? '1.5' : '1'} rounded border border-gray-600 text-sm focus:outline-none focus:ring-1 focus:ring-${isDeposit ? 'blue' : 'red'}-500`;
    const buttonClassName = `px-${isMobile ? '1.5' : '1'} py-${isMobile ? '0.5' : '0.5'} text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center cursor-pointer`;
    const targetButtonClassName = `ml-1 px-${isMobile ? '1.5' : '1'} py-${isMobile ? '1' : '0.5'} text-[10px] bg-blue-600 hover:bg-blue-500 rounded text-white text-center whitespace-nowrap cursor-pointer`;

    const handleSetAmountWithToast = (fraction: number) => {
        if (action === 'deposit') {
            if (!userBalance || userBalance === '0' || (typeof userBalance === 'object' && userBalance.isZero && userBalance.isZero())) {
                toast(t('toast.noUserBalanceToDeposit'));
                return;
            }
        } else if (action === 'withdraw') {
            if (!userBalance || userBalance === '0' || (typeof userBalance === 'object' && userBalance.isZero && userBalance.isZero())) {
                toast(t('toast.noUserBalanceToWithdraw'));
                return;
            }
        }
        handleSetAmount(mintAddress, action, fraction);
    };

    const handleSetAllDelisted = () => {
        if (action !== 'withdraw' || !isDelisted || !vaultBalance || vaultBalance.isZero() || decimals === null || !priceData || !wLqiValueScaled || wLqiValueScaled.isZero() || wLqiDecimals === null) {
            toast.error(t('poolInteractions.cannotCalculateAllDelisted'));
            return;
        }
        try {
            // 1. Calculate USD value of the entire vaultBalance for the delisted token
            const vaultValueUsdScaled = calculateTokenValueUsdScaled(vaultBalance, decimals, priceData);
            if (!vaultValueUsdScaled || vaultValueUsdScaled.isZero()) {
                toast.error(t('poolInteractions.cannotCalculateVaultValue'));
                return;
            }

            // 2. Account for the 5% program bonus (DELISTED_WITHDRAW_BONUS_BPS = -500)
            // User effectively pays wLQI for (10000 / (10000 - (-500))) = (10000 / 10500) of the token's USD value.
            const bonus_bps = new BN(-500); // DELISTED_WITHDRAW_BONUS_BPS from program
            const bps_scale_bn = new BN(BPS_SCALE.toString()); // 10000
            
            const effectiveVaultValueUsdScaled = vaultValueUsdScaled
                .mul(bps_scale_bn) 
                .div(bps_scale_bn.sub(bonus_bps)); // This is vaultValueUsd * (10000 / 10500)

            // 3. Convert this 'bonus-adjusted' USD value to the equivalent wLQI amount
            const requiredWlqiAmountBn = usdToWlqiAmount(effectiveVaultValueUsdScaled, wLqiValueScaled, wLqiDecimals);
            if (requiredWlqiAmountBn.isZero() || requiredWlqiAmountBn.isNeg()) {
                toast.error(t('poolInteractions.cannotCalculateWlqiEquivalent'));
                return;
            }

            // 4. Add a 1% buffer to this calculated wLQI amount
            const bufferBpsForInput = new BN(100); // 1% = 100 BPS for frontend input buffer
            const bufferedWlqiAmountBn = requiredWlqiAmountBn.mul(bps_scale_bn.add(bufferBpsForInput)).div(bps_scale_bn);
            
            // Add 1 lamport to ensure it's slightly over, helping with potential dust or rounding
            const finalWlqiAmountBn = bufferedWlqiAmountBn.add(new BN(1));

            let amountToSet = formatUnits(finalWlqiAmountBn.toString(), wLqiDecimals);
            if (amountToSet.endsWith('.0')) {
                amountToSet = amountToSet.substring(0, amountToSet.length - 2);
            }

            // 5. Call handleAmountChange to populate the withdrawal input field
            handleAmountChange(mintAddress, 'withdraw', amountToSet, wLqiDecimals);
            toast.success(t('poolInteractions.allDelistedAmountSet'));

        } catch (error) {
            console.error('Error in handleSetAllDelisted:', error);
            toast.error(t('poolInteractions.errorCalculatingAllDelisted'));
        }
    };

    return (
        <div className="flex flex-col space-y-1">
            <div className="flex items-center justify-between">
                <div className="text-gray-400 text-[10px] flex items-center">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="mr-1">
                        <path d="M13.8205 12.2878C13.8205 12.4379 13.791 12.5865 13.7335 12.7252C13.6761 12.8638 13.5919 12.9898 13.4858 13.0959C13.3797 13.2021 13.2537 13.2863 13.115 13.3437C12.9764 13.4011 12.8278 13.4307 12.6777 13.4307H3.04911C2.746 13.4307 2.45531 13.3103 2.24099 13.0959C2.02666 12.8816 1.90625 12.5909 1.90625 12.2878V4.18992C1.90625 3.68474 2.10693 3.20026 2.46414 2.84305C2.82135 2.48584 3.30584 2.28516 3.81101 2.28516H10.3718C10.6749 2.28516 10.9656 2.40556 11.1799 2.61989C11.3942 2.83422 11.5146 3.12491 11.5146 3.42801L11.5142 4.20668H12.6777C12.8278 4.20668 12.9764 4.23624 13.115 4.29367C13.2537 4.35111 13.3797 4.43529 13.4858 4.54141C13.5919 4.64754 13.6761 4.77353 13.7335 4.91218C13.791 5.05084 13.8205 5.19946 13.8205 5.34954V12.2878ZM12.6777 5.34954H3.04911V12.2878H12.6777L12.6773 10.356H8.43996V7.28173L12.6773 7.28135V5.34992L12.6777 5.34954ZM12.6777 8.4242H9.58244V9.21316H12.6773V8.42459L12.6777 8.4242ZM10.3718 3.42801H3.81101C3.60894 3.42801 3.41515 3.50829 3.27226 3.65117C3.12938 3.79405 3.04911 3.98785 3.04911 4.18992L3.04873 4.20668H10.3714V3.42801H10.3718Z"></path>
                    </svg>
                    <span>{t('main.poolInfoDisplay.tokenTable.tokenInputControls.amount.balance', { value: displayUserBalance, symbol: isDeposit ? symbol : 'wLQI' })}</span>
                </div>
                <div className="flex space-x-1">
                    <button
                        onClick={() => handleSetAmountWithToast(0.5)}
                        disabled={actionDisabled || userBalance === null || (isDeposit && isDelisted)}
                        className={`${buttonClassName} ${(actionDisabled || userBalance === null || (isDeposit && isDelisted)) ? 'cursor-not-allowed opacity-50' : ''}`}
                        title={t('main.poolInfoDisplay.tokenTable.tokenInputControls.actions.half')}
                    >
                        {t('main.poolInfoDisplay.tokenTable.tokenInputControls.actions.half')}
                    </button>
                    <button
                        onClick={() => handleSetAmountWithToast(1)}
                        disabled={actionDisabled || userBalance === null || (isDeposit && isDelisted)}
                        className={`${buttonClassName} ${(actionDisabled || userBalance === null || (isDeposit && isDelisted)) ? 'cursor-not-allowed opacity-50' : ''}`}
                        title={t('main.poolInfoDisplay.tokenTable.tokenInputControls.actions.max')}
                    >
                        {t('main.poolInfoDisplay.tokenTable.tokenInputControls.actions.max')}
                    </button>
                    {action === 'withdraw' && isDelisted && (
                        <button
                            onClick={handleSetAllDelisted}
                            disabled={actionDisabled || !vaultBalance || vaultBalance.isZero() || decimals === null || !priceData || !wLqiValueScaled || wLqiValueScaled.isZero() || wLqiDecimals === null}
                            className={`${buttonClassName} ${(actionDisabled || !vaultBalance || vaultBalance.isZero() || decimals === null || !priceData || !wLqiValueScaled || wLqiValueScaled.isZero() || wLqiDecimals === null) ? 'cursor-not-allowed opacity-50' : ''}`}
                            title={t('main.poolInfoDisplay.tokenTable.tokenInputControls.actions.allDelisted')}
                        >
                            {t('main.poolInfoDisplay.tokenTable.tokenInputControls.actions.all')}
                        </button>
                    )}
                </div>
            </div>
            <div className="relative w-full">
                <input
                    id={inputId}
                    type="text"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    placeholder={inputPlaceholder}
                    value={currentAmount}
                    onChange={(e) => handleAmountChange(mintAddress, action, e.target.value, isDeposit ? decimals : wLqiDecimals)}
                    className={inputClassName}
                    disabled={actionDisabled || (isDeposit && isDelisted)}
                />
                {showTargetButton && handleSetTargetAmount && (
                    <button
                        onClick={() => handleSetTargetAmount(mintAddress, action)}
                        disabled={actionDisabled}
                        className={`${targetButtonClassName} ${actionDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                        title={t('main.poolInfoDisplay.tokenTable.tokenInputControls.actions.toTarget')}
                    >
                        {t('main.poolInfoDisplay.tokenTable.tokenInputControls.actions.toTarget')}
                    </button>
                )}
            </div>
            <div className="flex justify-end">
                <div className="text-gray-400 text-[10px] h-3">{displayInputUsdValue}</div>
            </div>
        </div>
    );
}; 