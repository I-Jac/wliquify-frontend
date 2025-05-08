import { Connection } from '@solana/web3.js';
import { RATE_LIMIT_DELAY, MAX_RETRIES, MAX_DELAY } from './constants';

// Rate limiting state interface
export interface RateLimitState {
    lastRequestTime: number;
    retryCount: number;
    isRetrying: boolean;
}

// Sleep utility
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Rate limiting wrapper for RPC calls
export const createRateLimitedFetch = (connection: Connection) => {
    const rateLimitState: RateLimitState = {
        lastRequestTime: 0,
        retryCount: 0,
        isRetrying: false
    };

    return async <T>(
        fetchFn: () => Promise<T>,
        errorMessage: string
    ): Promise<T> => {
        const now = Date.now();
        
        // If we're already retrying, wait
        if (rateLimitState.isRetrying) {
            await sleep(RATE_LIMIT_DELAY);
        }

        // Calculate delay based on last request time
        const timeSinceLastRequest = now - rateLimitState.lastRequestTime;
        if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
            await sleep(RATE_LIMIT_DELAY - timeSinceLastRequest);
        }

        try {
            rateLimitState.lastRequestTime = Date.now();
            rateLimitState.isRetrying = false;
            rateLimitState.retryCount = 0;
            return await fetchFn();
        } catch (error) {
            if (error instanceof Error && error.message.includes('429') && rateLimitState.retryCount < MAX_RETRIES) {
                rateLimitState.retryCount++;
                rateLimitState.isRetrying = true;
                
                // Calculate exponential backoff delay
                const backoffDelay = Math.min(
                    RATE_LIMIT_DELAY * Math.pow(2, rateLimitState.retryCount - 1),
                    MAX_DELAY
                );
                
                console.log(`Rate limit hit. Retrying in ${backoffDelay}ms (attempt ${rateLimitState.retryCount}/${MAX_RETRIES})`);
                await sleep(backoffDelay);
                
                return createRateLimitedFetch(connection)(fetchFn, errorMessage);
            }
            throw error;
        }
    };
}; 