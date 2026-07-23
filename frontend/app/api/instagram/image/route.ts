// app/api/instagram/image/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fetchInstagramCdnImage } from '@/helpers/instagram-cdn-fetch';
import { IG_IMAGE_PROXY_MAX_AGE_SECONDS, IG_IMAGE_PROXY_SWR_SECONDS, isInstagramCdnUrl } from '@/helpers/instagram-image';

export async function GET(request: NextRequest) {
    const imageUrl = request.nextUrl.searchParams.get('url');

    if (!imageUrl || !isInstagramCdnUrl(imageUrl)) {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    try {
        const { body, contentType } = await fetchInstagramCdnImage(imageUrl);

        return new NextResponse(body, {
            headers: {
                'Content-Type': contentType,
                // Allow embedding from our app origin (and any COEP consumers).
                'Cross-Origin-Resource-Policy': 'cross-origin',
                // Browser + any CDN/reverse-proxy cache; SWR keeps list scrolls snappy.
                'Cache-Control': `public, max-age=${IG_IMAGE_PROXY_MAX_AGE_SECONDS}, s-maxage=${IG_IMAGE_PROXY_MAX_AGE_SECONDS}, stale-while-revalidate=${IG_IMAGE_PROXY_SWR_SECONDS}`,
            },
        });
    } catch {
        return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
    }
}
