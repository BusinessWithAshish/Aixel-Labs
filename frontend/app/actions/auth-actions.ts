'use server';

import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { sessionCookieClearOptions, sessionCookieSetOptions } from '@/lib/auth/cookies';
import type { CreateSessionActionResult } from '@/lib/auth/types';
import { exchangeIdTokenForSessionCookieFromHeaders, revokeSessionCookie } from '@/server/auth';

export type { CreateSessionActionResult } from '@/lib/auth/types';

export async function createSession(
    idToken: string,
    deviceFingerprint: string,
): Promise<CreateSessionActionResult> {
    const result = await exchangeIdTokenForSessionCookieFromHeaders(idToken, deviceFingerprint);
    if (!result.ok) {
        return { success: false, error: result.error };
    }

    (await cookies()).set(sessionCookieSetOptions(result.sessionCookie));
    return { success: true };
}

/**
 * Clear session cookie and revoke refresh tokens.
 * Caller should hard-navigate to sign-in so tenant branding reloads with the current host.
 */
export async function handleSignOut(): Promise<void> {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (sessionCookie) {
        await revokeSessionCookie(sessionCookie);
    }
    cookieStore.set(sessionCookieClearOptions());
}
