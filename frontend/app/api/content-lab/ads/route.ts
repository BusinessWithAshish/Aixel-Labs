import { NextResponse } from 'next/server';
import { CONTENT_LAB_ADS_REQUEST_SCHEMA, fetchContentLabAds } from '@/server/content-lab/ads';
import { contentLabError, readContentLabBody } from '@/server/content-lab/backend';

export const maxDuration = 300;

/** Competitor ad creatives (Google Ads Transparency). `available: false` while the backend has no ad-library route. */
export async function POST(request: Request) {
    const read = await readContentLabBody(request, CONTENT_LAB_ADS_REQUEST_SCHEMA);
    if ('response' in read) return read.response;

    const result = await fetchContentLabAds(read.body, request.signal);
    if (request.signal.aborted) return contentLabError('Request cancelled', 499);
    if (!result.success) return contentLabError(result.error ?? 'Could not load ads', 502);
    return NextResponse.json(result);
}
