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
        const result = await fetchInstagramProfile(username);
        if (!result.ok) {
            const messages: Record<string, string> = {
                instagram_user_not_found: 'Instagram has no user with this username (404).',
                no_user_payload:
                    'Instagram returned no profile data. This usually means the account is private/restricted, or IG requires a logged-in session for this user.',
                bad_http_status: 'Instagram returned an unexpected error.',
                parse_error: 'Could not read Instagram response.',
                retries_exhausted: 'Instagram is rate-limiting or erroring; try again later.',
                request_failed: 'Request failed (timeout, network, or proxy).',
            };
            const error = messages[result.failure] ?? 'Account not found or unavailable';
            // 404 only when it truly looks like “not found”; otherwise 502/503 is clearer for ops
            const status =
                result.failure === 'instagram_user_not_found'
                    ? 404
                    : result.failure === 'no_user_payload'
                      ? 404
                      : result.failure === 'retries_exhausted'
                        ? 503
                        : result.failure === 'request_failed'
                          ? 502
                          : 502;
            return NextResponse.json(
                { success: false, error, code: result.failure, detail: result.detail },
                { status },
            );
        }
        return NextResponse.json({ success: true, data: result.profile }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ success: false, error: 'Failed to fetch Instagram profile', message }, { status: 500 });
    }
}
