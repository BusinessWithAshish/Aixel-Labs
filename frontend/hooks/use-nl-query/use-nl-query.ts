'use client';

// ============================================================================
// USE NL QUERY - Main hook for natural language data queries
// ============================================================================

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { QueryCache } from './cache';
import { buildSystemPrompt } from './prompt-builder';
import { generateQueryResult, validateTransformFunction } from './query-execution';
import { executeTransformFunction } from './filter-executor';
import { hashData } from './utils';
import type { UseNLQueryConfig, UseNLQueryReturn } from './types';

/**
 * useNLQuery Hook
 *
 * A powerful hook that allows filtering and sorting any data structure using natural language queries.
 * The AI generates a single transform function that handles both sorting and filtering.
 *
 * Supports queries like:
 * - "find john" (filtering)
 * - "sort by score high to low" (sorting)
 * - "show tech companies ordered by revenue descending" (both)
 *
 * @example
 * ```tsx
 * const {
 *   filteredData,
 *   query,
 *   setQuery,
 *   executeSearch,
 *   isLoading,
 *   clear,
 *   reset,
 * } = useNLQuery({ data: leads });
 *
 * // In your component:
 * <input value={query} onChange={(e) => setQuery(e.target.value)} />
 * <button onClick={executeSearch}>Search</button>
 * <button onClick={reset}>Reset All</button>
 * ```
 */
export function useNLQuery<T>({
    data,
    enableCache = true,
    cacheTTL = 5 * 60 * 1000,
    debug = false,
}: UseNLQueryConfig<T>): UseNLQueryReturn<T> {
    // State
    const [query, setQueryState] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCached, setIsCached] = useState(false);
    const [explanation, setExplanation] = useState<string | null>(null);
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);
    const [activeTransformFunction, setActiveTransformFunction] = useState<string | null>(null);
    const [queryHistory, setQueryHistory] = useState<string[]>([]);

    // Refs
    const cacheRef = useRef(new QueryCache(cacheTTL));
    const abortControllerRef = useRef<AbortController | null>(null);

    // Optimized setQuery
    const setQuery = useCallback((newQuery: string) => {
        setQueryState(newQuery);
    }, []);

    // Memoize system prompt (only recalculate when data structure changes)
    const systemPrompt = useMemo(() => buildSystemPrompt(data), [data]);

    // Memoize data hash for cache key
    const dataHash = useMemo(() => hashData(data), [data]);

    // Execute search explicitly
    const executeSearch = useCallback(async () => {
        const trimmedQuery = query.trim();

        if (!trimmedQuery) {
            setError(null);
            setExplanation(null);
            setIsCached(false);
            setGeneratedCode(null);
            setActiveTransformFunction(null);
            return;
        }

        // Cancel previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        setIsLoading(true);
        setError(null);

        try {
            const cacheKey = cacheRef.current.getCacheKey(trimmedQuery, dataHash);

            // Check cache first
            if (enableCache) {
                const cached = cacheRef.current.get(cacheKey);

                if (cached) {
                    if (debug) {
                        console.log('[useNLQuery] Cache hit for query:', trimmedQuery);
                    }

                    // Validate cached function
                    const validation = validateTransformFunction(cached.transformFunction);
                    if (!validation.valid) {
                        if (debug) {
                            console.warn('[useNLQuery] Cached function failed validation:', validation.error);
                        }
                        setError(validation.error || 'Cached function was rejected for safety reasons.');
                        setGeneratedCode(null);
                        setActiveTransformFunction(null);
                        setIsCached(false);
                        setIsLoading(false);
                        return;
                    }

                    if (!abortController.signal.aborted) {
                        setExplanation(cached.explanation);
                        setGeneratedCode(cached.transformFunction);
                        setActiveTransformFunction(cached.transformFunction);
                        setIsCached(true);
                        setIsLoading(false);

                        // Add to history
                        setQueryHistory((prev) => {
                            const filtered = prev.filter((item) => item !== trimmedQuery);
                            return [trimmedQuery, ...filtered].slice(0, 10);
                        });
                    }
                    return;
                }
            }

            // Generate transform function using AI
            const result = await generateQueryResult(trimmedQuery, systemPrompt, debug);

            // Validate generated function
            const validation = validateTransformFunction(result.transformFunction);
            if (!validation.valid) {
                if (!abortController.signal.aborted) {
                    if (debug) {
                        console.warn('[useNLQuery] Generated function failed validation:', validation.error);
                    }
                    setError(validation.error || 'The generated function was rejected for safety reasons.');
                    setGeneratedCode(null);
                    setActiveTransformFunction(null);
                    setIsCached(false);
                    setIsLoading(false);
                }
                return;
            }

            if (abortController.signal.aborted) return;

            if (debug) {
                console.log('[useNLQuery] Generated transform function:', result.transformFunction);
            }

            // Cache the result
            if (enableCache) {
                cacheRef.current.set(cacheKey, {
                    transformFunction: result.transformFunction,
                    explanation: result.explanation,
                    timestamp: Date.now(),
                });
            }

            // Update state
            if (!abortController.signal.aborted) {
                setExplanation(result.explanation);
                setGeneratedCode(result.transformFunction);
                setActiveTransformFunction(result.transformFunction);
                setIsCached(false);

                // Add to history
                setQueryHistory((prev) => {
                    const filtered = prev.filter((item) => item !== trimmedQuery);
                    return [trimmedQuery, ...filtered].slice(0, 10);
                });
            }
        } catch (err) {
            if (!abortController.signal.aborted) {
                const errorMessage = err instanceof Error ? err.message : 'An error occurred';
                setError(errorMessage);
                setGeneratedCode(null);
                setActiveTransformFunction(null);
            }
        } finally {
            if (!abortController.signal.aborted) {
                setIsLoading(false);
            }
        }
    }, [query, systemPrompt, enableCache, dataHash, debug]);

    // Calculate transformed data
    const filteredData = useMemo(() => {
        if (!activeTransformFunction) {
            return data;
        }

        try {
            return executeTransformFunction(data, activeTransformFunction, debug);
        } catch (err) {
            console.error('[useNLQuery] Error executing transform:', err);
            return data;
        }
    }, [data, activeTransformFunction, debug]);

    // Clear function
    const clear = useCallback(() => {
        setQueryState('');
        setError(null);
        setExplanation(null);
        setIsCached(false);
        setGeneratedCode(null);
        setActiveTransformFunction(null);

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    // Reset function
    const reset = useCallback(() => {
        setQueryState('');
        setError(null);
        setExplanation(null);
        setIsCached(false);
        setGeneratedCode(null);
        setActiveTransformFunction(null);
        setIsLoading(false);
        setQueryHistory([]);

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        if (debug) {
            console.log('[useNLQuery] Complete reset - returning to original data');
        }
    }, [debug]);

    // Clear cache function
    const clearCache = useCallback(() => {
        cacheRef.current.clear();
        if (debug) {
            console.log('[useNLQuery] Cache cleared');
        }
    }, [debug]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    return {
        filteredData,
        query,
        setQuery,
        isLoading,
        error,
        clear,
        reset,
        isCached,
        explanation,
        clearCache,
        generatedCode,
        executeSearch,
        queryHistory,
    };
}
