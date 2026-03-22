import { NextRequest, NextResponse } from 'next/server';
import { extractUsername, INSTAGRAM_USERNAME_REGEX, INSTAGRAM_URL_REGEX, fetchInstagramProfile } from '../helpers';

export async function GET(request: NextRequest) {
    const raw = request.nextUrl.searchParams.get('username') ?? '';

    if (!raw.trim()) {
        return NextResponse.json({ success: false, error: 'Username or URL is required' }, { status: 400 });
    }

    if (!INSTAGRAM_USERNAME_REGEX.test(raw.trim()) && !INSTAGRAM_URL_REGEX.test(raw.trim())) {
        return NextResponse.json({ success: false, error: 'Invalid username or URL' }, { status: 400 });
    }

    const username = extractUsername(raw.trim());
    if (!username) {
        return NextResponse.json({ success: false, error: 'Could not resolve username' }, { status: 400 });
    }

    try {
        const profile = await fetchInstagramProfile(username);
        if (!profile) {
            return NextResponse.json({ success: false, error: 'Account not found or unavailable' }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: profile }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ success: false, error: 'Failed to fetch Instagram profile', message }, { status: 500 });
    }
}
