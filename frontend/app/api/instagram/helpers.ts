import { Impit } from 'impit';
import type { FetchInstagramProfileResult, InstagramResponse } from './types';

export const IG_APP_ID = '936619743392459';
export const INSTAGRAM_BASE_URL = 'https://www.instagram.com';
export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1_000;

export const INSTAGRAM_USERNAME_REGEX = /^[a-zA-Z0-9_.]+$/;
export const INSTAGRAM_URL_REGEX = /https:\/\/www\.instagram\.com\/[a-zA-Z0-9_.]+/;

export const IG_HEADERS: Record<string, string> = {
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'accept-encoding': 'gzip, deflate, br, zstd',
    priority: 'u=1, i',
    'sec-ch-prefers-color-scheme': 'dark',
    'sec-ch-ua': '"Chromium";v="141", "Not?A_Brand";v="8"',
    'sec-ch-ua-full-version-list': '"Chromium";v="141.0.7390.122", "Not?A_Brand";v="8.0.0.0"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-model': '""',
    'sec-ch-ua-platform': '"macOS"',
    'sec-ch-ua-platform-version': '"26.2.0"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    'x-ig-app-id': IG_APP_ID,
    'x-ig-www-claim': '0',
    'x-requested-with': 'XMLHttpRequest',
    referer: INSTAGRAM_BASE_URL,
};

export function createIgClient() {
    return new Impit({});
}

export async function igFetch(url: string, extraHeaders?: Record<string, string>) {
    const client = createIgClient();
    return client.fetch(url, {
        headers: { ...IG_HEADERS, ...extraHeaders },
    });
}

export function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms))]);
}

export function extractUsername(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('http') || trimmed.includes('instagram.com')) {
        try {
            const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
            const parts = url.pathname.split('/').filter(Boolean);
            const candidate = parts[0];
            if (!candidate || ['explore', 'accounts', 'p', 'reel', 'stories', 'tv'].includes(candidate)) {
                return null;
            }
            return candidate;
        } catch {
            return null;
        }
    }

    return trimmed.replace(/^@/, '') || null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapToResponse(user: any): InstagramResponse {
    const bioEntities = user.biography_with_entities?.entities ?? [];
    const bioHashtags = bioEntities.filter((e: any) => e.hashtag?.name).map((e: any) => e.hashtag.name);
    const bioMentions = bioEntities.filter((e: any) => e.user?.username).map((e: any) => e.user.username);
    const websites = (user.bio_links ?? []).map((l: any) => l.url).filter(Boolean);
    const latestPostUrls = user.edge_owner_to_timeline_media?.edges.map((e: any) => e.node.display_url) ?? null;

    return {
        id: user.id ?? null,
        fullName: user.full_name ?? null,
        username: user.username ?? null,
        instagramUrl: user.username ? `https://www.instagram.com/${user.username}/` : null,
        websites: websites.length > 0 ? websites : null,
        bio: user.biography ?? null,
        bioHashtags: bioHashtags.length > 0 ? bioHashtags : null,
        bioMentions: bioMentions.length > 0 ? bioMentions : null,
        followers: user.edge_followed_by?.count ?? null,
        following: user.edge_follow?.count ?? null,
        posts: user.edge_owner_to_timeline_media?.count ?? null,
        profilePicture: user.profile_pic_url ?? null,
        profilePictureHd: user.profile_pic_url_hd ?? null,
        isVerified: user.is_verified ?? null,
        isBusiness: user.is_business_account ?? null,
        isProfessional: user.is_professional_account ?? null,
        isPrivate: user.is_private ?? null,
        isJoinedRecently: user.if_joined_recently ?? null,
        businessEmail: user.business_email ?? null,
        businessPhoneNumber: user.business_phone_number ?? null,
        businessCategoryName: user.business_category_name ?? null,
        overallCategoryName: user.overall_category_name ?? null,
        businessAddressJson: user.business_address_json ?? null,
        latestPostUrls: latestPostUrls,
    };
}

export async function fetchInstagramProfile(username: string): Promise<FetchInstagramProfileResult> {
    const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await withTimeout(igFetch(url), REQUEST_TIMEOUT_MS);

            if (response.status === 404) {
                return { ok: false, failure: 'instagram_user_not_found' };
            }

            if (response.status === 429 || response.status >= 500) {
                const retryAfter = response.headers.get?.('retry-after');
                const backoff = retryAfter ? parseInt(retryAfter, 10) * 1_000 : RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 500;
                lastError = new Error(`HTTP ${response.status} on attempt ${attempt}`);
                if (attempt < MAX_RETRIES) {
                    await sleep(backoff);
                    continue;
                }
                return {
                    ok: false,
                    failure: 'retries_exhausted',
                    detail: lastError.message,
                };
            }

            if (response.status === 401 || response.status === 403) {
                const body = await response.text().catch(() => '');
                throw new Error(`Instagram auth failure (${response.status}). Body: ${body.slice(0, 200)}`);
            }

            if (!response.ok) {
                return {
                    ok: false,
                    failure: 'bad_http_status',
                    detail: `HTTP ${response.status}`,
                };
            }

            let json: { data?: { user?: unknown } };
            try {
                json = await response.json();
            } catch {
                lastError = new Error(`JSON parse failed for @${username}`);
                if (attempt < MAX_RETRIES) {
                    await sleep(RETRY_BASE_DELAY_MS * attempt);
                    continue;
                }
                return { ok: false, failure: 'parse_error', detail: lastError.message };
            }

            const user = json?.data?.user;
            if (!user) {
                // Very common: private accounts, age-restricted, or IG omitting user without a real session
                return { ok: false, failure: 'no_user_payload' };
            }

            return { ok: true, profile: mapToResponse(user) };
        } catch (err) {
            const error = err as Error;
            if (error.message.includes('auth failure')) throw error;
            lastError = error;
            if (attempt < MAX_RETRIES) {
                await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 500);
            }
        }
    }

    console.error(`[instagram] Giving up on @${username} after ${MAX_RETRIES} attempts: ${lastError?.message}`);
    return {
        ok: false,
        failure: 'request_failed',
        detail: lastError?.message,
    };
}
