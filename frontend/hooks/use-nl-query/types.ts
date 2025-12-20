// ============================================================================
// TYPES - Type definitions for the NL Query system
// ============================================================================

/**
 * Query result type - contains the transform function and explanation
 */
export type QueryResult = {
    /** Transform function code that sorts and filters data */
    transformFunction: string;
    /** Explanation of the operations */
    explanation: string;
};

/**
 * Configuration for the useNLQuery hook
 */
export type UseNLQueryConfig<T> = {
    /** The data to filter */
    data: T[];
    /** Enable caching of AI responses (default: true) */
    enableCache?: boolean;
    /** Cache TTL in milliseconds (default: 5 minutes) */
    cacheTTL?: number;
    /** Enable debug logging */
    debug?: boolean;
};

/**
 * Return type of the useNLQuery hook
 */
export type UseNLQueryReturn<T> = {
    /** The filtered/sorted data based on the NL query */
    filteredData: T[];
    /** The current natural language query (instant, no debounce) */
    query: string;
    /** Set the natural language query (instant, no debounce) */
    setQuery: (query: string) => void;
    /** Whether the AI is currently processing */
    isLoading: boolean;
    /** Error message if any */
    error: string | null;
    /** Clear the current query and reset to original data */
    clear: () => void;
    /** Reset all state and return to original unfiltered data */
    reset: () => void;
    /** Whether the result came from cache */
    isCached: boolean;
    /** Explanation of how the data was processed */
    explanation: string | null;
    /** Clear the cache */
    clearCache: () => void;
    /** The generated transform function code (for debugging) */
    generatedCode: string | null;
    /** Execute search explicitly - call this to trigger AI query */
    executeSearch: () => Promise<void>;
    /** Query history (last 10 queries) */
    queryHistory: string[];
};

/**
 * Cache entry structure
 */
export type CacheEntry = {
    transformFunction: string;
    explanation: string;
    timestamp: number;
};

/**
 * Validation result type
 */
export type ValidationResult = {
    valid: boolean;
    error?: string;
};
