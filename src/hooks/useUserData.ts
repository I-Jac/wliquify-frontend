'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { decodeTokenAccountAmountBN } from '@/utils/solana/accounts';
import { SupportedToken } from '@/utils/core/types';
import { RateLimitedFetchFn } from '@/utils/app/poolDataUtils';

interface UseUserDataProps {
    connection: Connection | null;
    userPublicKey: PublicKey | null;
    poolConfigForUserBalances: {
        wliMint: PublicKey;
        supportedTokens: SupportedToken[];
    } | null;
    rateLimitedFetch: RateLimitedFetchFn | null;
    enabled?: boolean;
}

interface UserDataReturnType {
    userWlqiBalance: BN | null;
    setUserWlqiBalance: React.Dispatch<React.SetStateAction<BN | null>>;
    userTokenBalances: Map<string, BN | null>;
    setUserTokenBalances: React.Dispatch<React.SetStateAction<Map<string, BN | null>>>;
    isLoadingUserData: boolean;
    userDataError: string | null;
    refreshUserData: () => Promise<void>;
}

export function useUserData({
    connection,
    userPublicKey,
    poolConfigForUserBalances,
    rateLimitedFetch,
    enabled = true,
}: UseUserDataProps): UserDataReturnType {
    const [userWlqiBalance, setUserWlqiBalance] = useState<BN | null>(null);
    const [userTokenBalances, setUserTokenBalances] = useState<Map<string, BN | null>>(new Map());
    const [isLoadingUserData, setIsLoadingUserData] = useState(false);
    const [userDataError, setUserDataError] = useState<string | null>(null);
    const hasFetchedOnce = useRef(false);
    const prevPoolConfigRef = useRef(poolConfigForUserBalances);

    const fetchBalancesAndSetState = useCallback(async () => {
        if (!enabled || !connection || !userPublicKey || !poolConfigForUserBalances || !rateLimitedFetch) {
            if (!userPublicKey || !enabled) {
                setUserWlqiBalance(null);
                setUserTokenBalances(new Map());
                hasFetchedOnce.current = false;
            }
            return;
        }

        setIsLoadingUserData(true);
        setUserDataError(null);

        const { wliMint: currentWlqiMint, supportedTokens: currentSupportedTokens } = poolConfigForUserBalances;
        const userAtasToFetchDetails: { ata: PublicKey; mint: PublicKey; isWlqi: boolean }[] = [];
        const batchErrorAccumulator: string[] = [];

        try {
            // Add wLQI ATA details
            try {
                const userWlqiAta = getAssociatedTokenAddressSync(currentWlqiMint, userPublicKey, true);
                userAtasToFetchDetails.push({ ata: userWlqiAta, mint: currentWlqiMint, isWlqi: true });
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                batchErrorAccumulator.push("wLQI ATA derivation failed: " + errorMsg);
            }

            // Add other supported token ATAs details
            currentSupportedTokens.forEach(token => {
                if (token.mint && !token.mint.equals(currentWlqiMint)) {
                    try {
                        const userAta = getAssociatedTokenAddressSync(token.mint, userPublicKey, true);
                        userAtasToFetchDetails.push({ ata: userAta, mint: token.mint, isWlqi: false });
                    } catch (e) {
                        const errorMsg = e instanceof Error ? e.message : String(e);
                        batchErrorAccumulator.push("ATA derivation failed for " + token.mint.toBase58() + ": " + errorMsg);
                    }
                }
            });

            const publicKeysToFetch = userAtasToFetchDetails.map(detail => detail.ata);
            let allUserAccountsInfo: (import('@solana/web3.js').AccountInfo<Buffer> | null)[] = [];

            if (publicKeysToFetch.length > 0) {
                const ACCOUNTS_BATCH_SIZE = 99;
                const userAccountBatchPromises = [];
                for (let i = 0; i < publicKeysToFetch.length; i += ACCOUNTS_BATCH_SIZE) {
                    const batch = publicKeysToFetch.slice(i, i + ACCOUNTS_BATCH_SIZE);
                    if (batch.length > 0) {
                        userAccountBatchPromises.push(
                            rateLimitedFetch(
                                () => connection.getMultipleAccountsInfo(batch),
                                "Failed to fetch batch of user accounts" // Simplified message
                            ).catch(err => {
                                const errorMsg = err instanceof Error ? err.message : String(err);
                                batchErrorAccumulator.push("Batch fetch failed: " + errorMsg);
                                return null;
                            })
                        );
                    }
                }
                const resultsFromUserBatches = await Promise.all(userAccountBatchPromises);
                resultsFromUserBatches.forEach(batchResult => {
                    if (batchResult) {
                        allUserAccountsInfo = allUserAccountsInfo.concat(batchResult);
                    }
                });
            }

            const newBalances = new Map<string, BN | null>();
            let newWlqiBalance: BN | null = new BN(0); // Default to 0 if not found or error

            userAtasToFetchDetails.forEach((detail, index) => {
                // Ensure allUserAccountsInfo has an entry for this index
                const accInfo = index < allUserAccountsInfo.length ? allUserAccountsInfo[index] : null;
                const balance = accInfo ? decodeTokenAccountAmountBN(accInfo.data) : new BN(0);
                if (detail.isWlqi) {
                    newWlqiBalance = balance;
                } else {
                    newBalances.set(detail.mint.toBase58(), balance);
                }
            });

            setUserWlqiBalance(newWlqiBalance);
            setUserTokenBalances(newBalances);

            if (batchErrorAccumulator.length > 0) {
                setUserDataError(batchErrorAccumulator.join('; '));
            }
            hasFetchedOnce.current = true;

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("useUserData Main Error:", errorMessage);
            if (batchErrorAccumulator.length > 0) {
                console.error("Partial Errors:", batchErrorAccumulator.join('; '));
            }
            setUserDataError("Failed to load user account balances. Check console for details.");
        } finally {
            setIsLoadingUserData(false);
        }
    }, [connection, userPublicKey, poolConfigForUserBalances, rateLimitedFetch, enabled]);

    useEffect(() => {
        // Initialize prevPoolConfigRef correctly on first render if poolConfigForUserBalances is already available
        if (prevPoolConfigRef.current === undefined && poolConfigForUserBalances !== null) {
            prevPoolConfigRef.current = poolConfigForUserBalances;
        }
    
        const configChanged = JSON.stringify(poolConfigForUserBalances) !== JSON.stringify(prevPoolConfigRef.current);

        if (enabled && userPublicKey && poolConfigForUserBalances && rateLimitedFetch && !isLoadingUserData) {
            if (!hasFetchedOnce.current || configChanged) {
                 fetchBalancesAndSetState();
            }
        } else if ((!userPublicKey || !enabled) && hasFetchedOnce.current) {
            setUserWlqiBalance(null);
            setUserTokenBalances(new Map());
            setUserDataError(null);
            setIsLoadingUserData(false);
            hasFetchedOnce.current = false;
        }
        
        if (poolConfigForUserBalances !== null) {
             prevPoolConfigRef.current = poolConfigForUserBalances;
        } else if (userPublicKey === null || !enabled) {
            prevPoolConfigRef.current = null;
        }

    }, [enabled, userPublicKey, poolConfigForUserBalances, rateLimitedFetch, fetchBalancesAndSetState, isLoadingUserData]);

    return {
        userWlqiBalance,
        setUserWlqiBalance,
        userTokenBalances,
        setUserTokenBalances,
        isLoadingUserData,
        userDataError,
        refreshUserData: fetchBalancesAndSetState,
    };
}