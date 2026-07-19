import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { sessionCookieClearOptions, sessionCookieSetOptions } from '@/lib/auth/cookies';
import { exchangeIdTokenForSessionCookie, revokeSessionCookie } from '@/server/auth';

export async function POST(request: NextRequest) {
    const body = (await request.json()) as { idToken?: string; deviceFingerprint?: string };
    const result = await exchangeIdTokenForSessionCookie(
        body.idToken?.toString() ?? '',
        body.deviceFingerprint?.toString() ?? '',
        request.headers,
    );

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const response = NextResponse.json({ status: 'success' });
    response.cookies.set(sessionCookieSetOptions(result.sessionCookie));
    return response;
}

export async function DELETE() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
        if (sessionCookie) {
            await revokeSessionCookie(sessionCookie);
        }

        const response = NextResponse.json({ status: 'success' });
        response.cookies.set(sessionCookieClearOptions());
        return response;
    } catch (error) {
        console.error('Session delete failed:', error);
        return NextResponse.json({ error: 'Sign out failed' }, { status: 500 });
    }
}
