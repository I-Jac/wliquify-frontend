import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { showToast } from '../ui/notifications';

/**
 * Throttles a function to limit execution rate
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const throttle = <F extends (...args: any[]) => void>(fn: F, limit: number) => {
    let inThrottle = false;
    return function(this: unknown, ...args: Parameters<F>) {
        if (!inThrottle) {
            fn.apply(this, args);
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
 * @param connection The Solana connection object
 * @param account The PublicKey of the account to subscribe to
 * @param callback The function to call when the account changes. It can receive an optional identifier.
 * @param accountName A descriptive name for the account being subscribed to (for logging).
 * @param identifier An optional identifier to pass to the callback.
 * @returns The subscription ID, or null if subscription failed.
 */
export const setupSubscription = <T = void>(
    connection: Connection,
    account: PublicKey,
    callback: (identifier?: T) => void, // Callback can now accept an optional identifier
    accountName: string,
    identifier?: T // Optional identifier to be passed to the callback
): number | null => {
    try {
        // Throttle the callback to prevent rapid successive calls.
        // The original onAccountChange provides AccountInfo<Buffer> and Context, but our generic callback
        // is simplified to just use the identifier if provided.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const throttledCallback = throttle((_accountInfo: AccountInfo<Buffer>, _context: unknown) => {
            callback(identifier); // Pass the identifier to the actual callback
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
    onBalanceChange: (accountInfo: AccountInfo<Buffer>) => void // This specific callback uses AccountInfo
): number | null => {
    try {
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