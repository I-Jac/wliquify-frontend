'use client';

import React from 'react';
import { BN } from '@coral-xyz/anchor';
import { ProcessedTokenData } from '@/utils/calculations'; // Correct import path
import { formatRawAmountString, formatScaledBnToDollarString, formatFeeBonusString, calculateTokenValueUsdScaled } from '@/utils/calculations';
import { USD_SCALE } from '@/utils/constants';
import { parseUnits } from 'ethers';

// --- Constants for Button Colors ---
const BTN_GREEN = "bg-green-600 hover:bg-green-700";
const BTN_RED = "bg-red-600 hover:bg-red-700";
const BTN_GRAY = "bg-gray-500 hover:bg-gray-600 cursor-not-allowed";
const BTN_ORANGE = "bg-orange-600 hover:bg-orange-500"; // For Withdraw All

interface WithdrawControlProps {
    token: ProcessedTokenData;
    currentWithdrawAmount: string;
    userWlqiBalance: BN | null;
    wLqiDecimals: number | null;
    wLqiValueScaled: BN | null;
    handleAmountChange: (mintAddress: string, action: 'deposit' | 'withdraw', amount: string) => void;
    handleSetAmount: (mintAddress: string, action: 'withdraw', fraction: number) => void;
    handleSetTargetAmount: (mintAddress: string, action: 'withdraw') => void;
    handleSetWithdrawAllForDelisted: (token: ProcessedTokenData) => void;
    handleActualWithdraw: () => Promise<void>;
    isProcessing: boolean; // Combined loading state
    isWithdrawInputFilled: boolean;
    withdrawInsufficientBalance: boolean;
    withdrawalExceedsLiquidity: boolean;
    estimatedWithdrawFeeBpsBN: BN | null;
    targetDominanceScaledBn: BN; // Needed for 'To Target' button logic
    actualScaled: BN; // Needed for 'To Target' button logic
    isDelistedTable: boolean;
}

