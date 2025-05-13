import { BN } from '@coral-xyz/anchor';
import { BTN_GREEN, BTN_RED, BTN_GRAY } from './constants';
import { formatFeeString, formatDelistedWithdrawFeeString } from './fees';
import { PublicKey } from '@solana/web3.js';
import { TFunction } from 'i18next';

interface ButtonStateProps {
    t: TFunction;
    publicKey: PublicKey | null;
    actionDisabled: boolean;
    isDepositing: boolean;
    isWithdrawing: boolean;
    isDepositInputFilled: boolean;
    isWithdrawInputFilled: boolean;
    isDelisted: boolean;
    depositInsufficientBalance: boolean;
    withdrawInsufficientBalance: boolean;
    withdrawalExceedsLiquidity: boolean;
    vaultBalance: BN | null;
    symbol: string;
    estimatedDepositFeeBps: number;
    estimatedWithdrawFeeBps: number;
    depositInputValueUsd?: number;
    withdrawInputValueUsd?: number;
}

interface ButtonState {
    depositButtonDisabled: boolean;
    withdrawButtonDisabled: boolean;
    depositBtnClass: string;
    withdrawBtnClass: string;
    depositLabel: string;
    withdrawLabel: string;
    depositTitle: string;
    withdrawTitle: string;
}

