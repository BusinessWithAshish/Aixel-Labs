import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { CONTENT_LAB_ADS_RESPONSE } from '@/helpers/content-lab-api';
import apiClient from '@/lib/api-client';
import { contentLabError, readContentLabBody } from '@/server/content-lab/backend';

export const maxDuration = 300;

/** shortcut: the ad-library module is not in this branch; move to `API_ENDPOINTS` once it lands. */
const GOOGLE_AD_CREATIVES_ENDPOINT = '/ad-library/google/creatives';

const ADS_REQUEST_SCHEMA = z.object({
    query: z.string().trim().min(1).max(200),
    region: z.string().trim().length(2).transform((value) => value.toUpperCase()),
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

/** Competitor ad creatives (Google Ads Transparency). `available: false` while the backend has no ad-library route. */
export async function POST(request: Request) {
    const read = await readContentLabBody(request, ADS_REQUEST_SCHEMA);
    if ('response' in read) return read.response;

    const result = await apiClient.post<unknown>(GOOGLE_AD_CREATIVES_ENDPOINT, read.body, { signal: request.signal });
    if (request.signal.aborted) return contentLabError('Request cancelled', 499);
    if (!result.success) {
        // `api-client` reports a backend without the route as "Request failed (404)" (Express's HTML 404).
        if (result.error === 'Request failed (404)') {
            return NextResponse.json({ success: true, data: { available: false, ads: [] } satisfies CONTENT_LAB_ADS_RESPONSE });
        }
        return contentLabError(result.error ?? 'Could not load ads', 502);
    }

    const data = result.data as { ads?: unknown; creatives?: unknown } | unknown[] | undefined;
    const list = Array.isArray(data) ? data : Array.isArray(data?.ads) ? data.ads : Array.isArray(data?.creatives) ? data.creatives : [];
    const ads = list.map(toAd).filter((ad): ad is Ad => ad !== null);
    return NextResponse.json({ success: true, data: { available: true, ads } satisfies CONTENT_LAB_ADS_RESPONSE });
}
