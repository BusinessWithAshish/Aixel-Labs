import type { INSTAGRAM_RESPONSE } from '@aixellabs/backend/instagram';

/** Why profile fetch failed (your API may still return HTTP 404 for several of these). */
export type InstagramProfileFetchFailure =
    | 'instagram_user_not_found' // backend resolved no such account
    | 'no_user_payload' // account exists but returned no usable profile data
    | 'bad_http_status' // other non-OK responses we don't retry
    | 'parse_error'
    | 'retries_exhausted' // backend reported it was rate-limited / erroring
    | 'request_failed'; // the backend call itself failed (timeout, network, config)

/**
 * The backend `INSTAGRAM_RESPONSE` (schema SSOT — see `@aixellabs/backend/instagram`)
 * plus `latestPostUrls`, the post thumbnails this viewer renders. The backend
 * profile lookup doesn't return posts, so the route fills this from the
 * Posts-tab endpoint separately.
 */
export type InstagramResponse = INSTAGRAM_RESPONSE & {
    latestPostUrls: string[] | null;
};

export type FetchInstagramProfileResult =
    | { ok: true; profile: InstagramResponse }
    | { ok: false; failure: InstagramProfileFetchFailure; detail?: string };
