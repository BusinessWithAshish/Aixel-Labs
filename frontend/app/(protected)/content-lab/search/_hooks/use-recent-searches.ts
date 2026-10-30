'use client';

import { useSyncExternalStore } from 'react';
import { generateLocalStorageKey } from '@/helpers/generate-local-storage-key';
import { CONTENT_LAB_PLATFORM_FILTERS, type ContentLabPlatformFilter } from '../../_constants';
import type { RecentSearch } from '../_utils/smart-box';

const RECENT_MAX = 8;

/**
 * A value kept in localStorage that every component reading it sees change at once (and other tabs, via
 * `storage`). Reads are cached on the raw string so `useSyncExternalStore` gets a stable snapshot; storage
 * that throws (private mode, blocked) reads as `fallback` and drops writes.
 */
function createLocalStore<T>(key: string, parse: (raw: unknown) => T | null, fallback: T) {
    const listeners = new Set<() => void>();
    let cache: { raw: string | null; value: T } = { raw: null, value: fallback };

    const read = (): T => {
        let raw: string | null;
        try {
            raw = window.localStorage.getItem(key);
        } catch {
            return fallback;
        }
        if (raw === cache.raw) return cache.value;
        let value = fallback;
        try {
            value = (raw ? parse(JSON.parse(raw)) : null) ?? fallback;
        } catch {
            /* a broken entry reads as empty */
        }
        cache = { raw, value };
        return value;
    };

    const write = (value: T) => {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            /* not kept, but this page still updates */
            cache = { raw: cache.raw, value };
        }
        listeners.forEach((listener) => listener());
    };

    const subscribe = (listener: () => void) => {
        listeners.add(listener);
        const onStorage = (event: StorageEvent) => event.key === key && listener();
        window.addEventListener('storage', onStorage);
        return () => {
            listeners.delete(listener);
            window.removeEventListener('storage', onStorage);
        };
    };

    return { read, write, subscribe, server: () => fallback };
}

const NO_RECENT: RecentSearch[] = [];
const isRecent = (item: unknown): item is RecentSearch =>
    !!item && typeof item === 'object' && typeof (item as RecentSearch).href === 'string' && typeof (item as RecentSearch).text === 'string';

const recentStore = createLocalStore<RecentSearch[]>(
    generateLocalStorageKey('content-lab', 'recent-searches'),
    (raw) => (Array.isArray(raw) ? raw.filter(isRecent).slice(0, RECENT_MAX) : null),
    NO_RECENT,
);

const platformStore = createLocalStore<ContentLabPlatformFilter>(
    generateLocalStorageKey('content-lab', 'search-platform'),
    (raw) => CONTENT_LAB_PLATFORM_FILTERS.find((filter) => filter.value === raw)?.value ?? null,
    'both',
);

/** Puts a search first in "Recent searches" (once: running it again moves it up). */
export function addRecentSearch(entry: RecentSearch | null) {
    if (!entry) return;
    recentStore.write([entry, ...recentStore.read().filter((item) => item.href !== entry.href)].slice(0, RECENT_MAX));
}

/** The last searches run on this device, newest first; shared by the search box and the chips under it. */
export function useRecentSearches() {
    const recent = useSyncExternalStore(recentStore.subscribe, recentStore.read, recentStore.server);
    return {
        recent,
        add: addRecentSearch,
        remove: (href: string) => recentStore.write(recentStore.read().filter((item) => item.href !== href)),
        clear: () => recentStore.write(NO_RECENT),
    };
}

/** The platforms a new search starts on, remembered on this device (All until picked). */
export function useSearchPlatform() {
    const platform = useSyncExternalStore(platformStore.subscribe, platformStore.read, platformStore.server);
    return [platform, platformStore.write] as const;
}

export type UseRecentSearchesReturn = ReturnType<typeof useRecentSearches>;
