import { BN } from '@coral-xyz/anchor';
import { BTN_GREEN, BTN_RED, BTN_GRAY } from './constants';
import { formatFeeString, formatDelistedWithdrawFeeString } from './fees';

interface ButtonStateProps {
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
    // Initialize default states
    let depositButtonDisabled = actionDisabled || !isDepositInputFilled || isDelisted || depositInsufficientBalance;
    let withdrawButtonDisabled = actionDisabled
        || !isWithdrawInputFilled
        || withdrawInsufficientBalance
        || withdrawalExceedsLiquidity
        || (isDelisted && (!vaultBalance || vaultBalance.isZero()));

    let depositBtnClass = BTN_GRAY;
    let withdrawBtnClass = BTN_GRAY;
    let depositLabel = isDepositing ? 'Depositing...' : 'Deposit';
    let withdrawLabel = isWithdrawing ? 'Withdrawing...' : 'Withdraw';
    let depositTitle = 'Enter amount to deposit';
    let withdrawTitle = 'Enter wLQI amount to withdraw';

    // Determine button colors and incorporate fee strings
    if (!actionDisabled) {
        if (estimatedDepositFeeBps <= 0) {
            depositBtnClass = BTN_GREEN;
        } else {
            depositBtnClass = BTN_RED;
        }

        // Only set withdraw color if not disabled by liquidity/balance issues
        if (!withdrawalExceedsLiquidity && !withdrawInsufficientBalance && !(isDelisted && (!vaultBalance || vaultBalance.isZero()))) {
            if (isDelisted) {
                withdrawBtnClass = BTN_GREEN; // Delisted withdraw always shows green if possible
            } else if (estimatedWithdrawFeeBps === 0) {
                withdrawBtnClass = BTN_GREEN;
            } else if (estimatedWithdrawFeeBps > 0) { // Note: This could be < 0 for a bonus
                withdrawBtnClass = BTN_RED;
            }
            // If estimatedWithdrawFeeBps < 0 (bonus), it should be green
            else if (estimatedWithdrawFeeBps < 0) { 
                withdrawBtnClass = BTN_GREEN;
            }
        }

        const { feeString: depositFeeString, title: depositTitleBase } = formatFeeString(estimatedDepositFeeBps, true, isDepositInputFilled, depositInputValueUsd);
        depositLabel = `Deposit ${depositFeeString}`;
        depositTitle = depositTitleBase;

        if (isDelisted) {
            const { feeString: withdrawFeeString, title: withdrawTitleBase } = formatDelistedWithdrawFeeString(isWithdrawInputFilled, withdrawInputValueUsd);
            withdrawLabel = `Withdraw Amount ${withdrawFeeString}`;
            withdrawTitle = withdrawTitleBase;
        } else {
            const { feeString: withdrawFeeString, title: withdrawTitleBase } = formatFeeString(estimatedWithdrawFeeBps, false, isWithdrawInputFilled, withdrawInputValueUsd);
            withdrawLabel = `Withdraw ${withdrawFeeString}`;
            withdrawTitle = withdrawTitleBase;
        }
    }

    // Apply overrides for insufficient balance/liquidity AFTER fee strings are calculated
    if (depositInsufficientBalance) {
        depositLabel = `Insufficient ${symbol}`;
        depositTitle = `Deposit amount exceeds your ${symbol} balance`;
        depositButtonDisabled = true; // Ensure disabled
        depositBtnClass = BTN_GRAY;
    }

    if (withdrawInsufficientBalance) {
        withdrawLabel = "Insufficient wLQI";
        withdrawTitle = "Withdrawal amount exceeds your wLQI balance";
        withdrawButtonDisabled = true; // Ensure disabled
        withdrawBtnClass = BTN_GRAY;
    } else if (withdrawalExceedsLiquidity) {
        withdrawLabel = `Insufficient Pool ${symbol}`;
        withdrawTitle = `Pool lacks sufficient ${symbol} for withdrawal`;
        withdrawButtonDisabled = true; // Ensure disabled
        withdrawBtnClass = BTN_GRAY;
    } else if (isDelisted && (!vaultBalance || vaultBalance.isZero())) {
        withdrawLabel = "Pool Empty";
        withdrawTitle = "No balance of this delisted token in the pool to withdraw.";
        withdrawButtonDisabled = true; // Ensure disabled
        withdrawBtnClass = BTN_GRAY;
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