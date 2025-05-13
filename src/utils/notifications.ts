import toast from 'react-hot-toast';
import { useSettings } from '@/contexts/SettingsContext';
import React from 'react';
import type { CSSProperties } from 'react';
import i18next from 'i18next';

// Toast notification types
export type ToastType = 'success' | 'error' | 'loading' | 'info';

// Toast notification options
interface ToastOptions {
    duration?: number;
    position?: 'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left';
    style?: CSSProperties;
}

// Alert modal options
interface AlertOptions {
    title?: string;
    message: string;
    onConfirm?: () => void;
    onCancel?: () => void;
}

// Toast notification function
export const showToast = (
    message: string,
    type: ToastType = 'info',
    options: ToastOptions = {}
) => {
    const defaultOptions = {
        duration: 5000,
        position: 'top-right' as const,
        style: {
            maxWidth: '90vw',
            wordBreak: 'break-word' as const,
            whiteSpace: 'pre-wrap' as const
        }
    };

    const finalOptions = { ...defaultOptions, ...options };

    switch (type) {
        case 'success':
            return toast.success(message, finalOptions);
        case 'error':
            return toast.error(message, finalOptions);
        case 'loading':
            return toast.loading(message, finalOptions);
        default:
            return toast(message, finalOptions);
    }
};

// Alert modal function
export const showAlert = (
    message: string,
    options: Partial<AlertOptions> = {}
) => {
    const { openAlertModal } = useSettings();
    openAlertModal(message);
};

// Transaction notification helper
export const showTransactionNotification = (
    action: 'Deposit' | 'Withdrawal',
    status: 'loading' | 'success' | 'error',
    txid?: string,
    errorMessage?: string
) => {
    const toastId = `tx-${action.toLowerCase()}-${status}`;
    const t = i18next.t.bind(i18next);

    switch (status) {
        case 'loading':
            return toast.loading(
                action === 'Deposit'
                    ? t('notifications.processingDeposit')
                    : t('notifications.processingWithdrawal'),
                { id: toastId }
            );
        case 'success':
            if (txid) {
                const successContent = React.createElement('div', null, [
                    React.createElement('div', { key: 'message' },
                        action === 'Deposit'
                            ? t('notifications.depositSuccess')
                            : t('notifications.withdrawalSuccess')
                    ),
                    React.createElement('a', {
                        key: 'link',
                        href: `https://solscan.io/tx/${txid}?cluster=devnet`,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        style: { color: '#4CAF50', textDecoration: 'underline' }
                    }, t('notifications.successViewOnExplorer'))
                ]);
                return toast.success(successContent, { id: toastId });
            }
            return toast.success(
                action === 'Deposit'
                    ? t('notifications.depositSuccess')
                    : t('notifications.withdrawalSuccess'),
                { id: toastId }
            );
        case 'error':
            return toast.error(
                action === 'Deposit'
                    ? t('notifications.depositError', { errorMessage: errorMessage || 'Unknown error' })
                    : t('notifications.withdrawalError', { errorMessage: errorMessage || 'Unknown error' }),
                { id: toastId }
            );
    }
}; 