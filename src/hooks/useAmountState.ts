import { useState, useCallback } from 'react';

/**
 * Manages the state for deposit and withdraw input amounts for multiple tokens.
 */
export const useAmountState = () => {
    const [depositAmounts, setDepositAmounts] = useState<Record<string, string>>({});
    const [withdrawAmounts, setWithdrawAmounts] = useState<Record<string, string>>({});

    /**
     * Validates and sanitizes the input amount based on token decimals
     * @returns {string} Sanitized amount or empty string if invalid
     */
    const validateAmount = useCallback((amount: string, decimals: number | null): string => {
        // Allow empty string for clearing
        if (amount === '') return '';
        
        // Remove any non-numeric characters except decimal point
        const sanitized = amount.replace(/[^\d.]/g, '');
        
        // Ensure only one decimal point
        const parts = sanitized.split('.');
        if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('');
        
        // Prevent negative numbers
        if (sanitized.startsWith('-')) return '';
        
        // Prevent numbers starting with multiple zeros
        if (sanitized.startsWith('0') && sanitized.length > 1 && sanitized[1] !== '.') {
            return '0';
        }

        // Handle decimal places
        if (decimals !== null && parts.length === 2) {
            // Limit decimal places to token decimals
            if (parts[1].length > decimals) {
                return parts[0] + '.' + parts[1].slice(0, decimals);
            }
        }
        
        return sanitized;
    }, []);

    /**
     * Handles updating the input amount for a specific token and action.
     */
    const handleAmountChange = useCallback((mintAddress: string, action: 'deposit' | 'withdraw', amount: string, decimals: number | null) => {
        const validatedAmount = validateAmount(amount, decimals);
        if (action === 'deposit') {
            setDepositAmounts(prev => ({ ...prev, [mintAddress]: validatedAmount }));
        } else {
            setWithdrawAmounts(prev => ({ ...prev, [mintAddress]: validatedAmount }));
        }
    }, [validateAmount]);

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