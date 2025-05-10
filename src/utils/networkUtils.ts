import { Connection } from '@solana/web3.js';

export async function getRpcLatency(url: string): Promise<number | null> {
    try {
        const connection = new Connection(url, 'confirmed');
        const startTime = Date.now();
        await connection.getEpochInfo();
        const endTime = Date.now();
        const latency = endTime - startTime;
        return latency;
    } catch (error) {
        console.error(`[getRpcLatency] Ping failed for ${url}:`, error instanceof Error ? error.message : String(error));
        return null; 
    }
} 