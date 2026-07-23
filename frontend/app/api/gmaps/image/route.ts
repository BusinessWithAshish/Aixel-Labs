import { NextRequest, NextResponse } from 'next/server';
import { fetchGmapsCdnImage } from '@/helpers/gmaps-cdn-fetch';
import {
    GMAPS_IMAGE_PROXY_MAX_AGE_SECONDS,
    GMAPS_IMAGE_PROXY_SWR_SECONDS,
    isGmapsCdnUrl,
} from '@/helpers/gmaps-image';

export async function GET(request: NextRequest) {
    const imageUrl = request.nextUrl.searchParams.get('url');

    if (!imageUrl || !isGmapsCdnUrl(imageUrl)) {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    try {
        const { body, contentType } = await fetchGmapsCdnImage(imageUrl);

        return new NextResponse(body, {
            headers: {
                'Content-Type': contentType,
                'Cross-Origin-Resource-Policy': 'cross-origin',
                'Cache-Control': `public, max-age=${GMAPS_IMAGE_PROXY_MAX_AGE_SECONDS}, s-maxage=${GMAPS_IMAGE_PROXY_MAX_AGE_SECONDS}, stale-while-revalidate=${GMAPS_IMAGE_PROXY_SWR_SECONDS}`,
            },
        });
    } catch {
        return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
    }
}
