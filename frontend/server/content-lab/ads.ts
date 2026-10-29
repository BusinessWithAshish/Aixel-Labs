import 'server-only';

import { z } from 'zod';
import type { ALApiResponse } from '@aixellabs/backend/api/types';
import type { CONTENT_LAB_ADS_REQUEST, CONTENT_LAB_ADS_RESPONSE } from '@/helpers/content-lab-api';
import apiClient from '@/lib/api-client';

/** shortcut: the ad-library module is not in this branch; move to `API_ENDPOINTS` once it lands. */
const GOOGLE_AD_CREATIVES_ENDPOINT = '/ad-library/google/creatives';

export const CONTENT_LAB_ADS_REQUEST_SCHEMA = z.object({
    query: z.string().trim().min(1).max(200),
    region: z
        .string()
        .trim()
        .length(2)
        .transform((value) => value.toUpperCase()),
    limit: z.number().int().min(1).max(100).optional(),
});

type Ad = CONTENT_LAB_ADS_RESPONSE['ads'][number];

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

/** The ad-library response shape is not fixed yet: take what looks right and drop the rest. */
function toAd(raw: unknown, index: number): Ad | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const advertiser = str(o.advertiser) ?? str(o.advertiserName) ?? str(o.advertiser_name);
    if (!advertiser) return null;
    return {
        id: str(o.id) ?? str(o.creativeId) ?? `${advertiser}-${index}`,
        advertiser,
        format: str(o.format),
        platform: str(o.platform),
        text: str(o.text) ?? str(o.body) ?? str(o.headline),
        url: str(o.url) ?? str(o.previewUrl) ?? str(o.link),
        firstShown: str(o.firstShown) ?? str(o.first_shown),
        lastShown: str(o.lastShown) ?? str(o.last_shown),
    };
}

/**
 * Competitor ad creatives (Google Ads Transparency). `available: false` while the backend has no
 * ad-library route. Used by the Ads BFF route and by scheduled board runs.
 */
export async function fetchContentLabAds(body: CONTENT_LAB_ADS_REQUEST, signal?: AbortSignal): Promise<ALApiResponse<CONTENT_LAB_ADS_RESPONSE>> {
    const result = await apiClient.post<unknown>(GOOGLE_AD_CREATIVES_ENDPOINT, body, { signal });
    if (!result.success) {
        // `api-client` reports a backend without the route as "Request failed (404)" (Express's HTML 404).
        if (result.error === 'Request failed (404)') return { success: true, data: { available: false, ads: [] } };
        return { success: false, error: result.error ?? 'Could not load ads' };
    }
    const data = result.data as { ads?: unknown; creatives?: unknown } | unknown[] | undefined;
    const list = Array.isArray(data) ? data : Array.isArray(data?.ads) ? data.ads : Array.isArray(data?.creatives) ? data.creatives : [];
    const ads = list.map(toAd).filter((ad): ad is Ad => ad !== null);
    return { success: true, data: { available: true, ads } };
}
