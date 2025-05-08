'use client';

import { useEffect, useCallback } from 'react';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { PoolConfig, SupportedToken } from '@/utils/types';
import { cleanupSubscriptions, setupSubscription, setupUserTokenSubscription } from '@/utils/subscriptionUtils';

interface UsePoolSubscriptionsProps {
    connection: Connection | null;
    poolConfig: PoolConfig | null;
    poolConfigPda: PublicKey | null;
    publicKey: PublicKey | null; // User's public key
    refreshPublicData: () => void; // Callback to refresh public data
    refreshUserData: () => void;   // Callback to refresh user data
}

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
    // Memoize the cleanup function to prevent unnecessary recreations
    const cleanup = useCallback((connection: Connection, subscriptions: number[]) => {
        if (subscriptions.length > 0) {
            console.log('usePoolSubscriptions: Cleaning up subscriptions...');
            cleanupSubscriptions(connection, subscriptions);
        }
    }, []);

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

        // Subscribe to Oracle Aggregator changes if valid
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
            if (token?.vault && token?.mint) {
                const vaultSub = setupSubscription(
                    connection,
                    token.vault,
                    refreshPublicData,
                    `Vault for ${token.mint.toBase58()}`
                );
                if (vaultSub) subscriptions.push(vaultSub);
            }
        });

        return () => cleanup(connection, subscriptions);
    }, [connection, poolConfig, poolConfigPda, refreshPublicData, cleanup]);

    // --- User Account Subscriptions ---
    useEffect(() => {
        if (!connection || !publicKey || !poolConfig?.wliMint) {
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

        return () => cleanup(connection, subscriptionIds);
    }, [connection, publicKey, poolConfig, refreshUserData, cleanup]);

    // This hook doesn't return anything, it just sets up listeners
} 