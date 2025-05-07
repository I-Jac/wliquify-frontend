import { useEffect, useState, useCallback } from 'react';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { BN } from '@coral-xyz/anchor';
import { bytesToString } from '@/utils/oracle_state';
import { AggregatedOracleDataDecoded, ParsedOracleTokenInfo } from '@/utils/types';

interface UseOracleDataProps {
    connection: Connection | null;
    oracleAggregatorAddress: PublicKey | null;
}

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
                console.error(`useOracleData: Oracle Aggregator account (${oracleAggregatorAddress.toBase58()}) not found.`);
                setError(prevError => prevError ? `${prevError}, Oracle account not found` : "Oracle account not found");
                setOracleData(null);
                return;
            }

            const oracleDataBuffer = Buffer.from(oracleAccountInfo.data.slice(8));
            let offset = 0;
            const authorityPubkey = new PublicKey(oracleDataBuffer.subarray(offset, offset + 32)); offset += 32;
            const totalTokensInHeader = oracleDataBuffer.readUInt32LE(offset); offset += 4;
            const vecLen = oracleDataBuffer.readUInt32LE(offset); offset += 4;

            const tokenInfoSize = 10 + 8 + 64 + 64 + 8;

            const decodedTokens: ParsedOracleTokenInfo[] = [];
            for (let i = 0; i < vecLen; i++) {
                const start = offset;
                const end = start + tokenInfoSize;
                if (end > oracleDataBuffer.length) {
                    console.error(`useOracleData: Oracle buffer overflow reading token ${i + 1}.`);
                    setError(prevError => prevError ? `${prevError}, Oracle data buffer overflow` : "Oracle data buffer overflow");
                    setOracleData(prevData => ({
                        authority: prevData?.authority || authorityPubkey.toBase58(),
                        totalTokens: prevData?.totalTokens || totalTokensInHeader,
                        data: prevData?.data || [],
                    }));
                    return;
                }
                const tokenSlice = oracleDataBuffer.subarray(start, end);

                const symbol = bytesToString(tokenSlice.subarray(0, 10));
                const dominance = new BN(tokenSlice.subarray(10, 18), 'le').toString();
                const address = bytesToString(tokenSlice.subarray(18, 18 + 64));
                const priceFeedId = bytesToString(tokenSlice.subarray(18 + 64, 18 + 64 + 64));
                const timestamp = new BN(tokenSlice.subarray(18 + 64 + 64, end), 'le').toString();

                decodedTokens.push({ symbol, dominance, address, priceFeedId, timestamp });
                offset = end;
            }

            const newOracleData: AggregatedOracleDataDecoded = {
                authority: authorityPubkey.toBase58(),
                totalTokens: totalTokensInHeader,
                data: decodedTokens
            };
            setOracleData(newOracleData);
            setError(null);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("useOracleData: Error in fetchAndSetOracleData:", errorMessage);
            setError(prevError => prevError ? `${prevError}, Failed to refresh oracle data: ${errorMessage}` : `Failed to refresh oracle data: ${errorMessage}`);
        }
    }, [connection, oracleAggregatorAddress]);

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