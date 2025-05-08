import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';

/**
 * Cleans up multiple subscriptions by removing their listeners
 */
export const cleanupSubscriptions = async (connection: Connection, subscriptionIds: number[]) => {
    if (!subscriptionIds.length) {
        console.log('No subscriptions to clean up');
        return;
    }
    
    console.log(`Cleaning up ${subscriptionIds.length} subscriptions...`);
    const results = await Promise.allSettled(
        subscriptionIds.map(async (subId) => {
            try {
                await connection.removeAccountChangeListener(subId);
                console.log(`Successfully removed subscription ${subId}`);
            } catch (err) {
                console.error(`Error removing subscription ${subId}:`, err);
            }
        })
    );

    // Log summary of cleanup
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;
    console.log(`Subscription cleanup complete: ${successCount} successful, ${failureCount} failed`);
};

/**
 * Throttles a function to limit execution rate
 */
const throttle = <T extends (...args: unknown[]) => void>(fn: T, limit: number) => {
    let inThrottle = false;
    
    return function(this: unknown, ...args: Parameters<T>) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

/**
 * Sets up a subscription for an account with throttled callback
 */
export const setupSubscription = (
    connection: Connection,
    account: PublicKey,
    callback: () => void,
    accountName: string
): number | null => {
    try {
        console.log(`Setting up subscription for ${accountName} (${account.toBase58()})...`);
        
        // Throttle the callback to prevent rapid successive calls
        const throttledCallback = throttle(() => {
            console.log(`[${accountName}] Account changed, triggering refresh...`);
            callback();
        }, 500); // 500ms throttle time

        const subId = connection.onAccountChange(
            account,
            throttledCallback,
            'confirmed'
        );
        console.log(`Successfully subscribed to ${accountName} (ID: ${subId})`);
        return subId;
    } catch (e) {
        console.error(`Failed to subscribe to ${accountName} (${account.toBase58()}):`, e);
        return null;
    }
};

/**
 * Sets up a subscription for a user's token account
 */
export const setupUserTokenSubscription = (
    connection: Connection,
    mint: PublicKey,
    publicKey: PublicKey,
    refreshUserData: () => void
): number | null => {
    try {
        const userAta = getAssociatedTokenAddressSync(mint, publicKey);
        console.log(`Setting up user token subscription for ${mint.toBase58()} (ATA: ${userAta.toBase58()})...`);
        return setupSubscription(
            connection,
            userAta,
            refreshUserData,
            `User ATA for ${mint.toBase58()}`
        );
    } catch (error) {
        console.error(`Failed to get ATA or subscribe for token ${mint.toBase58()}:`, error);
        return null;
    }
}; 