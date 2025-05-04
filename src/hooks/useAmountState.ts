import { useState, useCallback } from 'react';

/**
 * Manages the state for deposit and withdraw input amounts for multiple tokens.
 */
export const useAmountState = () => {
    const [depositAmounts, setDepositAmounts] = useState<Record<string, string>>({});
    const [withdrawAmounts, setWithdrawAmounts] = useState<Record<string, string>>({});

    /**
     * Handles updating the input amount for a specific token and action.
     */
    const handleAmountChange = useCallback((mintAddress: string, action: 'deposit' | 'withdraw', amount: string) => {
        // Basic validation/sanitization could be added here if needed
        if (action === 'deposit') {
            setDepositAmounts(prev => ({ ...prev, [mintAddress]: amount }));
        } else {
            setWithdrawAmounts(prev => ({ ...prev, [mintAddress]: amount }));
        }
    }, []);

    /**
     * Clears the input amount for a specific token and action.
     */
    const handleClearInput = useCallback((mintAddress: string, action: 'deposit' | 'withdraw') => {
        if (action === 'deposit') {
            setDepositAmounts(prev => ({ ...prev, [mintAddress]: '' }));
        } else {
            setWithdrawAmounts(prev => ({ ...prev, [mintAddress]: '' }));
        }
    }, []);

    return {
        depositAmounts,
        withdrawAmounts,
        handleAmountChange,
        handleClearInput,
    };
}; 