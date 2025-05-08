import { Connection } from '@solana/web3.js';
import { RATE_LIMIT_DELAY, MAX_RETRIES, MAX_DELAY, MAX_CONCURRENT_REQUESTS } from './constants';

// Rate limiting state interface
export interface RateLimitState {
    lastRequestTime: number;
    retryCount: number;
    isRetrying: boolean;
    concurrentRequests: number;
    requestQueue: Array<() => Promise<void>>;
}

// Helper function to sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Rate limiting wrapper for RPC calls
export const createRateLimitedFetch = (connection: Connection) => {
    const rateLimitState: RateLimitState = {
        lastRequestTime: 0,
        retryCount: 0,
        isRetrying: false,
        concurrentRequests: 0,
        requestQueue: []
    };

    const processQueue = async () => {
        while (rateLimitState.requestQueue.length > 0 && rateLimitState.concurrentRequests < MAX_CONCURRENT_REQUESTS) {
            const nextRequest = rateLimitState.requestQueue.shift();
            if (nextRequest) {
                rateLimitState.concurrentRequests++;
                nextRequest().finally(() => {
                    rateLimitState.concurrentRequests--;
                    processQueue();
                });
            }
        }
    };

    return async <T>(
        fetchFn: () => Promise<T>,
        errorMessage: string
    ): Promise<T> => {
        const now = Date.now();
        
        // If we're at max concurrent requests, queue this request
        if (rateLimitState.concurrentRequests >= MAX_CONCURRENT_REQUESTS) {
            return new Promise((resolve, reject) => {
                rateLimitState.requestQueue.push(async () => {
                    try {
                        const result = await createRateLimitedFetch(connection)(fetchFn, errorMessage);
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        }

        // Only wait if we've made a request very recently
        const timeSinceLastRequest = now - rateLimitState.lastRequestTime;
        if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
            await sleep(RATE_LIMIT_DELAY - timeSinceLastRequest);
        }

        try {
            rateLimitState.lastRequestTime = Date.now();
            rateLimitState.isRetrying = false;
            rateLimitState.retryCount = 0;
            rateLimitState.concurrentRequests++;
            return await fetchFn();
        } catch (error) {
            rateLimitState.concurrentRequests--;
            
            // Check if it's a rate limit error
            const isRateLimit = error instanceof Error && 
                (error.message.includes('429') || 
                 error.message.includes('rate limit') || 
                 error.message.includes('too many requests'));

            if (isRateLimit && rateLimitState.retryCount < MAX_RETRIES) {
                rateLimitState.retryCount++;
                rateLimitState.isRetrying = true;
                
                // Simple linear backoff
                const backoffDelay = Math.min(RATE_LIMIT_DELAY * 2 * (rateLimitState.retryCount + 1), MAX_DELAY);
                
                console.log(`Rate limit hit. Retrying in ${Math.round(backoffDelay)}ms (attempt ${rateLimitState.retryCount}/${MAX_RETRIES})`);
                await sleep(backoffDelay);
                
                return createRateLimitedFetch(connection)(fetchFn, errorMessage);
            }
            
            throw error;
        } finally {
            rateLimitState.concurrentRequests--;
            processQueue();
        }
    };
}; 