import type { ALApiResponse } from '@aixellabs/backend/api/types';
import type {
    CONTENT_LAB_BREAKDOWN_REQUEST,
    CONTENT_LAB_BREAKDOWN_RESPONSE,
    CONTENT_LAB_CHECK_REQUEST,
    CONTENT_LAB_CHECK_RESPONSE,
    CONTENT_LAB_CREATOR_REQUEST,
    CONTENT_LAB_CREATOR_RESPONSE,
    CONTENT_LAB_EXPLORE_REQUEST,
    CONTENT_LAB_EXPLORE_RESPONSE,
    CONTENT_LAB_KEYWORD_REQUEST,
    CONTENT_LAB_KEYWORD_RESPONSE,
    CONTENT_LAB_SUGGEST_REQUEST,
    CONTENT_LAB_SUGGEST_RESPONSE,
} from '@aixellabs/backend/content-lab/types';
import type { ContentLabWriteFormat } from '@aixellabs/backend/db/types';
import { CONTENT_LAB_API_ROUTES } from '@/config/app-config';

/** One example the writer imitates (an outlier, a pasted post, a hook). */
export type ContentLabWriteExample = {
    title: string;
    url?: string;
    hook?: string | null;
    structure?: string[];
    cta?: string | null;
    text?: string | null;
};

export type ContentLabWriteContext = {
    topic?: string;
    /** The user's own recent titles/captions, for tone. */
    voice?: string[];
    examples?: ContentLabWriteExample[];
    /** Hook / structure / CTA patterns pulled from the examples. */
    patterns?: string[];
    note?: string;
};

export type CONTENT_LAB_WRITE_REQUEST =
    | { mode: 'draft'; format: ContentLabWriteFormat; language: string; context: ContentLabWriteContext }
    /** Three stronger versions of a draft title/hook, for "Check my idea". */
    | { mode: 'rewrites'; draft: string; platform: 'youtube' | 'instagram'; language: string; context: ContentLabWriteContext };

export type CONTENT_LAB_WRITE_RESPONSE = { text: string } | { versions: string[] };

export type CONTENT_LAB_ADS_REQUEST = { query: string; region: string; limit?: number };
/** Competitor ad creatives (Google Ads Transparency, incl. YouTube). `available: false` until the ad-library API is deployed. */
export type CONTENT_LAB_ADS_RESPONSE = {
    available: boolean;
    ads: { id: string; advertiser: string; format: string | null; platform: string | null; text: string | null; url: string | null; firstShown: string | null; lastShown: string | null }[];
};

async function post<TReq, TRes>(url: string, body: TReq, signal?: AbortSignal): Promise<ALApiResponse<TRes>> {
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal,
        });
        const json = (await res.json().catch(() => null)) as ALApiResponse<TRes> | null;
        return json ?? { success: false, error: `Request failed (${res.status})` };
    } catch (error) {
        if (signal?.aborted) return { success: false, error: 'Request cancelled' };
        return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
}

/** Browser-side calls to the Content Lab BFF (`app/api/content-lab/*`). */
export const contentLabApi = {
    explore: (body: CONTENT_LAB_EXPLORE_REQUEST, signal?: AbortSignal) =>
        post<CONTENT_LAB_EXPLORE_REQUEST, CONTENT_LAB_EXPLORE_RESPONSE>(CONTENT_LAB_API_ROUTES.EXPLORE, body, signal),
    breakdown: (body: CONTENT_LAB_BREAKDOWN_REQUEST, signal?: AbortSignal) =>
        post<CONTENT_LAB_BREAKDOWN_REQUEST, CONTENT_LAB_BREAKDOWN_RESPONSE>(CONTENT_LAB_API_ROUTES.BREAKDOWN, body, signal),
    check: (body: CONTENT_LAB_CHECK_REQUEST, signal?: AbortSignal) =>
        post<CONTENT_LAB_CHECK_REQUEST, CONTENT_LAB_CHECK_RESPONSE>(CONTENT_LAB_API_ROUTES.CHECK, body, signal),
    creator: (body: CONTENT_LAB_CREATOR_REQUEST, signal?: AbortSignal) =>
        post<CONTENT_LAB_CREATOR_REQUEST, CONTENT_LAB_CREATOR_RESPONSE>(CONTENT_LAB_API_ROUTES.CREATOR, body, signal),
    /** Type-ahead creators for what was typed so far; pass a fresh signal per keystroke. */
    suggest: (body: CONTENT_LAB_SUGGEST_REQUEST, signal?: AbortSignal) =>
        post<CONTENT_LAB_SUGGEST_REQUEST, CONTENT_LAB_SUGGEST_RESPONSE>(CONTENT_LAB_API_ROUTES.SUGGEST, body, signal),
    /** What people search for a topic, and (with `trend`) its 0-100 score from YouTube search interest. */
    keyword: (body: CONTENT_LAB_KEYWORD_REQUEST, signal?: AbortSignal) =>
        post<CONTENT_LAB_KEYWORD_REQUEST, CONTENT_LAB_KEYWORD_RESPONSE>(CONTENT_LAB_API_ROUTES.KEYWORD, body, signal),
    write: (body: CONTENT_LAB_WRITE_REQUEST, signal?: AbortSignal) =>
        post<CONTENT_LAB_WRITE_REQUEST, CONTENT_LAB_WRITE_RESPONSE>(CONTENT_LAB_API_ROUTES.WRITE, body, signal),
    ads: (body: CONTENT_LAB_ADS_REQUEST, signal?: AbortSignal) =>
        post<CONTENT_LAB_ADS_REQUEST, CONTENT_LAB_ADS_RESPONSE>(CONTENT_LAB_API_ROUTES.ADS, body, signal),
};
