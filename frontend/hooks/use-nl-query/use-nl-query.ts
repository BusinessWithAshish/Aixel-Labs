'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { QueryCache } from './cache';
import { hashData } from './utils';
import type { UseNLQueryConfig, UseNLQueryReturn } from './types';

const NL_QUERY_API = '/api/nl-query';
const MAX_HISTORY = 10;

function pushHistory(prev: string[], query: string): string[] {
    const filtered = prev.filter((q) => q !== query);
    return [query, ...filtered].slice(0, MAX_HISTORY);
}

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
    const [resultData, setResultData] = useState<T[] | null>(null);
    const [queryHistory, setQueryHistory] = useState<string[]>([]);

    // Refs
    const cacheRef = useRef(new QueryCache(cacheTTL));
    const abortControllerRef = useRef<AbortController | null>(null);

    const dataHash = useMemo(() => hashData(data), [data]);
    const setQuery = useCallback((newQuery: string) => setQueryState(newQuery), []);

    /** Single place to clear the result state (no transform/explanation/code – API returns only data) */
    const resetResult = useCallback(() => {
        setError(null);
        setIsCached(false);
        setResultData(null);
    }, []);

    const applySuccess = useCallback((filteredData: T[], fromCache: boolean, trimmedQuery: string) => {
        setResultData(filteredData);
        setIsCached(fromCache);
        setQueryHistory((prev) => pushHistory(prev, trimmedQuery));
    }, []);

    const executeSearch = useCallback(async () => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            resetResult();
            return;
        }

        if (abortControllerRef.current) abortControllerRef.current.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setIsLoading(true);
        setError(null);
        const cacheKey = cacheRef.current.getCacheKey(trimmedQuery, dataHash);

        try {
            if (enableCache) {
                const cached = cacheRef.current.get(cacheKey);
                if (cached) {
                    if (debug) console.log('[useNLQuery] Cache hit:', trimmedQuery);
                    if (!controller.signal.aborted) applySuccess(cached.filteredData as T[], true, trimmedQuery);
                    setIsLoading(false);
                    return;
                }
            }

            const res = await fetch(NL_QUERY_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: trimmedQuery, data, debug }),
                signal: controller.signal,
            });

            if (!res.ok) {
                let msg = 'Failed to generate query. Please try again.';
                try {
                    const body = (await res.json()) as { error?: string };
                    if (body?.error) msg = body.error;
                } catch {
                    /* use default */
                }
                throw new Error(msg);
            }

            const filteredData = (await res.json()) as T[];
            if (controller.signal.aborted) return;

            if (enableCache) {
                cacheRef.current.set(cacheKey, { filteredData, timestamp: Date.now() });
            }

            if (!controller.signal.aborted) applySuccess(filteredData, false, trimmedQuery);
            if (debug) console.log('[useNLQuery] Result applied');
        } catch (err) {
            if (!controller.signal.aborted) {
                resetResult();
                setError(err instanceof Error ? err.message : 'An error occurred');
            }
        } finally {
            if (!controller.signal.aborted) setIsLoading(false);
        }
    }, [query, enableCache, dataHash, debug, data, resetResult, applySuccess]);

    const filteredData = useMemo(() => resultData ?? data, [data, resultData]);

    const clear = useCallback(() => {
        setQueryState('');
        resetResult();
        abortControllerRef.current?.abort();
    }, [resetResult]);

    const reset = useCallback(() => {
        setQueryState('');
        setQueryHistory([]);
        setIsLoading(false);
        resetResult();
        abortControllerRef.current?.abort();
        if (debug) console.log('[useNLQuery] Reset');
    }, [debug, resetResult]);

    const clearCache = useCallback(() => {
        cacheRef.current.clear();
        if (debug)
            console.log('[useNLQuery] Cache cleared');
    }, [debug]);

    useEffect(() => () => abortControllerRef.current?.abort(), []);

    return {
        filteredData,
        query,
        setQuery,
        isLoading,
        error,
        clear,
        reset,
        isCached,
        clearCache,
        executeSearch,
        queryHistory,
    };
}
