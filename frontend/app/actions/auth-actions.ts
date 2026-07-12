'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME } from '@/lib/auth/types';

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
        name: SESSION_COOKIE_NAME,
        value: '',
        maxAge: 0,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    });

    redirect(redirectTo);
}
