import { CONTENT_LAB_PLATFORMS } from '@aixellabs/backend/content-lab/constants';
import type { CONTENT_LAB_POST, ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { CONTENT_LAB_EXPLORE_ROUTE, contentLabPostRoute } from '@/config/app-config';
import type { ContentLabPlatformFilter } from '../../_constants';

/** What the smart box understood: a topic, a post link, a creator, or a link it cannot break down. */
export type SmartQuery =
    | { kind: 'topic'; query: string }
    /** `label`: "YouTube Short", "Instagram reel"…; `thumbnailUrl`: YouTube's, which needs no request to know. */
    | { kind: 'link'; url: string; postId: string; platform: ContentLabPlatform; label: string; thumbnailUrl: string | null }
    | { kind: 'creator'; handle: string; platform: ContentLabPlatform | null }
    | { kind: 'unsupported'; url: string };

const LOOKS_LIKE_LINK = /^(https?:\/\/|(www\.|m\.)?(youtube\.com|youtu\.be|instagram\.com)\/)/i;
const VIDEO_ID = /^[\w-]{6,}$/;
const IG_POST_PATHS = new Set(['p', 'reel', 'reels', 'tv']);
const IG_RESERVED = new Set(['explore', 'stories', 'accounts', 'direct', 'about', 'developer', 'legal']);

function parseLink(raw: string): SmartQuery {
    let url: URL;
    try {
        url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
        return { kind: 'unsupported', url: raw };
    }
    const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
    const [first = '', second = ''] = url.pathname.split('/').filter(Boolean);
    const youtube = (id: string, label: string): SmartQuery => ({
        kind: 'link',
        url: url.href,
        postId: `youtube:${id}`,
        platform: 'youtube',
        label,
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    });

    if (host === 'youtu.be' && VIDEO_ID.test(first)) return youtube(first, 'YouTube video');
    if (host === 'youtube.com') {
        const v = url.searchParams.get('v');
        if (first === 'watch' && v && VIDEO_ID.test(v)) return youtube(v, 'YouTube video');
        if (first === 'shorts' && VIDEO_ID.test(second)) return youtube(second, 'YouTube Short');
        if (['live', 'embed'].includes(first) && VIDEO_ID.test(second)) return youtube(second, 'YouTube video');
        if (first.startsWith('@')) return { kind: 'creator', handle: first.slice(1), platform: 'youtube' };
        if (first === 'channel' && second) return { kind: 'creator', handle: second, platform: 'youtube' };
    }
    if (host === 'instagram.com') {
        if (IG_POST_PATHS.has(first) && second) {
            const label = first === 'p' ? 'Instagram post' : 'Instagram reel';
            return { kind: 'link', url: url.href, postId: `instagram:${second}`, platform: 'instagram', label, thumbnailUrl: null };
        }
        if (first && !second && !IG_RESERVED.has(first)) return { kind: 'creator', handle: first, platform: 'instagram' };
    }
    return { kind: 'unsupported', url: url.href };
}

export function detectQuery(raw: string): SmartQuery | null {
    const value = raw.trim();
    if (!value) return null;
    if (value.startsWith('@')) {
        const handle = value.slice(1).split(/\s/)[0];
        return handle ? { kind: 'creator', handle, platform: null } : null;
    }
    if (LOOKS_LIKE_LINK.test(value)) return parseLink(value);
    return { kind: 'topic', query: value };
}

/** Breakdown link for a post; carries the post URL so the link is shareable whatever the id format. */
export function postBreakdownHref(post: Pick<CONTENT_LAB_POST, 'id' | 'url'>): string {
    return `${contentLabPostRoute(post.id)}?url=${encodeURIComponent(post.url)}`;
}

/** Fallback when a breakdown link has no `?url=`: rebuilds it from `${platform}:${nativeId}`. */
export function urlFromPostId(postId: string): string | null {
    const [platform, id] = postId.split(':');
    if (!id || !VIDEO_ID.test(id)) return null;
    if (platform === 'youtube') return `https://www.youtube.com/watch?v=${id}`;
    if (platform === 'instagram') return `https://www.instagram.com/p/${id}/`;
    return null;
}

export function exploreHref(params: { q?: string; creator?: string; platform?: string; country?: string }): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    const qs = search.toString();
    return qs ? `${CONTENT_LAB_EXPLORE_ROUTE}?${qs}` : CONTENT_LAB_EXPLORE_ROUTE;
}

/** The platforms a filter searches. */
export const platformsOf = (filter: ContentLabPlatformFilter): ContentLabPlatform[] =>
    filter === 'both' ? [...CONTENT_LAB_PLATFORMS] : [filter];

/** The filter for a set of platforms; all of them (or none) is `both`. */
export const filterOf = (platforms: readonly ContentLabPlatform[]): ContentLabPlatformFilter =>
    platforms.length === 1 ? platforms[0] : 'both';

/** `?platform=` for a filter: none for both. */
export const platformParam = (platform: ContentLabPlatformFilter | null | undefined) => (platform && platform !== 'both' ? platform : undefined);

/** Where the smart box sends what was typed (searches kept to `platform`); `null` when it cannot be used. */
export function smartQueryHref(query: SmartQuery, platform?: ContentLabPlatformFilter): string | null {
    switch (query.kind) {
        case 'topic':
            return exploreHref({ q: query.query, platform: platformParam(platform) });
        case 'link':
            return postBreakdownHref({ id: query.postId, url: query.url });
        case 'creator':
            return exploreHref({ creator: query.handle, platform: query.platform ?? platformParam(platform) });
        case 'unsupported':
            return null;
    }
}

/** One search the user ran, kept on this device for "Recent searches". */
export type RecentSearch = {
    kind: 'topic' | 'creator' | 'link';
    /** What to show: the topic, "@handle" or the link without its https://. */
    text: string;
    href: string;
    platform: ContentLabPlatform | null;
    /** Epoch ms of the last time it ran. */
    at: number;
};

/** The recent-search entry for a query the smart box understood; null for one it cannot run. */
export function recentSearchOf(query: SmartQuery, platform?: ContentLabPlatformFilter): RecentSearch | null {
    const href = smartQueryHref(query, platform);
    if (!href || query.kind === 'unsupported') return null;
    const only = platformParam(platform) ?? null;
    if (query.kind === 'topic') return { kind: 'topic', text: query.query, href, platform: only, at: Date.now() };
    if (query.kind === 'creator') return { kind: 'creator', text: `@${query.handle}`, href, platform: query.platform ?? only, at: Date.now() };
    return { kind: 'link', text: query.url.replace(/^https?:\/\/(www\.|m\.)?/i, ''), href, platform: query.platform, at: Date.now() };
}
