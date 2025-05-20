'use client';

import { useEffect, useRef, useMemo } from 'react';
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
    refreshSpecificTokenDataCallback?: (mintAddress: PublicKey) => void;
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
    refreshSpecificTokenDataCallback,
    setUserWlqiBalance,
    setUserTokenBalances
}: UseSubscriptionsProps) {
    const subscriptionIdsRef = useRef<{ publicSet: Set<number>, userSet: Set<number> }>({ 
        publicSet: new Set(), 
        userSet: new Set() 
    });

    // --- Public Data Subscriptions (PoolConfig, Oracle, Vaults) ---
    const actualOracleAggregatorAccount = poolConfig?.oracleAggregatorAccount;
    const oracleAddressStringForDep = useMemo(() => 
        actualOracleAggregatorAccount && !actualOracleAggregatorAccount.equals(SystemProgram.programId)
            ? actualOracleAggregatorAccount.toBase58() 
            : null,
    [actualOracleAggregatorAccount]);

    const supportedTokensForDeps = poolConfig?.supportedTokens;
    const vaultAddressesStringForDep = useMemo(() => 
        supportedTokensForDeps
            ?.map(token => token.vault?.toBase58() ?? 'null')
            .sort()
            .join(',') ?? '',
    [supportedTokensForDeps]);

    useEffect(() => {
        const currentPublicSubs = new Set<number>();
        const refCurrent = subscriptionIdsRef.current;

        if (!connection || !poolConfigPda) {
            cleanupSubscriptions(connection, Array.from(refCurrent.publicSet));
            refCurrent.publicSet.clear();
            return;
        }

        const poolConfigSub = setupSubscription(connection, poolConfigPda, refreshPublicData, 'PoolConfig');
        if (poolConfigSub) currentPublicSubs.add(poolConfigSub);

        if (poolConfig?.oracleAggregatorAccount && !poolConfig.oracleAggregatorAccount.equals(SystemProgram.programId)) {
            const oracleSub = setupSubscription(connection, poolConfig.oracleAggregatorAccount, refreshOracleData, 'Oracle');
            if (oracleSub) currentPublicSubs.add(oracleSub);
        }

        poolConfig?.supportedTokens?.forEach((token: SupportedToken) => {
            if (token?.vault && token?.mint) {
                if (refreshSpecificTokenDataCallback) {
                    const vaultSub = setupSubscription(
                        connection, 
                        token.vault, 
                        (mintIdentifier?: PublicKey) => { 
                            if (mintIdentifier) {
                                refreshSpecificTokenDataCallback(mintIdentifier);
                            }
                        }, 
                        `Vault for ${token.mint.toBase58()}`,
                        token.mint
                    );
                    if (vaultSub) currentPublicSubs.add(vaultSub);
                } else {
                    console.warn(`useSubscriptions: refreshSpecificTokenDataCallback not provided. Vault updates for ${token.mint.toBase58()} may not be granular.`);
                }
            }
        });

        cleanupSubscriptions(connection, Array.from(refCurrent.publicSet));
        refCurrent.publicSet = currentPublicSubs;

        return () => {
            cleanupSubscriptions(connection, Array.from(currentPublicSubs));
            if (refCurrent) {
                refCurrent.publicSet.clear(); 
            }
        };
    }, [
        connection, 
        poolConfigPda, 
        oracleAddressStringForDep, 
        vaultAddressesStringForDep,  
        refreshPublicData, 
        refreshOracleData, 
        poolConfig?.oracleAggregatorAccount,
        poolConfig?.supportedTokens,
        refreshSpecificTokenDataCallback
    ]);

    // --- User Account Subscriptions ---
    const wLqiMintAddressForDep = useMemo(() => 
        poolConfig?.wliMint?.toBase58() ?? null,
    [poolConfig?.wliMint]);

    const userSubTokenMintsStringForDep = useMemo(() => 
        supportedTokensForDeps
            ?.map(t => t.mint?.toBase58() ?? 'null')
            .sort()
            .join(',') ?? '',
    [supportedTokensForDeps]);

    useEffect(() => {
        const currentUserSubs = new Set<number>();
        const refCurrent = subscriptionIdsRef.current;

        if (!connection || !userPublicKey || !wLqiMintAddressForDep || !poolConfig?.wliMint || !poolConfig?.supportedTokens) {
            cleanupSubscriptions(connection, Array.from(refCurrent.userSet));
            refCurrent.userSet.clear();
            return;
        }
        
        const wLqiSub = setupUserTokenSubscription(
            connection,
            getAssociatedTokenAddressSync(poolConfig.wliMint, userPublicKey, true),
            (accountInfo) => {
                const newBalance = decodeTokenAccountAmountBN(accountInfo.data);
                setUserWlqiBalance(newBalance);
            }
        );
        if (wLqiSub) currentUserSubs.add(wLqiSub);

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
            if (sub) currentUserSubs.add(sub);
        });

        cleanupSubscriptions(connection, Array.from(refCurrent.userSet));
        refCurrent.userSet = currentUserSubs;

        return () => {
            cleanupSubscriptions(connection, Array.from(currentUserSubs));
            if (refCurrent) {
                refCurrent.userSet.clear(); 
            }
        };
    }, [
        connection, 
        userPublicKey, 
        wLqiMintAddressForDep, 
        userSubTokenMintsStringForDep,
        setUserWlqiBalance, 
        setUserTokenBalances,
        poolConfig?.wliMint, 
        poolConfig?.supportedTokens
    ]);

    // Return a memoized, flattened array of all current subscription IDs
    const allSubscriptionIds = useMemo(() => {
        return Array.from(new Set([...subscriptionIdsRef.current.publicSet, ...subscriptionIdsRef.current.userSet]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subscriptionIdsRef.current.publicSet, subscriptionIdsRef.current.userSet]);
    
    return allSubscriptionIds;
} 