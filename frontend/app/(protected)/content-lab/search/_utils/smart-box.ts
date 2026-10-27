import type { CONTENT_LAB_POST, ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { CONTENT_LAB_EXPLORE_ROUTE, contentLabPostRoute } from '@/config/app-config';

/** What the smart box understood: a topic, a post link, a creator, or a link it cannot break down. */
export type SmartQuery =
    | { kind: 'topic'; query: string }
    | { kind: 'link'; url: string; postId: string }
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
    const link = (platform: ContentLabPlatform, id: string): SmartQuery => ({ kind: 'link', url: url.href, postId: `${platform}:${id}` });

    if (host === 'youtu.be' && VIDEO_ID.test(first)) return link('youtube', first);
    if (host === 'youtube.com') {
        const v = url.searchParams.get('v');
        if (first === 'watch' && v && VIDEO_ID.test(v)) return link('youtube', v);
        if (['shorts', 'live', 'embed'].includes(first) && VIDEO_ID.test(second)) return link('youtube', second);
        if (first.startsWith('@')) return { kind: 'creator', handle: first.slice(1), platform: 'youtube' };
        if (first === 'channel' && second) return { kind: 'creator', handle: second, platform: 'youtube' };
    }
    if (host === 'instagram.com') {
        if (IG_POST_PATHS.has(first) && second) return link('instagram', second);
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

/** Where the smart box sends what was typed; `null` when it cannot be used. */
export function smartQueryHref(query: SmartQuery): string | null {
    switch (query.kind) {
        case 'topic':
            return exploreHref({ q: query.query });
        case 'link':
            return postBreakdownHref({ id: query.postId, url: query.url });
        case 'creator':
            return exploreHref({ creator: query.handle, platform: query.platform ?? undefined });
        case 'unsupported':
            return null;
    }
}
