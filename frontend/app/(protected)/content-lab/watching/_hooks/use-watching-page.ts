'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import type { ContentLabWatch } from '@aixellabs/backend/db/types';
import { addContentLabWatch, removeContentLabWatch } from '@/app/actions/content-lab-actions';
import { contentLabApi } from '@/helpers/content-lab-api';
import { useCreatorSuggest } from '../../_hooks/use-creator-suggest';

export type WatchingPageData = { watches: ContentLabWatch[]; country: string };

/** A creator to add: typed, or picked from the suggestions (which already know their name and picture). */
export type WatchPick = { handle: string; name?: string | null; avatarUrl?: string | null };

/** Asks the BFF for the creator's recent posts, then saves the watch with them. */
async function fetchAndSave(platform: ContentLabPlatform, handle: string) {
    const creator = await contentLabApi.creator({ platform, handle });
    if (!creator.success || !creator.data) return { error: creator.error ?? 'Could not find that creator' };
    const saved = await addContentLabWatch({ platform, handle, creator: creator.data });
    if (!saved.success || !saved.data) return { error: saved.error ?? 'Could not save the creator' };
    return { watch: saved.data };
}

const bare = (handle: string) => handle.trim().replace(/^@+/, '');

/**
 * Watching: find a creator as you type (or type their handle) and add them; refresh one or all
 * (one at a time, with progress); remove.
 */
export function useWatchingPage({ watches: initial, country }: WatchingPageData) {
    const [watches, setWatches] = useState(initial);
    const [platform, setPlatform] = useState<ContentLabPlatform>('youtube');
    const [query, setQuery] = useState('');
    /** The creator being added, shown as a placeholder card until their posts are in. */
    const [adding, setAdding] = useState<(WatchPick & { platform: ContentLabPlatform }) | null>(null);
    const [refreshingId, setRefreshingId] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const suggest = useCreatorSuggest(platform, query, country);

    const upsert = (watch: ContentLabWatch) =>
        setWatches((list) => (list.some((item) => item._id === watch._id) ? list.map((item) => (item._id === watch._id ? watch : item)) : [watch, ...list]));

    const add = async (pick: WatchPick) => {
        const handle = bare(pick.handle);
        if (!handle || adding) return;
        setAdding({ ...pick, handle, platform });
        setQuery('');
        const result = await fetchAndSave(platform, `@${handle}`);
        setAdding(null);
        if (result.error || !result.watch) {
            toast.error(result.error);
            return;
        }
        upsert(result.watch);
        toast.success(`Watching @${result.watch.handle}`);
    };

    const refresh = async (watch: ContentLabWatch) => {
        setRefreshingId(watch._id!);
        const result = await fetchAndSave(watch.platform, watch.handle);
        setRefreshingId(null);
        if (result.watch) upsert(result.watch);
        return result;
    };

    const refreshOne = async (watch: ContentLabWatch) => {
        const result = await refresh(watch);
        if (result.error) toast.error(`@${watch.handle}: ${result.error}`);
    };

    /** One creator at a time: keeps the load (and any rate limit) gentle. */
    const refreshAll = async () => {
        const list = watches;
        let failed = 0;
        setProgress({ done: 0, total: list.length });
        for (const [index, watch] of list.entries()) {
            const result = await refresh(watch);
            if (result.error) failed += 1;
            setProgress({ done: index + 1, total: list.length });
        }
        setProgress(null);
        if (failed) toast.error(`${failed} of ${list.length} could not be refreshed`);
        else toast.success(`Refreshed ${list.length} ${list.length === 1 ? 'creator' : 'creators'}`);
    };

    const remove = async (watch: ContentLabWatch) => {
        const response = await removeContentLabWatch(watch._id!);
        if (!response.success) {
            toast.error(response.error ?? 'Could not remove the creator');
            return;
        }
        setWatches((list) => list.filter((item) => item._id !== watch._id));
        toast.success(`Stopped watching @${watch.handle}`);
    };

    return {
        watches,
        platform,
        setPlatform,
        query,
        setQuery,
        suggest,
        adding,
        add,
        refreshingId,
        refreshOne,
        refreshAll,
        progress,
        busy: !!progress || !!refreshingId,
        remove,
    };
}

export type UseWatchingPageReturn = ReturnType<typeof useWatchingPage>;
