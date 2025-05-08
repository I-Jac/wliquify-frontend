import { useEffect, useState, useCallback } from 'react';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { AggregatedOracleDataDecoded, ParsedOracleTokenInfo } from '@/utils/types';
import { parseOracleData } from '@/utils/oracle_state';

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
            const oracleAccountInfo = await connection.getAccountInfo(oracleAggregatorAddress);
            if (!oracleAccountInfo) {
                const errorMsg = `Oracle account (${oracleAggregatorAddress.toBase58()}) not found`;
                console.error(`useOracleData: ${errorMsg}`);
                setError(errorMsg);
                setOracleData(null);
                return;
            }

            // Use the parseOracleData function from oracle_state.ts
            const parsedData = parseOracleData(Buffer.from(oracleAccountInfo.data));
            
            // Convert the parsed data to the expected format
            const decodedTokens: ParsedOracleTokenInfo[] = parsedData.data.map(token => ({
                symbol: token.symbol.map(b => String.fromCharCode(b)).join('').replace(/\0/g, ''),
                dominance: token.dominance.toString(),
                address: token.address.map(b => String.fromCharCode(b)).join('').replace(/\0/g, ''),
                priceFeedId: token.priceFeedId.map(b => String.fromCharCode(b)).join('').replace(/\0/g, ''),
                timestamp: token.timestamp.toString()
            }));

            const newOracleData: AggregatedOracleDataDecoded = {
                authority: parsedData.authority.toBase58(),
                totalTokens: parsedData.totalTokens,
                data: decodedTokens
            };

            setOracleData(newOracleData);
            setError(null);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("useOracleData: Error in fetchAndSetOracleData:", errorMessage);
            setError(errorMessage);
            
            // Only clear oracle data if we don't have any
            if (!oracleData) {
                setOracleData(null);
            }
        }
    }, [connection, oracleAggregatorAddress, oracleData]);

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