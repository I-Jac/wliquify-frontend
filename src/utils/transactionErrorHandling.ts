import { Program } from '@coral-xyz/anchor';
import { WLiquifyPool } from '@/programTarget/type/w_liquify_pool';
import { Connection } from '@solana/web3.js';
import i18next from 'i18next';

interface HandleTransactionErrorParams {
    error: unknown;
    program: Program<WLiquifyPool> | null;
    errorLogs?: string[] | null;
    connection?: Connection;
    txid?: string;
}

export async function handleTransactionError({ 
    error, 
    program, 
    errorLogs,
    connection,
    txid 
}: HandleTransactionErrorParams): Promise<string> {
    const t = i18next.t.bind(i18next);
    let errorMessage = t('notifications.unknownError');

    // If we have a connection and txid but no logs, try to fetch them
    if (connection && txid && !errorLogs) {
        try {
            const failedTx = await connection.getTransaction(txid, { maxSupportedTransactionVersion: 0 });
            errorLogs = failedTx?.meta?.logMessages || null;
            console.error('Failed Transaction Logs:', errorLogs);
        } catch (logError) {
            console.error('Could not fetch logs for failed transaction:', logError);
        }
    }

    // First try to get error message from program logs
    if (errorLogs) {
        console.error("Transaction Logs:", errorLogs);
        // Find the first error message in the logs, ignoring the expected "Required token info not found" message
        const errorLog = errorLogs.find(log => 
            log.startsWith('Program log: Error:') && 
            !log.includes('Required token info not found in oracle data')
        );
        if (errorLog) {
            const firstError = errorLog.replace('Program log: Error:', '').trim();
            if (firstError) {
                // Format stale price feed message to be more concise
                if (firstError.includes('Price feed') && firstError.includes('stale')) {
                    const symbolMatch = firstError.match(/for (?:symbol )?([A-Z]+)/);
                    const diffMatch = firstError.match(/Diff: (\d+)s/);
                    if (symbolMatch && diffMatch) {
                        return `Price feed for ${symbolMatch[1]} is stale (${diffMatch[1]}s > 900s)`;
                    }
                }
                return firstError;
            }
        }
    }

    if (error instanceof Error) {
        errorMessage = error.message;
        let customErrorCode: number | null = null;

        // Try to get error code from InstructionError array
        const txErrorMatch = errorMessage.match(/Transaction failed confirmation: (\{.*\})/);
        if (txErrorMatch && txErrorMatch[1]) {
            try {
                const errDetails = JSON.parse(txErrorMatch[1]);
                if (errDetails.InstructionError && Array.isArray(errDetails.InstructionError) && errDetails.InstructionError.length === 2) {
                    const customErrorDetail = errDetails.InstructionError[1];
                    if (customErrorDetail && typeof customErrorDetail.Custom === 'number') {
                        customErrorCode = customErrorDetail.Custom;
                    }
                }
            } catch (parseError) {
                console.warn("Failed to parse transaction error details from message:", parseError);
            }
        }

        // If no error code found in InstructionError, try to get it from logs
        if (customErrorCode === null && errorLogs) {
            const logErrorMatch = errorLogs.join('\n').match(/custom program error: 0x([0-9a-fA-F]+)/);
            if (logErrorMatch && logErrorMatch[1]) {
                customErrorCode = parseInt(logErrorMatch[1], 16);
            }
        }

        // If we have an error code, try to get message from program IDL
        if (customErrorCode !== null && program?.idl?.errors) {
            const programError = program.idl.errors.find(e => e.code === customErrorCode);
            if (programError && programError.msg) {
                errorMessage = programError.msg;
            } else {
                errorMessage = t('notifications.unknownProgramError', { code: customErrorCode });
            }
        }
    } else if (!errorLogs) {
        try {
            errorMessage = JSON.stringify(error);
        } catch { /* Ignore stringify errors */ }
    }

    // If we still have a generic error message, try to get something from logs
    if ((errorMessage === 'Unknown error' || errorMessage === 'Error' || !errorMessage) && errorLogs) {
        errorMessage = errorLogs.find(log => 
            log.toLowerCase().includes('error') && 
            !log.includes('Required token info not found in oracle data')
        ) || errorLogs[errorLogs.length - 1] || 'Transaction failed, see logs.';
    }

    if (!errorMessage) {
        errorMessage = 'An unknown error occurred during transaction.';
    }

    return errorMessage;
} 