import 'server-only';

import type { INSTAGRAM_RESPONSE } from '@aixellabs/backend/instagram';
import { API_ENDPOINTS } from '@aixellabs/backend/config';
import apiClient from '@/lib/api-client';
import type { FetchInstagramProfileResult } from './types';

export const INSTAGRAM_USERNAME_REGEX = /^[a-zA-Z0-9_.]+$/;
export const INSTAGRAM_URL_REGEX = /https:\/\/www\.instagram\.com\/[a-zA-Z0-9_.]+/;

/** ISO alpha-2 the backend uses to format the profile's phone number. */
const DEFAULT_COUNTRY = 'IN';
/** Thumbnails the viewer shows, when the account is public and posts resolve. */
const LATEST_POSTS_COUNT = 11;
const REQUEST_TIMEOUT_MS = 30_000;

export function extractUsername(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('http') || trimmed.includes('instagram.com')) {
        try {
            const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
            const parts = url.pathname.split('/').filter(Boolean);
            const candidate = parts[0];
            if (!candidate || ['explore', 'accounts', 'p', 'reel', 'reels', 'stories', 'tv'].includes(candidate)) {
                return null;
            }
            return candidate;
        } catch {
            return null;
        }
    }

    return trimmed.replace(/^@/, '') || null;
}

/**
 * Latest post thumbnails for the viewer grid. Best-effort: the Posts-tab
 * endpoint is separate from the profile lookup, so any failure (private
 * account, rate limit) just yields no thumbnails rather than failing the
 * profile. One image per post — the grid item, not carousel slides.
 */
async function fetchLatestPostThumbnails(username: string): Promise<string[] | null> {
    // Minimal shape of the Posts-tab response — only the grid thumbnail is read.
    const res = await apiClient.post<{ posts: Array<{ imageUrl: string | null }> }>(
        API_ENDPOINTS.INSTAGRAM.ADVANCED_POSTS.full,
        { username, count: LATEST_POSTS_COUNT, pages: 1 },
        { timeout: REQUEST_TIMEOUT_MS },
    );
    if (!res.success || !res.data) return null;
    const urls = res.data.posts
        .map((post) => post.imageUrl)
        .filter((url): url is string => Boolean(url));
    return urls.length > 0 ? urls : null;
}

/**
 * Look up one Instagram profile through the backend `POST /instagram`
 * endpoint (logged-out GraphQL — see `backend/src/api/instagram/README.md`),
 * then attach latest post thumbnails from the Posts-tab endpoint. No scraping
 * happens in the frontend; the backend owns the transport and mapping.
 */
export async function fetchInstagramProfile(
    username: string,
    country: string = DEFAULT_COUNTRY,
): Promise<FetchInstagramProfileResult> {
    let res;
    try {
        res = await apiClient.post<INSTAGRAM_RESPONSE[]>(
            API_ENDPOINTS.INSTAGRAM.API.full,
            { entities: [username], country, limit: 1 },
            { timeout: REQUEST_TIMEOUT_MS },
        );
    } catch (err) {
        return { ok: false, failure: 'request_failed', detail: err instanceof Error ? err.message : String(err) };
    }

    if (!res.success) {
        // The backend only reports failure when every route was exhausted.
        return { ok: false, failure: 'retries_exhausted', detail: res.error };
    }

    const profile = res.data?.[0];
    if (!profile) {
        // Backend omits handles it couldn't resolve — treat as not found.
        return { ok: false, failure: 'instagram_user_not_found' };
    }

    const latestPostUrls = await fetchLatestPostThumbnails(username).catch(() => null);

    return { ok: true, profile: { ...profile, latestPostUrls } };
}