export const calculateButtonStates = ({
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
    depositInputValueUsd,
    withdrawInputValueUsd,
}: ButtonStateProps): ButtonState => {
    const isConnected = !!publicKey;

    // Initialize default states
    let depositButtonDisabled = actionDisabled || !isDepositInputFilled || isDelisted || (isConnected && depositInsufficientBalance);
    let withdrawButtonDisabled = actionDisabled
        || !isWithdrawInputFilled
        || (isConnected && withdrawInsufficientBalance)
        || (isConnected && withdrawalExceedsLiquidity)
        || (isDelisted && (!vaultBalance || vaultBalance.isZero()));

    let depositBtnClass = BTN_GRAY;
    let withdrawBtnClass = BTN_GRAY;
    let depositLabel = isDepositing ? t('main.poolInfoDisplay.tokenTable.buttonState.depositing') : t('main.poolInfoDisplay.tokenTable.buttonState.deposit');
    let withdrawLabel = isWithdrawing ? t('main.poolInfoDisplay.tokenTable.buttonState.withdrawing') : t('main.poolInfoDisplay.tokenTable.buttonState.withdraw');
    let depositTitle = t('main.poolInfoDisplay.tokenTable.buttonState.tooltips.depositDefaultTitle');
    let withdrawTitle = t('main.poolInfoDisplay.tokenTable.buttonState.tooltips.withdrawDefaultTitle');

    // Determine button colors and incorporate fee strings
    if (!actionDisabled) {
        if (estimatedDepositFeeBps <= 0) {
            depositBtnClass = BTN_GREEN;
        } else {
            depositBtnClass = BTN_RED;
        }

        // Only set withdraw color if not disabled by liquidity/balance issues (or if not connected)
        const withdrawLogicEnabled = !isConnected || (!withdrawalExceedsLiquidity && !withdrawInsufficientBalance && !(isDelisted && (!vaultBalance || vaultBalance.isZero())));
        if (withdrawLogicEnabled) {
            if (isDelisted) {
                withdrawBtnClass = BTN_GREEN; // Delisted withdraw always shows green if possible
            } else if (estimatedWithdrawFeeBps === 0) {
                withdrawBtnClass = BTN_GREEN;
            } else if (estimatedWithdrawFeeBps > 0) { 
                withdrawBtnClass = BTN_RED;
            } 
            else if (estimatedWithdrawFeeBps < 0) { 
                withdrawBtnClass = BTN_GREEN;
            }
        }

        const { feeString: depositFeeString, title: depositTitleBase } = formatFeeString(t, estimatedDepositFeeBps, true, isDepositInputFilled, depositInputValueUsd);
        depositLabel = t('main.poolInfoDisplay.tokenTable.buttonState.depositWithFee', { feeString: depositFeeString });
        depositTitle = depositTitleBase;

        // Always calculate base withdraw label/title based on fees
        if (isDelisted) {
            const { feeString: withdrawFeeString, title: withdrawTitleBase } = formatDelistedWithdrawFeeString(t, isWithdrawInputFilled, withdrawInputValueUsd);
            withdrawLabel = t('main.poolInfoDisplay.tokenTable.buttonState.withdrawDelistedAmount', { feeString: withdrawFeeString });
            withdrawTitle = withdrawTitleBase;
        } else {
            const { feeString: withdrawFeeString, title: withdrawTitleBase } = formatFeeString(t, estimatedWithdrawFeeBps, false, isWithdrawInputFilled, withdrawInputValueUsd);
            withdrawLabel = t('main.poolInfoDisplay.tokenTable.buttonState.withdrawWithFee', { feeString: withdrawFeeString });
            withdrawTitle = withdrawTitleBase;
        }
    }

    // Apply overrides for insufficient balance/liquidity ONLY IF CONNECTED
    if (isConnected) {
        if (depositInsufficientBalance) {
            depositLabel = t('main.poolInfoDisplay.tokenTable.buttonState.insufficientToken', { symbol: symbol });
            depositTitle = t('main.poolInfoDisplay.tokenTable.buttonState.tooltips.insufficientToken', { symbol: symbol });
            depositButtonDisabled = true;
            depositBtnClass = BTN_GRAY;
        }

        if (withdrawInsufficientBalance) {
            withdrawLabel = t('main.poolInfoDisplay.tokenTable.buttonState.insufficientWlqi');
            withdrawTitle = t('main.poolInfoDisplay.tokenTable.buttonState.tooltips.insufficientWlqi');
            withdrawButtonDisabled = true;
            withdrawBtnClass = BTN_GRAY;
        } else if (withdrawalExceedsLiquidity) {
            withdrawLabel = t('main.poolInfoDisplay.tokenTable.buttonState.insufficientPoolToken', { symbol: symbol });
            withdrawTitle = t('main.poolInfoDisplay.tokenTable.buttonState.tooltips.insufficientPoolToken', { symbol: symbol });
            withdrawButtonDisabled = true;
            withdrawBtnClass = BTN_GRAY;
        }
    }

    // Delisted Pool Empty check applies regardless of connection
    if (isDelisted && (!vaultBalance || vaultBalance.isZero())) {
        withdrawLabel = t('main.poolInfoDisplay.tokenTable.buttonState.poolEmpty');
        withdrawTitle = t('main.poolInfoDisplay.tokenTable.buttonState.tooltips.poolEmpty');
        withdrawButtonDisabled = true;
        withdrawBtnClass = BTN_GRAY;
    }

    // If not connected, ensure button isn't disabled for balance/liquidity reasons
    if (!isConnected) {
         depositButtonDisabled = actionDisabled || !isDepositInputFilled || isDelisted; 
         withdrawButtonDisabled = actionDisabled || !isWithdrawInputFilled || (isDelisted && (!vaultBalance || vaultBalance.isZero()));
         // Re-calculate withdrawBtnClass if not connected, ignoring balance/liquidity issues
         if (!actionDisabled) {
             if (isDelisted) {
                 withdrawBtnClass = BTN_GREEN;
             } else if (estimatedWithdrawFeeBps === 0) {
                 withdrawBtnClass = BTN_GREEN;
             } else if (estimatedWithdrawFeeBps > 0) { 
                 withdrawBtnClass = BTN_RED;
             } 
             else if (estimatedWithdrawFeeBps < 0) { 
                 withdrawBtnClass = BTN_GREEN;
             }
         }
    }

    return {
        depositButtonDisabled,
        withdrawButtonDisabled,
        depositBtnClass,
        withdrawBtnClass,
        depositLabel,
        withdrawLabel,
        depositTitle,
        withdrawTitle,
    };
}; 