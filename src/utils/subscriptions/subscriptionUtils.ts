import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { showToast } from '../ui/notifications';

/**
 * Throttles a function to limit execution rate
 */
const throttle = <T extends (arg: AccountInfo<Buffer>) => void>(fn: T, limit: number) => {
    let inThrottle = false;
    
    return function(this: unknown, arg: AccountInfo<Buffer>) {
        if (!inThrottle) {
            fn.call(this, arg);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

/**
 * Cleanup multiple subscriptions at once
 */
export const cleanupSubscriptions = async (connection: Connection, subscriptionIds: number[]) => {
    if (!subscriptionIds.length) return;
    
    await Promise.allSettled(
        subscriptionIds.map(async (subId) => {
            try {
                await connection.removeAccountChangeListener(subId);
            } catch (err) {
                console.error(`Error removing subscription ${subId}:`, err);
                showToast('Failed to cleanup subscription', 'error');
            }
        })
    );
};

/**
 * Setup a subscription for an account
 */
export const setupSubscription = (
    connection: Connection,
    account: PublicKey,
    callback: () => void,
    accountName: string
): number | null => {
    try {
        // Throttle the callback to prevent rapid successive calls
        const throttledCallback = throttle(() => {
            callback();
        }, 500); // 500ms throttle time

        return connection.onAccountChange(
            account,
            throttledCallback,
            'confirmed'
        );
    } catch (e) {
        console.error(`Failed to subscribe to ${accountName} (${account.toBase58()}):`, e);
        showToast(`Failed to subscribe to ${accountName}`, 'error');
        return null;
    }
};

/**
 * Setup a subscription for a user's token account
 */
export const setupUserTokenSubscription = (
    connection: Connection,
    userAta: PublicKey,
    onBalanceChange: (accountInfo: AccountInfo<Buffer>) => void
): number | null => {
    try {
        // Throttle the callback to prevent rapid successive calls
        const throttledCallback = throttle((accountInfo: AccountInfo<Buffer>) => {
            onBalanceChange(accountInfo);
        }, 500); // 500ms throttle time

        return connection.onAccountChange(
            userAta,
            throttledCallback,
            'confirmed'
        );
    } catch (error) {
        console.error(`Failed to subscribe to user ATA ${userAta.toBase58()}:`, error);
        showToast('Failed to subscribe to token balance updates', 'error');
        return null;
    }
}; 