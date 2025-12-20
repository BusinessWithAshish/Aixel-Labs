// ============================================================================
// CACHE - Query cache management
// ============================================================================

import type { CacheEntry } from './types';

/**
 * QueryCache class for caching AI-generated query results
 */
export class QueryCache {
    private cache = new Map<string, CacheEntry>();
    private ttl: number;

    constructor(ttl: number = 5 * 60 * 1000) {
        this.ttl = ttl;
    }

    /**
     * Get a cached entry by key
     */
    get(key: string): CacheEntry | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry;
    }

    /**
     * Set a cache entry
     */
    set(key: string, value: CacheEntry): void {
        // Limit cache size to 50 entries
        if (this.cache.size >= 50) {
            const oldestKey = Array.from(this.cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
            this.cache.delete(oldestKey);
        }

        this.cache.set(key, value);
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Generate a cache key from query and data hash
     */
    getCacheKey(query: string, dataHash: string): string {
        return `${dataHash}:${query.toLowerCase().trim()}`;
    }

    /**
     * Get the current cache size
     */
    get size(): number {
        return this.cache.size;
    }
}
