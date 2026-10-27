'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ALApiResponse } from '@aixellabs/backend/api/types';
import { CONTENT_LAB_DEFAULT_COUNTRY, CONTENT_LAB_PLATFORMS } from '@aixellabs/backend/content-lab/constants';
import type {
    CONTENT_LAB_CREATOR_RESPONSE,
    CONTENT_LAB_EXPLORE_RESPONSE,
    CONTENT_LAB_POST,
    ContentLabPlatform,
} from '@aixellabs/backend/content-lab/types';
import { contentLabApi } from '@/helpers/content-lab-api';
import type { ContentLabPlatformFilter } from '../../../_constants';
import { usePostActions } from '../../_hooks/use-post-actions';
import { exploreHref } from '../../_utils/smart-box';

export type ExplorePageData = {
    /** Topic mode. */
    query: string | null;
    /** Creator mode (`?creator=`): that creator's posts that beat their usual. */
    creator: { handle: string; platform: ContentLabPlatform | null } | null;
    platform: ContentLabPlatformFilter;
    country: string;
    /** `?q=` was a link that cannot be broken down. */
    unsupported: boolean;
};

export type ExploreResult = Omit<CONTENT_LAB_EXPLORE_RESPONSE, 'niche' | 'query' | 'country' | 'platforms'> & {
    niche: CONTENT_LAB_EXPLORE_RESPONSE['niche'] | null;
    creators: CONTENT_LAB_CREATOR_RESPONSE[];
};

export type ExploreLoadState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error'; error: string }
    | { status: 'done'; result: ExploreResult };

const platformsOf = (filter: ContentLabPlatformFilter): ContentLabPlatform[] =>
    filter === 'both' ? [...CONTENT_LAB_PLATFORMS] : [filter];

const byMultiple = (a: CONTENT_LAB_POST, b: CONTENT_LAB_POST) => (b.multiple ?? -1) - (a.multiple ?? -1);

/** A creator is looked up on each chosen platform; one failing still shows the other's posts. */
async function loadCreator(
    handle: string,
    platforms: ContentLabPlatform[],
    country: string,
    signal: AbortSignal,
): Promise<ALApiResponse<ExploreResult>> {
    const replies = await Promise.all(platforms.map((platform) => contentLabApi.creator({ platform, handle, country }, signal)));
    const creators: CONTENT_LAB_CREATOR_RESPONSE[] = [];
    const errors: ExploreResult['errors'] = {};
    replies.forEach((reply, index) => {
        if (reply.success && reply.data) creators.push(reply.data);
        else errors[platforms[index]] = reply.error ?? 'Could not load this creator';
    });
    const posts = creators.flatMap((creator) => creator.posts).sort(byMultiple);
    return { success: true, data: { posts, takeaways: [], niche: null, creators, errors } };
}

async function loadTopic(
    query: string,
    platforms: ContentLabPlatform[],
    country: string,
    signal: AbortSignal,
): Promise<ALApiResponse<ExploreResult>> {
    const reply = await contentLabApi.explore({ query, platforms, country }, signal);
    if (!reply.success || !reply.data) return { success: false, error: reply.error ?? 'Could not load results' };
    const { posts, takeaways, niche, errors } = reply.data;
    return { success: true, data: { posts, takeaways, niche, errors, creators: [] } };
}

/**
 * What's working: a topic's (or one creator's) posts ranked by how far they beat their creator's
 * usual views. Platform and country live in the URL (replaced in place, so links stay shareable);
 * changing either, or leaving the page, aborts the request in flight.
 */
export function useExplorePage(data: ExplorePageData) {
    const { query, creator, unsupported } = data;
    const creatorHandle = creator?.handle ?? null;
    const [platform, setPlatformState] = useState(data.platform);
    const [country, setCountryState] = useState(data.country);
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<ExploreLoadState>({ status: query || creator ? 'loading' : 'idle' });
    const actions = usePostActions(country);

    useEffect(() => {
        if (!query && !creatorHandle) return;
        const controller = new AbortController();
        setState({ status: 'loading' });
        const platforms = platformsOf(platform);
        const run = creatorHandle
            ? loadCreator(creatorHandle, platforms, country, controller.signal)
            : loadTopic(query ?? '', platforms, country, controller.signal);
        void run.then((reply) => {
            if (controller.signal.aborted) return;
            setState(
                reply.success && reply.data
                    ? { status: 'done', result: reply.data }
                    : { status: 'error', error: reply.error ?? 'Something went wrong' },
            );
        });
        return () => controller.abort();
    }, [query, creatorHandle, platform, country, attempt]);

    const syncUrl = useCallback(
        (next: { platform: ContentLabPlatformFilter; country: string }) => {
            const href = exploreHref({
                q: query ?? undefined,
                creator: creatorHandle ?? undefined,
                platform: next.platform === 'both' ? undefined : next.platform,
                country: next.country === CONTENT_LAB_DEFAULT_COUNTRY ? undefined : next.country,
            });
            window.history.replaceState(null, '', href);
        },
        [query, creatorHandle],
    );

    const setPlatform = (next: ContentLabPlatformFilter) => {
        setPlatformState(next);
        syncUrl({ platform: next, country });
    };
    const setCountry = (next: string) => {
        setCountryState(next);
        syncUrl({ platform, country: next });
    };

    return {
        query,
        creator,
        unsupported,
        platform,
        setPlatform,
        country,
        setCountry,
        state,
        retry: () => setAttempt((n) => n + 1),
        ...actions,
    };
}

export type UseExplorePageReturn = ReturnType<typeof useExplorePage>;
