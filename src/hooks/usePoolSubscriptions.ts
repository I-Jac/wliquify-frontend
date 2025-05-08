'use client';

import { useEffect } from 'react';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PoolConfig, SupportedToken } from '@/utils/types'; // Update import path

interface UsePoolSubscriptionsProps {
    connection: Connection | null;
    poolConfig: PoolConfig | null;
    poolConfigPda: PublicKey | null;
    publicKey: PublicKey | null; // User's public key
    refreshPublicData: () => void; // Callback to refresh public data
    refreshUserData: () => void;   // Callback to refresh user data
}

// Add this helper function at the top of the file
const cleanupSubscriptions = async (connection: Connection, subscriptionIds: number[]) => {
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

// Add these helper functions after cleanupSubscriptions
const setupSubscription = (
    connection: Connection,
    account: PublicKey,
    callback: () => void,
    accountName: string
): number | null => {
    try {
        console.log(`Setting up subscription for ${accountName} (${account.toBase58()})...`);
        const subId = connection.onAccountChange(
            account,
            () => {
                console.log(`[${accountName}] Account changed, triggering refresh...`);
                callback();
            },
            'confirmed'
        );
        console.log(`Successfully subscribed to ${accountName} (ID: ${subId})`);
        return subId;
    } catch (e) {
        console.error(`Failed to subscribe to ${accountName} (${account.toBase58()}):`, e);
        return null;
    }
};

const setupUserTokenSubscription = (
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

/**
 * Manages WebSocket subscriptions for pool data changes.
 */
export function usePoolSubscriptions({
    connection,
    poolConfig,
    poolConfigPda,
    publicKey,
    refreshPublicData,
    refreshUserData
}: UsePoolSubscriptionsProps) {

    // --- Public Data Subscriptions (PoolConfig, Oracle, Vaults) ---
    useEffect(() => {
        if (!connection || !poolConfig || !poolConfigPda) {
            return;
        }
        console.log("usePoolSubscriptions: Setting up PoolConfig/Oracle/Vault subscriptions...");
        const subscriptions: number[] = [];

        // Subscribe to PoolConfig changes
        const poolConfigSub = setupSubscription(
            connection,
            poolConfigPda,
            refreshPublicData,
            'PoolConfig'
        );
        if (poolConfigSub) subscriptions.push(poolConfigSub);

        // Subscribe to Oracle Aggregator changes
        if (poolConfig.oracleAggregatorAccount && !poolConfig.oracleAggregatorAccount.equals(SystemProgram.programId)) {
            const oracleSub = setupSubscription(
                connection,
                poolConfig.oracleAggregatorAccount,
                refreshPublicData,
                'Oracle'
            );
            if (oracleSub) subscriptions.push(oracleSub);
        }

        // Subscribe to Vault balance changes
        poolConfig.supportedTokens.forEach((token: SupportedToken) => {
            if (token && token.vault && token.mint) {
                const vaultSub = setupSubscription(
                    connection,
                    token.vault,
                    refreshPublicData,
                    `Vault for ${token.mint.toBase58()}`
                );
                if (vaultSub) subscriptions.push(vaultSub);
            }
        });

        return () => {
            console.log('usePoolSubscriptions: Cleaning up PoolConfig/Oracle/Vault subscriptions...');
            cleanupSubscriptions(connection, subscriptions);
        };
    }, [connection, poolConfig, poolConfigPda, refreshPublicData]);

    // --- User Account Subscriptions ---
    useEffect(() => {
        if (!connection || !publicKey || !poolConfig || !poolConfig.wliMint) {
            return;
        }
        console.log("usePoolSubscriptions: Setting up account subscriptions for user:", publicKey.toBase58());
        const subscriptionIds: number[] = [];

        // Subscribe to user's wLQI ATA
        const wLqiSub = setupUserTokenSubscription(
            connection,
            poolConfig.wliMint,
            publicKey,
            refreshUserData
        );
        if (wLqiSub) subscriptionIds.push(wLqiSub);

        // Subscribe to user's other supported token ATAs
        poolConfig.supportedTokens.forEach((token: SupportedToken) => {
            if (token.mint && !token.mint.equals(poolConfig.wliMint)) {
                const subId = setupUserTokenSubscription(
                    connection,
                    token.mint,
                    publicKey,
                    refreshUserData
                );
                if (subId) subscriptionIds.push(subId);
            }
        });

        return () => {
            console.log("usePoolSubscriptions: Cleaning up user account subscriptions...");
            cleanupSubscriptions(connection, subscriptionIds);
        };
    }, [connection, publicKey, poolConfig, refreshUserData]);

    // This hook doesn't return anything, it just sets up listeners
} 