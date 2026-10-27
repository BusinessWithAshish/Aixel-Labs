'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import type { ContentLabWatch } from '@aixellabs/backend/db/types';
import { addContentLabWatch, removeContentLabWatch } from '@/app/actions/content-lab-actions';
import { contentLabApi } from '@/helpers/content-lab-api';

export type WatchingPageData = { watches: ContentLabWatch[] };

/** Asks the BFF for the creator's recent posts, then saves the watch with its standouts. */
async function fetchAndSave(platform: ContentLabPlatform, handle: string) {
    const creator = await contentLabApi.creator({ platform, handle });
    if (!creator.success || !creator.data) return { error: creator.error ?? 'Could not find that creator' };
    const saved = await addContentLabWatch({ platform, handle, creator: creator.data });
    if (!saved.success || !saved.data) return { error: saved.error ?? 'Could not save the watch' };
    return { watch: saved.data };
}

/** Watching: add a creator (platform + @handle), refresh one or all (one at a time, with progress), remove. */
export function useWatchingPage({ watches: initial }: WatchingPageData) {
    const [watches, setWatches] = useState(initial);
    const [platform, setPlatform] = useState<ContentLabPlatform>('youtube');
    const [handle, setHandle] = useState('');
    const [adding, setAdding] = useState(false);
    const [refreshingId, setRefreshingId] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    const upsert = (watch: ContentLabWatch) =>
        setWatches((list) => (list.some((item) => item._id === watch._id) ? list.map((item) => (item._id === watch._id ? watch : item)) : [watch, ...list]));

    const add = async () => {
        const typed = handle.trim();
        if (!typed) return;
        setAdding(true);
        const result = await fetchAndSave(platform, typed);
        setAdding(false);
        if (result.error || !result.watch) {
            toast.error(result.error);
            return;
        }
        upsert(result.watch);
        setHandle('');
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

    /** One creator at a time: keeps the scrape load (and any rate limit) gentle. */
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
        else toast.success(`Refreshed ${list.length} creators`);
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
        handle,
        setHandle,
        adding,
        add,
        refreshingId,
        refreshOne,
        refreshAll,
        progress,
        remove,
    };
}

export type UseWatchingPageReturn = ReturnType<typeof useWatchingPage>;
