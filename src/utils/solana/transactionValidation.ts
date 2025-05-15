import {
    Connection,
    PublicKey,
    SystemProgram,
    LAMPORTS_PER_SOL,
    Transaction,
    VersionedTransaction
} from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import toast from "react-hot-toast";
import i18next from 'i18next';

import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool';
import { PoolConfig } from '@/utils/core/types';
import { MIN_SOL_BALANCE_LAMPORTS } from '@/utils/core/constants';

const t = i18next.t.bind(i18next);

export const checkSolBalance = async (
    connection: Connection,
    publicKey: PublicKey,
    minSolBalanceLamports: number = MIN_SOL_BALANCE_LAMPORTS
): Promise<boolean> => {
    try {
        const balance = await connection.getBalance(publicKey);
        if (balance < minSolBalanceLamports) {
            toast.error(t('poolInteractions.insufficientSol', { amount: minSolBalanceLamports / LAMPORTS_PER_SOL }));
            console.error(`Insufficient SOL balance: ${balance} lamports. Need ${minSolBalanceLamports} lamports.`);
            return false;
        }
        return true;
    } catch (balanceError) {
        toast.error(t('poolInteractions.couldNotVerifySol'));
        console.error('Failed to fetch SOL balance:', balanceError);
        return false;
    }
};

export const validatePriceFeed = (
    tokenInfo: { mint: PublicKey; priceFeed: PublicKey } | undefined,
    mint: PublicKey,
    toastId: string,
    action: 'Deposit' | 'Withdrawal'
): boolean => {
    if (!tokenInfo || !tokenInfo.priceFeed || tokenInfo.priceFeed.equals(SystemProgram.programId)) {
        const errorMsg = t('poolInteractions.priceFeedNotFound', { action, mint: mint.toBase58() });
        console.error(errorMsg);
        toast.error(errorMsg, { id: toastId });
        return false;
    }
    return true;
};

export const validatePreFlightChecks = (
    program: Program<WLiquifyPool> | null,
    publicKey: PublicKey | null,
    poolConfig: PoolConfig | null,
    poolConfigPda: PublicKey | null,
    oracleData: { data: { address: string; priceFeedId: string }[] } | null,
    amountString?: string,
    isFullDelistedWithdraw: boolean = false
): { isValid: boolean; poolConfig: PoolConfig | null } => {
    if (!program || !publicKey || !poolConfig || !poolConfigPda || !oracleData) {
        toast.error(t('poolInteractions.programWalletPoolConfigMissing'));
        console.error('Prerequisites not met:', { program:!!program, publicKey:!!publicKey, poolConfig:!!poolConfig, poolConfigPda:!!poolConfigPda });
        return { isValid: false, poolConfig: null };
    }

    if (!isFullDelistedWithdraw && (!amountString || parseFloat(amountString) <= 0)) {
        alert(t('poolInteractions.enterValidAmount'));
        return { isValid: false, poolConfig: null };
    }

    return { isValid: true, poolConfig };
};

export const validateSignTransaction = (signTransaction: ((transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>) | undefined): boolean => {
    if (!signTransaction) {
        alert(t('poolInteractions.walletNoSign'));
        console.error('Wallet adapter does not provide signTransaction method.');
        return false;
    }
    return true;
}; 