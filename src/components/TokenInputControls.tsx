import React from 'react';
import { BN } from '@coral-xyz/anchor';
import { formatUnits, parseUnits } from 'ethers';
import { formatScaledBnToDollarString, calculateTokenValueUsdScaled } from '@/utils/calculations';
import { USD_SCALE } from '@/utils/constants';
import { DecodedPriceData } from '@/utils/types';

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
}) => {
    const isDeposit = action === 'deposit';
    const isInputFilled = currentAmount !== '' && parseFloat(currentAmount) > 0;

    // Format user balance for display
    const displayUserBalance = userBalance !== null && (isDeposit ? decimals : wLqiDecimals) !== null
        ? formatUnits(userBalance.toString(), isDeposit ? decimals! : wLqiDecimals!)
        : '--.--';

    // Calculate USD value display
    let displayInputUsdValue = '$ --.--';
    if (isInputFilled) {
        try {
            if (isDeposit && decimals !== null && priceData) {
                const inputAmountBn = new BN(parseUnits(currentAmount, decimals).toString());
                const inputUsdValueScaled = calculateTokenValueUsdScaled(inputAmountBn, decimals, priceData);
                displayInputUsdValue = formatScaledBnToDollarString(inputUsdValueScaled, USD_SCALE);
            } else if (!isDeposit && wLqiDecimals !== null && wLqiValueScaled) {
                const inputWlqiAmountBn = new BN(parseUnits(currentAmount, wLqiDecimals).toString());
                const scaleFactorWlqi = new BN(10).pow(new BN(wLqiDecimals));
                if (!scaleFactorWlqi.isZero()) {
                    const inputUsdValueScaled = inputWlqiAmountBn.mul(wLqiValueScaled).div(scaleFactorWlqi);
                    displayInputUsdValue = formatScaledBnToDollarString(inputUsdValueScaled, USD_SCALE);
                }
            }
        } catch { displayInputUsdValue = '$ Invalid'; }
    } else if (currentAmount === '' || currentAmount === '0') {
        displayInputUsdValue = '$ 0.00';
    }

    const inputId = `${action}-${isMobile ? 'card-' : ''}${mintAddress}`;
    const inputPlaceholder = isDeposit ? `Amount (${symbol})` : 'Amount (wLQI)';
    const inputClassName = `flex-grow bg-gray-${isMobile ? '800' : '700'} text-white px-2 py-${isMobile ? '1.5' : '1'} rounded border border-gray-600 text-sm focus:outline-none focus:ring-1 focus:ring-${isDeposit ? 'blue' : 'red'}-500`;
    const buttonClassName = `px-${isMobile ? '1.5' : '1'} py-${isMobile ? '0.5' : '0.5'} text-[10px] bg-gray-600 hover:bg-gray-500 rounded text-white text-center`;
    const targetButtonClassName = `ml-1 px-${isMobile ? '1.5' : '1'} py-${isMobile ? '1' : '0.5'} text-[10px] bg-blue-600 hover:bg-blue-500 rounded text-white text-center whitespace-nowrap`;

    return (
        <div className="flex flex-col space-y-1">
            <div className="flex items-center justify-between">
                <div className="text-gray-400 text-[10px] flex items-center">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="mr-1">
                        <path d="M13.8205 12.2878C13.8205 12.4379 13.791 12.5865 13.7335 12.7252C13.6761 12.8638 13.5919 12.9898 13.4858 13.0959C13.3797 13.2021 13.2537 13.2863 13.115 13.3437C12.9764 13.4011 12.8278 13.4307 12.6777 13.4307H3.04911C2.746 13.4307 2.45531 13.3103 2.24099 13.0959C2.02666 12.8816 1.90625 12.5909 1.90625 12.2878V4.18992C1.90625 3.68474 2.10693 3.20026 2.46414 2.84305C2.82135 2.48584 3.30584 2.28516 3.81101 2.28516H10.3718C10.6749 2.28516 10.9656 2.40556 11.1799 2.61989C11.3942 2.83422 11.5146 3.12491 11.5146 3.42801L11.5142 4.20668H12.6777C12.8278 4.20668 12.9764 4.23624 13.115 4.29367C13.2537 4.35111 13.3797 4.43529 13.4858 4.54141C13.5919 4.64754 13.6761 4.77353 13.7335 4.91218C13.791 5.05084 13.8205 5.19946 13.8205 5.34954V12.2878ZM12.6777 5.34954H3.04911V12.2878H12.6777L12.6773 10.356H8.43996V7.28173L12.6773 7.28135V5.34992L12.6777 5.34954ZM12.6777 8.4242H9.58244V9.21316H12.6773V8.42459L12.6777 8.4242ZM10.3718 3.42801H3.81101C3.60894 3.42801 3.41515 3.50829 3.27226 3.65117C3.12938 3.79405 3.04911 3.98785 3.04911 4.18992L3.04873 4.20668H10.3714V3.42801H10.3718Z"></path>
                    </svg>
                    <span>Balance: {displayUserBalance} {isDeposit ? symbol : 'wLQI'}</span>
                </div>
                <div className="flex items-center space-x-1">
                    <button
                        onClick={() => handleSetAmount(mintAddress, action, 0.5)}
                        disabled={actionDisabled || userBalance === null || (isDeposit && isDelisted)}
                        className={`${buttonClassName} ${(actionDisabled || userBalance === null || (isDeposit && isDelisted)) ? 'cursor-not-allowed opacity-50' : ''}`}
                        title={`Set amount to 50% of your ${isDeposit ? symbol : 'wLQI'} balance`}
                    >
                        Half
                    </button>
                    <button
                        onClick={() => handleSetAmount(mintAddress, action, 1)}
                        disabled={actionDisabled || userBalance === null || (isDeposit && isDelisted)}
                        className={`${buttonClassName} ${(actionDisabled || userBalance === null || (isDeposit && isDelisted)) ? 'cursor-not-allowed opacity-50' : ''}`}
                        title={`Set amount to your maximum ${isDeposit ? symbol : 'wLQI'} balance`}
                    >
                        Max
                    </button>
                </div>
            </div>
            <div className="flex items-center">
                <div className="relative w-full">
                    <input
                        id={inputId}
                        type="number"
                        step="any"
                        min="0"
                        placeholder={inputPlaceholder}
                        value={currentAmount}
                        onChange={(e) => handleAmountChange(mintAddress, action, e.target.value, decimals)}
                        className={inputClassName}
                        disabled={actionDisabled || (isDeposit && isDelisted)}
                    />
                    {showTargetButton && handleSetTargetAmount && (
                        <button
                            onClick={() => handleSetTargetAmount(mintAddress, action)}
                            disabled={actionDisabled}
                            className={`${targetButtonClassName} ${actionDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                            title="Set amount needed to reach target dominance"
                        >
                            To Target
                        </button>
                    )}
                </div>
            </div>
            <div className="flex justify-end">
                <div className="text-gray-400 text-[10px] h-3">{displayInputUsdValue}</div>
            </div>
        </div>
    );
}; 