export const WithdrawControl: React.FC<WithdrawControlProps> = ({
    token,
    currentWithdrawAmount,
    userWlqiBalance,
    wLqiDecimals,
    wLqiValueScaled,
    handleAmountChange,
    handleSetAmount,
    handleSetTargetAmount,
    handleSetWithdrawAllForDelisted,
    handleActualWithdraw,
    isProcessing,
    isWithdrawInputFilled,
    withdrawInsufficientBalance,
    withdrawalExceedsLiquidity,
    estimatedWithdrawFeeBpsBN,
    targetDominanceScaledBn,
    actualScaled,
    isDelistedTable,
}) => {
    const { mintAddress, symbol, decimals, vaultBalance, priceData, isDelisted } = token;

    // --- Formatting & Display Logic ---
    const formattedUserWlqiBalance = formatRawAmountString(userWlqiBalance?.toString(), wLqiDecimals, true, 2);
    const displayUserWlqiBalance = formattedUserWlqiBalance ? `${formattedUserWlqiBalance} wLQI` : 'N/A';

    let displayWithdrawInputUsdValue = '$ --.--';
    if (isWithdrawInputFilled && wLqiDecimals !== null && wLqiValueScaled) {
        // Simplified: Estimate based on current wLQI price
        try {
            const inputAmountBn = new BN(parseUnits(currentWithdrawAmount, wLqiDecimals).toString());
            const wLqiValueMultiplier = new BN(10).pow(new BN(wLqiDecimals));
            if (!wLqiValueMultiplier.isZero()) {
                const usdValue = inputAmountBn.mul(wLqiValueScaled).div(wLqiValueMultiplier);
                displayWithdrawInputUsdValue = formatScaledBnToDollarString(usdValue, USD_SCALE);
            }
        } catch { /* ignore parsing errors */ }
    } else if (currentWithdrawAmount === '' || currentWithdrawAmount === '0') {
        displayWithdrawInputUsdValue = '$ 0.00';
    }

    // --- Format Fee/Bonus Strings ---
    const { feeString: withdrawFeeString, title: withdrawTitleBase } = formatFeeBonusString(estimatedWithdrawFeeBpsBN, false);

    // --- Button State & Labels ---
    let withdrawButtonDisabled = isProcessing || !isWithdrawInputFilled || withdrawInsufficientBalance || withdrawalExceedsLiquidity;
    let withdrawLabel = isProcessing ? 'Processing...' : `Withdraw ${withdrawFeeString}`;
    let withdrawTitle = withdrawTitleBase;

    if (isDelisted) {
        // Withdraw label/title already set by formatFeeBonusString for delisted
        // Only disable withdraw if processing or no input or insufficient wLQI
        withdrawButtonDisabled = isProcessing || !isWithdrawInputFilled || withdrawInsufficientBalance;
    } else if (withdrawalExceedsLiquidity) {
        withdrawLabel = `Insufficient Pool ${symbol}`;
        withdrawTitle = `Pool lacks sufficient ${symbol} for withdrawal`;
        withdrawButtonDisabled = true;
    }

    if (withdrawInsufficientBalance) {
        withdrawLabel = `Insufficient User wLQI`;
        withdrawTitle = `Withdraw amount exceeds your wLQI balance`;
        withdrawButtonDisabled = true;
    }

    // --- Determine Button Colors ---
    let withdrawBtnClass = BTN_GRAY;
    if (!withdrawButtonDisabled) {
        withdrawBtnClass = estimatedWithdrawFeeBpsBN && estimatedWithdrawFeeBpsBN.isNeg() ? BTN_GREEN : BTN_RED;
    }

    return (
        <div className="flex flex-col space-y-1">
            <div className="flex items-center justify-between">
                <div className="text-gray-400 text-[10px] flex items-center" title="Your wLQI balance">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="mr-1">
                        <path d="M13.8205 12.2878C13.8205 12.4379 13.791 12.5865 13.7335 12.7252C13.6761 12.8638 13.5919 12.9898 13.4858 13.0959C13.3797 13.2021 13.2537 13.2863 13.115 13.3437C12.9764 13.4011 12.8278 13.4307 12.6777 13.4307H3.04911C2.746 13.4307 2.45531 13.3103 2.24099 13.0959C2.02666 12.8816 1.90625 12.5909 1.90625 12.2878V4.18992C1.90625 3.68474 2.10693 3.20026 2.46414 2.84305C2.82135 2.48584 3.30584 2.28516 3.81101 2.28516H10.3718C10.6749 2.28516 10.9656 2.40556 11.1799 2.61989C11.3942 2.83422 11.5146 3.12491 11.5146 3.42801L11.5142 4.20668H12.6777C12.8278 4.20668 12.9764 4.23624 13.115 4.29367C13.2537 4.35111 13.3797 4.43529 13.4858 4.54141C13.5919 4.64754 13.6761 4.77353 13.7335 4.91218C13.791 5.05084 13.8205 5.19946 13.8205 5.34954V12.2878ZM12.6777 5.34954H3.04911V12.2878H12.6777L12.6773 10.356H8.43996V7.28173L12.6773 7.28135V5.34992L12.6777 5.34954ZM12.6777 8.4242H9.58244V9.21316H12.6773V8.42459L12.6777 8.4242ZM10.3718 3.42801H3.81101C3.60894 3.42801 3.41515 3.50829 3.27226 3.65117C3.12938 3.79405 3.04911 3.98785 3.04911 4.18992L3.04873 4.20668H10.3714V3.42801H10.3718Z"></path>
                    </svg>
                    <span>{displayUserWlqiBalance}</span>
                </div>
                <div className="flex items-center space-x-1">
                    <button
                        onClick={() => handleSetAmount(mintAddress, 'withdraw', 0.5)}
                        disabled={isProcessing || !userWlqiBalance || userWlqiBalance.isZero()}
                        className={`px-1 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(isProcessing || !userWlqiBalance || userWlqiBalance.isZero()) ? 'cursor-not-allowed opacity-50' : ''}`}
                        title="Set amount to 50% of your wLQI balance"
                    > Half </button>
                    <button
                        onClick={() => handleSetAmount(mintAddress, 'withdraw', 1)}
                        disabled={isProcessing || !userWlqiBalance || userWlqiBalance.isZero()}
                        className={`px-1 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center ${(isProcessing || !userWlqiBalance || userWlqiBalance.isZero()) ? 'cursor-not-allowed opacity-50' : ''}`}
                        title="Set amount to your maximum wLQI balance"
                    > Max </button>
                </div>
            </div>

            <div className="flex items-center">
                <div className="w-full">
                    <input
                        id={`withdraw-${mintAddress}`}
                        type="number"
                        step="any"
                        min="0"
                        placeholder="Amount (wLQI)"
                        value={currentWithdrawAmount}
                        onChange={(e) => {
                            const sanitizedValue = e.target.value.replace(/,/g, '');
                            handleAmountChange(mintAddress, 'withdraw', sanitizedValue);
                        }}
                        className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 w-full text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                        disabled={isProcessing}
                    />
                </div>
            </div>

            {/* Combined "To Target" / "All" Button and USD Estimate Line */}
            <div className="flex justify-between items-center mt-1 min-h-[1.125rem]"> {/* Ensure minimum height */}
                {/* Conditional Buttons (Left Aligned) */}
                <div> { /* Container for left-aligned buttons */ }
                    {!isDelistedTable && actualScaled.gt(targetDominanceScaledBn) && (
                        <button
                            onClick={() => handleSetTargetAmount(mintAddress, 'withdraw')}
                            disabled={isProcessing}
                            className={`px-1 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 rounded text-white text-center ${isProcessing ? 'cursor-not-allowed opacity-50' : ''}`}
                            title="Set wLQI amount needed to reach target dominance"
                        > Target </button>
                    )}
                    {isDelistedTable && (
                        <button
                            onClick={() => handleSetWithdrawAllForDelisted(token)}
                            disabled={isProcessing || !vaultBalance || vaultBalance.isZero()}
                            className={`px-1 py-0.5 text-[10px] ${BTN_ORANGE} rounded text-white text-center ${(isProcessing || !vaultBalance || vaultBalance.isZero()) ? 'cursor-not-allowed opacity-50' : ''}`}
                            title="Calculate wLQI needed to withdraw entire vault balance (with bonus)"
                        > All </button>
                    )}
                </div>

                {/* USD Estimate (Right Aligned) */}
                <div className="text-gray-400 text-[10px]" title="Estimated USD value of input amount">
                    {displayWithdrawInputUsdValue}
                </div>
            </div>

            <button
                onClick={handleActualWithdraw}
                disabled={withdrawButtonDisabled}
                className={`w-full px-1 py-0.5 text-xs rounded text-white truncate ${withdrawBtnClass} ${withdrawButtonDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                title={withdrawTitle}
            >
                {withdrawLabel}
            </button>
        </div>
    );
}; 