import 'server-only';

import { getFirebaseAdminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_EXPIRES_MS } from '@/lib/auth/constants';

export async function createSessionCookie(idToken: string): Promise<string> {
    return getFirebaseAdminAuth().createSessionCookie(idToken, {
        expiresIn: SESSION_COOKIE_EXPIRES_MS,
    });
}

export async function revokeSessionCookie(sessionCookie: string): Promise<void> {
    try {
        const adminAuth = getFirebaseAdminAuth();
        const decoded = await adminAuth.verifySessionCookie(sessionCookie);
        await adminAuth.revokeRefreshTokens(decoded.sub);
    } catch {
        // Cookie may already be invalid.
    }
}

export async function verifySessionCookie(sessionCookie: string) {
    return getFirebaseAdminAuth().verifySessionCookie(sessionCookie, true);
}
