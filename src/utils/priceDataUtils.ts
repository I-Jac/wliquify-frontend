import { AccountInfo } from '@solana/web3.js';
import { DecodedPriceData } from '@/utils/types';
import { decodePriceData } from '@/utils/calculations';

interface PriceDataCache {
    data: DecodedPriceData;
    timestamp: number;
}

class PriceDataCacheManager {
    private cache: Map<string, PriceDataCache> = new Map();
    private readonly cacheWindow: number = 5000; // 5 seconds
    private readonly cleanupWindow: number = 30000; // 30 seconds

    getDecodedPriceData(priceFeedInfo: AccountInfo<Buffer> | null): DecodedPriceData | null {
        if (!priceFeedInfo) return null;

        const cacheKey = priceFeedInfo.data.toString('hex');
        const cached = this.cache.get(cacheKey);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < this.cacheWindow) {
            return cached.data;
        }

        const decoded = decodePriceData(priceFeedInfo);
        if (decoded) {
            this.cache.set(cacheKey, {
                data: decoded,
                timestamp: now
            });

            this.cleanupOldEntries(now);
        }

        return decoded;
    }

    private cleanupOldEntries(now: number): void {
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.cleanupWindow) {
                this.cache.delete(key);
            }
        }
    }
}

export const priceDataCacheManager = new PriceDataCacheManager(); 