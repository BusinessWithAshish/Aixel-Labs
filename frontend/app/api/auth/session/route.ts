import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';
import {
    exchangeIdTokenForSessionCookie,
    sessionCookieOptions,
} from '@/lib/auth/create-session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/types';

/**
 * Exchange a Firebase ID token for an httpOnly session cookie.
 * @see https://firebase.google.com/docs/auth/admin/manage-cookies
 */
export async function POST(request: NextRequest) {
    const body = (await request.json()) as { idToken?: string };
    const result = await exchangeIdTokenForSessionCookie(body.idToken?.toString() ?? '', request.headers);

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const response = NextResponse.json({ status: 'success' });
    response.cookies.set({
        ...sessionCookieOptions,
        name: SESSION_COOKIE_NAME,
        value: result.sessionCookie,
    });
    return response;
}

/**
 * Clear the session cookie and revoke refresh tokens when possible.
 */
export async function DELETE() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

        if (sessionCookie) {
            try {
                const decoded = await getFirebaseAdminAuth().verifySessionCookie(sessionCookie);
                await getFirebaseAdminAuth().revokeRefreshTokens(decoded.sub);
            } catch {
                // Cookie may already be invalid; still clear it.
            }
        }

        const response = NextResponse.json({ status: 'success' });
        response.cookies.set({
            ...sessionCookieOptions,
            name: SESSION_COOKIE_NAME,
            value: '',
            maxAge: 0,
        });
        return response;
    } catch (error) {
        console.error('Session delete failed:', error);
        return NextResponse.json({ error: 'Sign out failed' }, { status: 500 });
    }
}
