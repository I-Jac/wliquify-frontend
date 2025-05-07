import { Program } from '@coral-xyz/anchor';

interface HandleTransactionErrorParams {
    error: unknown;
    program: Program | null;
    errorLogs?: string[] | null;
}

export function handleTransactionError({ error, program, errorLogs }: HandleTransactionErrorParams): string {
    let errorMessage = 'Unknown error';

    if (error instanceof Error) {
        errorMessage = error.message;
        let customErrorCode: number | null = null;

        // Attempt to parse "custom program error: 0x..." from logs or error message
        const logErrorMatch = errorLogs?.join('\n').match(/custom program error: 0x([0-9a-fA-F]+)/) || errorMessage.match(/custom program error: 0x([0-9a-fA-F]+)/);
        if (logErrorMatch && logErrorMatch[1]) {
            customErrorCode = parseInt(logErrorMatch[1], 16);
        } else {
            // Fallback to checking the JSON stringified error in the message
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
        }

        if (customErrorCode !== null && program && program.idl && program.idl.errors) {
            const programError = program.idl.errors.find(e => e.code === customErrorCode);
            if (programError && programError.msg) {
                errorMessage = programError.msg;
            } else {
                errorMessage = `An unknown program error occurred (Code: ${customErrorCode}).`;
            }
        }
    } else if (!errorLogs) {
        try {
            errorMessage = JSON.stringify(error);
        } catch { /* Ignore stringify errors */ }
    }

    if (errorLogs) {
        console.error("Transaction Logs (from error object):", errorLogs);
        if (errorMessage === 'Unknown error' || errorMessage === 'Error' || !errorMessage) {
            errorMessage = errorLogs.find(log => log.toLowerCase().includes('error')) || errorLogs[errorLogs.length - 1] || 'Transaction failed, see logs.';
        }
    }

    if (!errorMessage) {
        errorMessage = 'An unknown error occurred during transaction.';
    }

    return errorMessage;
} 