'use client';

import { useEffect, useCallback, useRef } from 'react';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { PoolConfig, SupportedToken } from '@/utils/core/types';
import { cleanupSubscriptions, setupSubscription, setupUserTokenSubscription } from '@/utils/subscriptions/subscriptionUtils';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { decodeTokenAccountAmountBN } from '@/utils/solana/accounts';
import { BN } from '@coral-xyz/anchor';

interface UseSubscriptionsProps {
    connection: Connection;
    poolConfig: PoolConfig | null;
    poolConfigPda: PublicKey | null;
    userPublicKey: PublicKey | null;
    refreshPublicData: () => void;
    refreshOracleData: () => void;
    setUserWlqiBalance: (balance: BN) => void;
    setUserTokenBalances: (callback: (prev: Map<string, BN>) => Map<string, BN>) => void;
}

/**
 * Manages WebSocket subscriptions for pool data changes.
 */
export function useSubscriptions({
    connection,
    poolConfig,
    poolConfigPda,
    userPublicKey,
    refreshPublicData,
    refreshOracleData,
    setUserWlqiBalance,
    setUserTokenBalances
}: UseSubscriptionsProps) {
    const subscriptionIdsRef = useRef<number[]>([]);

    // Memoize the cleanup function to prevent unnecessary recreations
    const cleanup = useCallback((connection: Connection, subscriptions: number[]) => {
        if (subscriptions.length > 0) {
            console.log('useSubscriptions: Cleaning up subscriptions...');
            cleanupSubscriptions(connection, subscriptions);
        }
    }, []);

    // --- Public Data Subscriptions (PoolConfig, Oracle, Vaults) ---
    useEffect(() => {
        if (!connection || !poolConfig || !poolConfigPda) {
            return;
        }

        console.log("useSubscriptions: Setting up PoolConfig/Oracle/Vault subscriptions...");
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
                refreshOracleData,
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
    }, [connection, poolConfig, poolConfigPda, refreshPublicData, refreshOracleData, cleanup]);

    // --- User Account Subscriptions ---
    useEffect(() => {
        const subscriptionIds: number[] = [];

        if (!connection || !poolConfig || !userPublicKey || !poolConfig.wliMint) {
            // If essential data for subscriptions isn't ready, clean up existing and exit.
            cleanup(connection, subscriptionIdsRef.current);
            subscriptionIdsRef.current = [];
            return;
        }

        // Subscribe to wLQI balance changes
        const wLqiSub = setupUserTokenSubscription(
            connection,
            getAssociatedTokenAddressSync(poolConfig.wliMint, userPublicKey, true),
            (accountInfo) => {
                const newBalance = decodeTokenAccountAmountBN(accountInfo.data);
                setUserWlqiBalance(newBalance);
            }
        );
        if (wLqiSub) subscriptionIds.push(wLqiSub);

        // Subscribe to other token balance changes
        poolConfig.supportedTokens.forEach(token => {
            if (!token.mint) return;
            const userAta = getAssociatedTokenAddressSync(token.mint, userPublicKey, true);
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
                }
            );
            if (sub) subscriptionIds.push(sub);
        });

        subscriptionIdsRef.current = subscriptionIds;

        return () => {
            cleanup(connection, subscriptionIds);
        };
    }, [connection, poolConfig, userPublicKey, setUserWlqiBalance, setUserTokenBalances, cleanup]);

    return subscriptionIdsRef;
} 