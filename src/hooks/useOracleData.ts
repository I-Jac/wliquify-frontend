import { useEffect, useState, useCallback } from 'react';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { AggregatedOracleDataDecoded } from '@/utils/core/types';
import { processOracleData } from '@/utils/app/oracleUtils';

interface UseOracleDataProps {
    connection: Connection | null;
    oracleAggregatorAddress: PublicKey | null;
}

/**
 * Hook to manage Oracle data fetching and state
 * @returns {Object} Object containing oracle data, error state, and refresh function
 */
export function useOracleData({ connection, oracleAggregatorAddress }: UseOracleDataProps) {
    const [oracleData, setOracleData] = useState<AggregatedOracleDataDecoded | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchAndSetOracleData = useCallback(async () => {
        if (!connection || !oracleAggregatorAddress || oracleAggregatorAddress.equals(SystemProgram.programId)) {
            console.warn("useOracleData: fetchAndSetOracleData skipped - connection or oracleAggregatorAddress not ready.");
            return;
        }

        try {
            const { decodedTokens, error: oracleError } = await processOracleData(connection, oracleAggregatorAddress);
            
            if (oracleError) {
                console.error(`useOracleData: ${oracleError}`);
                setError(oracleError);
                setOracleData(null);
                return;
            }

            const newOracleData: AggregatedOracleDataDecoded = {
                authority: oracleAggregatorAddress.toBase58(),
                totalTokens: decodedTokens.length,
                data: decodedTokens
            };

            setOracleData(newOracleData);
            setError(null);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("useOracleData: Error in fetchAndSetOracleData:", errorMessage);
            setError(errorMessage);
            
            setOracleData(prevOracleData => prevOracleData ? prevOracleData : null);
        }
    }, [connection, oracleAggregatorAddress]);

    // Initial fetch and subscription setup
    useEffect(() => {
        if (connection && oracleAggregatorAddress) {
            fetchAndSetOracleData();
        }
    }, [connection, oracleAggregatorAddress, fetchAndSetOracleData]);

    return {
        oracleData,
        error,
        refreshOracleData: fetchAndSetOracleData
    };
} 