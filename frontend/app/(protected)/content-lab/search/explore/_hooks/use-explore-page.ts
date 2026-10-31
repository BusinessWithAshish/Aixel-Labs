'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ALApiResponse } from '@aixellabs/backend/api/types';
import { CONTENT_LAB_DEFAULT_COUNTRY } from '@aixellabs/backend/content-lab/constants';
import type {
    CONTENT_LAB_CREATOR_RESPONSE,
    CONTENT_LAB_EXPLORE_RESPONSE,
    CONTENT_LAB_POST,
    ContentLabPlatform,
} from '@aixellabs/backend/content-lab/types';
import { contentLabApi } from '@/helpers/content-lab-api';
import type { ContentLabPlatformFilter } from '../../../_constants';
import { usePostActions } from '../../_hooks/use-post-actions';
import { useKeyword } from '../../_hooks/use-keyword';
import { addRecentSearch } from '../../_hooks/use-recent-searches';
import { exploreHref, platformsOf, recentSearchOf } from '../../_utils/smart-box';

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

/** Loading the next page under the posts already shown (infinite scroll). */
export type ExploreMoreState =
    | { status: 'idle' }
    | { status: 'loading' }
    /** The last page added nothing new: load on request only. */
    | { status: 'stalled' }
    | { status: 'error'; error: string };

/** How the loaded posts are ordered; the server's order is "biggest jump". */
export const EXPLORE_SORTS = [
    { value: 'jump', label: 'Biggest jump' },
    { value: 'views', label: 'Most views' },
    { value: 'newest', label: 'Newest' },
] as const;
export type ExploreSort = (typeof EXPLORE_SORTS)[number]['value'];

/** Which loaded posts are shown: all of them mixed, or one platform's (no new search). */
export type ExploreView = 'all' | ContentLabPlatform;

const byMultiple = (a: CONTENT_LAB_POST, b: CONTENT_LAB_POST) => (b.multiple ?? -1) - (a.multiple ?? -1);
const time = (post: CONTENT_LAB_POST) => (post.publishedAt ? Date.parse(post.publishedAt) || 0 : 0);
const SORTERS: Record<ExploreSort, ((a: CONTENT_LAB_POST, b: CONTENT_LAB_POST) => number) | null> = {
    jump: null,
    views: (a, b) => (b.views ?? b.likes ?? -1) - (a.views ?? a.likes ?? -1),
    newest: (a, b) => time(b) - time(a),
};

/** Posts in the chosen order; "biggest jump" keeps the server's ranking. */
export const sortPosts = (posts: CONTENT_LAB_POST[], sort: ExploreSort): CONTENT_LAB_POST[] => {
    const sorter = SORTERS[sort];
    return sorter ? [...posts].sort(sorter) : posts;
};

/** Appends a page, skipping posts already shown (a creator's hit can come back on a later page). */
const appendPosts = (shown: CONTENT_LAB_POST[], page: CONTENT_LAB_POST[]): CONTENT_LAB_POST[] => {
    const seen = new Set(shown.map((post) => post.id));
    return [...shown, ...page.filter((post) => !seen.has(post.id) && seen.add(post.id))];
};

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
    const posts = appendPosts([], creators.flatMap((creator) => creator.posts)).sort(byMultiple);
    return { success: true, data: { posts, takeaways: [], niche: null, creators, errors, nextCursor: null } };
}

async function loadTopic(
    query: string,
    platforms: ContentLabPlatform[],
    country: string,
    signal: AbortSignal,
    cursor?: string,
): Promise<ALApiResponse<ExploreResult>> {
    const reply = await contentLabApi.explore({ query, platforms, country, cursor }, signal);
    if (!reply.success || !reply.data) return { success: false, error: reply.error ?? 'Could not load results' };
    const { posts, takeaways, niche, errors, nextCursor } = reply.data;
    return { success: true, data: { posts: appendPosts([], posts), takeaways, niche, errors, nextCursor, creators: [] } };
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
    const [more, setMore] = useState<ExploreMoreState>({ status: 'idle' });
    const [sort, setSort] = useState<ExploreSort>('jump');
    const [view, setView] = useState<ExploreView>('all');
    const moreController = useRef<AbortController | null>(null);
    const actions = usePostActions(country);
    // How strong the topic is on each source: shared by the side panel and the phone summary.
    const keyword = useKeyword(query, country, { trend: true, delayMs: 0, platforms: platformsOf(platform) });

    // Every search lands in "Recent searches", however it was opened (box, chip, shared link).
    useEffect(() => {
        if (query) addRecentSearch(recentSearchOf({ kind: 'topic', query }, data.platform));
        else if (creator) addRecentSearch(recentSearchOf({ kind: 'creator', handle: creator.handle, platform: creator.platform }, data.platform));
        // Once per search: the page remounts for a new one.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!query && !creatorHandle) return;
        const controller = new AbortController();
        setState({ status: 'loading' });
        setMore({ status: 'idle' });
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
        return () => {
            controller.abort();
            moreController.current?.abort();
        };
    }, [query, creatorHandle, platform, country, attempt]);

    const nextCursor = state.status === 'done' ? state.result.nextCursor : null;

    /** The next page, appended under what is shown; one at a time, and a new search cancels it. */
    const loadMore = useCallback(() => {
        if (!query || !nextCursor || more.status === 'loading') return;
        const controller = new AbortController();
        moreController.current = controller;
        setMore({ status: 'loading' });
        void loadTopic(query, platformsOf(platform), country, controller.signal, nextCursor).then((reply) => {
            if (controller.signal.aborted) return;
            if (!reply.success || !reply.data) {
                setMore({ status: 'error', error: reply.error ?? 'Could not load more posts' });
                return;
            }
            const page = reply.data;
            setState((current) =>
                current.status === 'done'
                    ? {
                          status: 'done',
                          result: {
                              ...current.result,
                              posts: appendPosts(current.result.posts, page.posts),
                              // The latest page says how each platform is doing now (Instagram may catch up on a later page).
                              errors: page.errors,
                              nextCursor: page.nextCursor,
                          },
                      }
                    : current,
            );
            // An empty page (e.g. Instagram slow) stops scrolling from firing the next costly search; the button still can.
            setMore(page.posts.length ? { status: 'idle' } : { status: 'stalled' });
        });
    }, [query, nextCursor, more.status, platform, country]);

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
        setView('all');
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
        sort,
        setSort,
        view,
        setView,
        keyword,
        hasMore: !!nextCursor,
        more,
        loadMore,
        ...actions,
    };
}

export type UseExplorePageReturn = ReturnType<typeof useExplorePage>;
