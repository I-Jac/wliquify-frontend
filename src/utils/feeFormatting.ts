import { BPS_SCALE } from './constants';

export const formatFeeString = (estimatedBps: number, isDepositAction: boolean) => {
    let feeString: string;
    let title: string;
    if (isDepositAction) {
        if (estimatedBps < 0) {
            const bonusPercent = (Math.abs(estimatedBps) / BPS_SCALE * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            feeString = `(~${bonusPercent}% Bonus)`;
            title = `Est. Bonus: ~${bonusPercent}%`;
        } else if (estimatedBps === 0) {
            feeString = `(0.00%)`;
            title = "Est. Total Fee: 0.00%";
        } else {
            const displayPercent = (estimatedBps / BPS_SCALE * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            feeString = `(~${displayPercent}% Fee)`;
            title = `Est. Total Fee: ~${displayPercent}%`;
        }
    } else {
        if (estimatedBps === 0) {
            feeString = "(0.00%)";
            title = "Minimum fee applied (0.00%)";
        } else if (estimatedBps > 0) {
            const displayPercent = (estimatedBps / BPS_SCALE * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            feeString = `(~${displayPercent}% Fee)`;
            title = `Est. Total Fee: ~${displayPercent}%`;
        } else {
            feeString = "(Fee Error)";
            title = "Error estimating fee";
        }
    }
    return { feeString, title };
};

export const formatDelistedWithdrawFeeString = () => {
    const feeString = "(~5% Bonus)";
    const title = "Fixed bonus applied for delisted token withdrawal (0% net fee).";
    return { feeString, title };
}; 