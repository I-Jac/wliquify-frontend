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
            // console.log("usePoolSubscriptions: Skipping public subscriptions (missing connection/config)");
            return; // Exit if essential data isn't ready
        }
        console.log("usePoolSubscriptions: Setting up PoolConfig/Oracle/Vault subscriptions...");
        const subscriptions: number[] = [];

        // Subscribe to PoolConfig changes
        try {
            const poolConfigSub = connection.onAccountChange(
                poolConfigPda,
                () => {
                    console.log('PoolConfig account changed, triggering public refresh...');
                    refreshPublicData();
                },
                'confirmed'
            );
            subscriptions.push(poolConfigSub);
        } catch (e) {
             console.error(
                `Failed to subscribe to PoolConfig ${poolConfigPda.toString()}:`,
                e
             );
        }

        // Subscribe to Oracle Aggregator changes
        if (poolConfig.oracleAggregatorAccount && !poolConfig.oracleAggregatorAccount.equals(SystemProgram.programId)) {
             try {
                const oracleSub = connection.onAccountChange(
                    poolConfig.oracleAggregatorAccount,
                    async () => {
                        console.log('Oracle account changed, triggering public refresh...');
                        refreshPublicData();
                    },
                    'confirmed'
                );
                subscriptions.push(oracleSub);
             } catch (e) {
                 console.error(
                    `Failed to subscribe to Oracle ${poolConfig.oracleAggregatorAccount.toString()}:`,
                    e
                 );
             }
        } else {
            // console.log("usePoolSubscriptions: Skipping Oracle WS subscription - address not found or system program.");
        }

        // Subscribe to Vault balance changes
        poolConfig.supportedTokens.forEach((token: SupportedToken) => {
            if (token && token.vault && token.mint) {
                const nonNullVault = token.vault;
                try {
                    const vaultSub = connection.onAccountChange(
                        nonNullVault,
                        () => {
                            console.log(
                                `Vault ${nonNullVault.toString()} (${token.mint?.toBase58()}) changed, triggering public refresh...`
                            );
                            refreshPublicData();
                        },
                        'confirmed'
                    );
                    subscriptions.push(vaultSub);
                } catch (e) {
                    console.error(
                        `Failed to subscribe to vault ${nonNullVault.toString()}:`,
                        e
                    );
                }
            } 
            // else {
            //     console.warn("usePoolSubscriptions: Skipping Vault WS subscription for token with missing mint or vault.");
            // }
        });

        // Return cleanup function
        return () => {
            console.log('usePoolSubscriptions: Cleaning up PoolConfig/Oracle/Vault subscriptions...');
            subscriptions.forEach((subId) => {
                connection.removeAccountChangeListener(subId)
                    .catch(err => console.error(`WS Cleanup Error (Public): Error unsubscribing ID ${subId}:`, err));
            });
        };

    }, [connection, poolConfig, poolConfigPda, refreshPublicData]); // Dependencies for public subscriptions

    // --- User Account Subscriptions ---
    useEffect(() => {
        if (!connection || !publicKey || !poolConfig || !poolConfig.wliMint) {
            // console.log("usePoolSubscriptions: Skipping user subscriptions (missing connection/publicKey/config)");
            return;
        }
        console.log("usePoolSubscriptions: Setting up account subscriptions for user:", publicKey.toBase58());
        const subscriptionIds: number[] = [];

        // Generic handler to trigger user data refresh
        const handleAccountUpdate = (context: { slot: number }, mintAddress: string) => {
            console.log(`usePoolSubscriptions: Account ${mintAddress} updated, triggering user data refresh.`);
            refreshUserData();
        };

        // Subscribe to user's wLQI ATA
        try {
            const userWlqiAta = getAssociatedTokenAddressSync(poolConfig.wliMint, publicKey);
            const wLqiSubId = connection.onAccountChange(
                userWlqiAta,
                (_accountInfo, context) => handleAccountUpdate(context, poolConfig.wliMint.toBase58()),
                'confirmed'
            );
            subscriptionIds.push(wLqiSubId);
        } catch (error) {
            console.error(`usePoolSubscriptions: Failed to get ATA or subscribe for wLQI (${poolConfig.wliMint?.toBase58()}):`, error);
        }

        // Subscribe to user's other supported token ATAs
        poolConfig.supportedTokens.forEach((token: SupportedToken) => {
            if (token.mint && !token.mint.equals(poolConfig.wliMint)) { // Exclude wLQI
                try {
                    const nonNullMintKey = token.mint;
                    const userAta = getAssociatedTokenAddressSync(nonNullMintKey, publicKey);
                    const subId = connection.onAccountChange(
                        userAta,
                        (_accountInfo, context) => handleAccountUpdate(context, nonNullMintKey.toBase58()),
                        'confirmed'
                    );
                    subscriptionIds.push(subId);
                } catch (error) {
                    console.error(`usePoolSubscriptions: Failed to get ATA or subscribe for token ${token.mint?.toBase58()}:`, error);
                }
            }
        });

        // Return cleanup function
        return () => {
            console.log("usePoolSubscriptions: Cleaning up user account subscriptions...");
            subscriptionIds.forEach(id => {
                connection.removeAccountChangeListener(id)
                    .catch(err => console.error(`WS Cleanup Error (User): Error unsubscribing ID ${id}:`, err));
            });
        };
    }, [connection, publicKey, poolConfig, refreshUserData]); // Dependencies for user subscriptions

    // This hook doesn't return anything, it just sets up listeners
} 