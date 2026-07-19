import 'server-only';

import { headers } from 'next/headers';
import { extractSubdomain } from '@/middleware';
import { AUTH_ERRORS } from '@/lib/auth/constants';
import type { CreateSessionResult } from '@/lib/auth/types';
import { verifyIdToken } from '@/server/auth/identity/verify-id-token';
import { createSessionCookie } from '@/server/auth/identity/session-cookie';
import { getOrCreateMembership } from '@/server/auth/membership/get-or-create';

export type { CreateSessionResult } from '@/lib/auth/types';

/**
 * Verify Firebase ID token, ensure Mongo membership for the host tenant, return session cookie value.
 */
export async function exchangeIdTokenForSessionCookie(
    idToken: string,
    deviceFingerprint: string,
    requestHeaders: Headers,
): Promise<CreateSessionResult> {
    const fingerprint = deviceFingerprint.trim();
    if (!fingerprint) {
        return { ok: false, error: AUTH_ERRORS.MISSING_DEVICE_FINGERPRINT, status: 400 };
    }

    const { subdomain: tenantSlug } = extractSubdomain(requestHeaders);
    if (!tenantSlug) {
        return { ok: false, error: AUTH_ERRORS.TENANT_NOT_FOUND, status: 400 };
    }

    const verified = await verifyIdToken(idToken);
    if (!verified.ok) {
        return verified;
    }

    const membership = await getOrCreateMembership(verified.identity, tenantSlug, fingerprint);
    if (!membership.ok) {
        return membership;
    }

    try {
        const sessionCookie = await createSessionCookie(idToken);
        return { ok: true, sessionCookie };
    } catch (error) {
        console.error('Session cookie create failed:', error);
        return { ok: false, error: AUTH_ERRORS.AUTH_FAILED, status: 401 };
    }
}

export async function exchangeIdTokenForSessionCookieFromHeaders(
    idToken: string,
    deviceFingerprint: string,
): Promise<CreateSessionResult> {
    return exchangeIdTokenForSessionCookie(idToken, deviceFingerprint, await headers());
}
