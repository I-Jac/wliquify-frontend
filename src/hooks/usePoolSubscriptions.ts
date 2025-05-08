'use client';

import { useEffect, useCallback, useRef } from 'react';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { PoolConfig, SupportedToken } from '@/utils/types';
import { cleanupSubscriptions, setupSubscription, setupUserTokenSubscription } from '@/utils/subscriptionUtils';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { decodeTokenAccountAmountBN } from '@/utils/accounts';
import { BN } from '@coral-xyz/anchor';

interface UsePoolSubscriptionsProps {
    connection: Connection;
    poolConfig: PoolConfig;
    poolConfigPda: PublicKey | null;
    publicKey: PublicKey;
    refreshPublicData: () => void;
    refreshUserData: () => void;
    setUserWlqiBalance: (balance: BN) => void;
    setUserTokenBalances: (callback: (prev: Map<string, BN>) => Map<string, BN>) => void;
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
    refreshUserData,
    setUserWlqiBalance,
    setUserTokenBalances
}: UsePoolSubscriptionsProps) {
    const subscriptionIdsRef = useRef<number[]>([]);

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

        subscriptionIdsRef.current = subscriptions;

        return () => cleanup(connection, subscriptions);
    }, [connection, poolConfig, poolConfigPda, refreshPublicData, cleanup]);

    // --- User Account Subscriptions ---
    useEffect(() => {
        const subscriptionIds: number[] = [];

        // Subscribe to wLQI balance changes
        const wLqiSub = setupUserTokenSubscription(
            connection,
            getAssociatedTokenAddressSync(poolConfig.wliMint, publicKey, true),
            (accountInfo) => {
                const newBalance = decodeTokenAccountAmountBN(accountInfo.data);
                setUserWlqiBalance(newBalance);
                refreshUserData();
            }
        );
        if (wLqiSub) subscriptionIds.push(wLqiSub);

        // Subscribe to other token balance changes
        poolConfig.supportedTokens.forEach(token => {
            if (!token.mint) return;
            const userAta = getAssociatedTokenAddressSync(token.mint, publicKey, true);
            const sub = setupUserTokenSubscription(
                connection,
                userAta,
                (accountInfo) => {
                    const newBalance = decodeTokenAccountAmountBN(accountInfo.data);
                    setUserTokenBalances(prev => {
                        const next = new Map(prev);
                        next.set(token.mint!.toBase58(), newBalance);
                        return next;
                    });
                    refreshUserData();
                }
            );
            if (sub) subscriptionIds.push(sub);
        });

        subscriptionIdsRef.current = subscriptionIds;

        return () => {
            cleanup(connection, subscriptionIds);
        };
    }, [connection, poolConfig, publicKey, refreshUserData, setUserWlqiBalance, setUserTokenBalances, cleanup]);

    return subscriptionIdsRef;
} 