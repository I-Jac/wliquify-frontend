import { RATE_LIMIT_DELAY, MAX_RETRIES, MAX_DELAY, MAX_CONCURRENT_REQUESTS } from '../core/constants';

// Interface for queued request items
interface QueuedRequest<T> {
    fetchFn: () => Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
    errorMessage: string;
}

// Rate limiting state interface
interface RateLimitState {
    lastRequestTime: number;
    concurrentRequests: number;
    requestQueue: Array<QueuedRequest<unknown>>; // Use unknown for the generic queue
}

// Helper function to sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Creates a rate-limited fetch function.
 * @returns A function that wraps a fetch operation with rate limiting, queuing, and retries.
 */
export const createRateLimitedFetch = ()
    : (<T>(fetchFn: () => Promise<T>, errorMessage?: string) => Promise<T>) => {
    
    const rateLimitState: RateLimitState = {
        lastRequestTime: 0,
        concurrentRequests: 0,
        requestQueue: []
    };

    const executeCoreFetch = async <T>(
        fetchFn: () => Promise<T>,
        errorMessage: string
    ): Promise<T> => {
        let currentRetry = 0;
        while (true) { // Loop for retries
            const now = Date.now();
            const timeSinceLastRequest = now - rateLimitState.lastRequestTime;

            // For the first attempt of a request, ensure the delay since the *absolute* last request is respected.
            // For retries (currentRetry > 0), the sleep for backoff is handled before continuing the loop.
            if (currentRetry === 0 && timeSinceLastRequest < RATE_LIMIT_DELAY) {
                await sleep(RATE_LIMIT_DELAY - timeSinceLastRequest);
            }
            
            rateLimitState.lastRequestTime = Date.now(); // Update last request time *before* the call
            
            try {
                const result = await fetchFn();
                return result;
            } catch (error) {
                const isRateLimit = error instanceof Error &&
                    (error.message.includes('429') ||
                     error.message.includes('rate limit') ||
                     error.message.includes('too many requests'));

                if (isRateLimit && currentRetry < MAX_RETRIES) {
                    currentRetry++;
                    const jitter = Math.random() * (RATE_LIMIT_DELAY / 2); // Add jitter up to half of base delay
                    const backoffDelay = Math.min(
                        (RATE_LIMIT_DELAY * Math.pow(2, currentRetry -1)) + jitter,
                        MAX_DELAY
                    );
                    console.warn(`Rate limit hit for ${errorMessage}. Retrying in ${Math.round(backoffDelay)}ms (attempt ${currentRetry}/${MAX_RETRIES})`);
                    await sleep(backoffDelay);
                    // Continue to next iteration of the while loop for retry
                } else {
                    const finalErrorMessage = isRateLimit ? 
                        `Failed to fetch ${errorMessage} after ${currentRetry} retries due to rate limits.` :
                        `Failed to fetch ${errorMessage} with error: ${error instanceof Error ? error.message : String(error)}`;
                    console.error(finalErrorMessage, error);
                    throw error;
                }
            }
        }
    };
    
    const processNextInQueue = async () => {
        if (rateLimitState.requestQueue.length === 0 || rateLimitState.concurrentRequests >= MAX_CONCURRENT_REQUESTS) {
            return; // Nothing to process or no capacity
        }

        rateLimitState.concurrentRequests++;
        const task = rateLimitState.requestQueue.shift() as QueuedRequest<unknown>;

        try {
            // Type assertion needed here because the queue stores QueuedRequest<unknown>
            const result = await executeCoreFetch(task.fetchFn as () => Promise<unknown>, task.errorMessage);
            task.resolve(result);
        } catch (error) {
            task.reject(error);
        } finally {
            rateLimitState.concurrentRequests--;
            // After finishing a request (success or fail), always try to process the next one.
            processNextInQueue();
        }
    };

    // This is the main function exposed by createRateLimitedFetch
    const rateLimitedFetchExecutor = <T>(
        fetchFn: () => Promise<T>,
        errorMessage: string = "operation"
    ): Promise<T> => {
        return new Promise<T>((resolve, reject) => {
            const task: QueuedRequest<T> = { fetchFn, resolve, reject, errorMessage };
            // Add to queue, then try to process.
            rateLimitState.requestQueue.push(task as QueuedRequest<unknown>); 
            processNextInQueue();
        });
    };

    return rateLimitedFetchExecutor;
}; 