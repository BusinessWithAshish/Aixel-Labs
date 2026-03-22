// app/api/instagram/image/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const imageUrl = request.nextUrl.searchParams.get('url');

    if (!imageUrl || !imageUrl.includes('fbcdn.net')) {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const response = await fetch(imageUrl, {
        headers: {
            Referer: 'https://www.instagram.com/',
            Origin: 'https://www.instagram.com',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
        },
    });

    if (!response.ok) {
        return NextResponse.json({ error: 'Failed to fetch image' }, { status: response.status });
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';

    return new NextResponse(imageBuffer, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
