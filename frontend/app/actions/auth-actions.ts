'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';
import {
    exchangeIdTokenForSessionCookieFromHeaders,
    sessionCookieOptions,
} from '@/lib/auth/create-session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/types';

export type CreateSessionActionResult = { success: true } | { success: false; error: string };

/**
 * Exchange a Firebase ID token for an httpOnly session cookie.
 * Sensitive tenant/user upsert logic stays on the server.
 */
export async function createSession(idToken: string): Promise<CreateSessionActionResult> {
    const result = await exchangeIdTokenForSessionCookieFromHeaders(idToken);
    if (!result.ok) {
        return { success: false, error: result.error };
    }

    const cookieStore = await cookies();
    cookieStore.set({
        ...sessionCookieOptions,
        name: SESSION_COOKIE_NAME,
        value: result.sessionCookie,
    });

    return { success: true };
}

/**
 * Sign out: revoke refresh tokens, clear session cookie, stay on tenant host.
 */
export async function handleSignOut() {
    const host = (await headers()).get('host');
    const redirectTo = host ? `${process.env.NODE_ENV === 'production' ? 'https' : 'http'}://${host}/sign-in` : '/sign-in';

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (sessionCookie) {
        try {
            const decoded = await getFirebaseAdminAuth().verifySessionCookie(sessionCookie);
            await getFirebaseAdminAuth().revokeRefreshTokens(decoded.sub);
        } catch {
            // Cookie may already be invalid.
        }
    }

    cookieStore.set({
        ...sessionCookieOptions,
        name: SESSION_COOKIE_NAME,
        value: '',
        maxAge: 0,
    });

    redirect(redirectTo);
}
