import 'server-only';

import { headers } from 'next/headers';
import { getCollection, MongoCollections, type TenantDoc, type UserDoc } from '@aixellabs/backend/db';
import { extractSubdomain } from '@/middleware';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';
import { ensureUserAuthIndexes } from '@/lib/auth/ensure-user-indexes';
import { SESSION_COOKIE_EXPIRES_MS, SESSION_COOKIE_NAME } from '@/lib/auth/types';

export type CreateSessionResult =
    | { ok: true; sessionCookie: string }
    | { ok: false; error: string; status: number };

/**
 * Verify a Firebase ID token and upsert the Mongo user for the current tenant.
 * Returns a Firebase session cookie value (caller sets the httpOnly cookie).
 */
export async function exchangeIdTokenForSessionCookie(
    idToken: string,
    requestHeaders: Headers,
): Promise<CreateSessionResult> {
    if (!idToken) {
        return { ok: false, error: 'Missing idToken', status: 400 };
    }

    const { subdomain: tenantName } = extractSubdomain(requestHeaders);
    if (!tenantName) {
        return { ok: false, error: 'Tenant not found', status: 400 };
    }

    try {
        const adminAuth = getFirebaseAdminAuth();
        const decoded = await adminAuth.verifyIdToken(idToken);

        if (!decoded.phone_number) {
            return { ok: false, error: 'Phone number verification required', status: 403 };
        }

        if (!decoded.email) {
            return { ok: false, error: 'Email is required', status: 403 };
        }

        await ensureUserAuthIndexes();

        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        const tenant = await tenantsCollection.findOne({ name: tenantName.toLowerCase() });
        if (!tenant?._id) {
            return { ok: false, error: 'Tenant not found', status: 404 };
        }

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const email = decoded.email.toLowerCase();

        // Prefer Firebase UID; fall back to legacy email+tenant users (pre-Firebase accounts).
        let existing = await usersCollection.findOne({ firebaseUid: decoded.uid });
        if (!existing) {
            existing = await usersCollection.findOne({ email, tenantId: tenant._id });
        }

        if (existing) {
            if (!existing.tenantId.equals(tenant._id)) {
                return { ok: false, error: 'Account is registered to a different organization', status: 403 };
            }

            if (existing.firebaseUid && existing.firebaseUid !== decoded.uid) {
                return {
                    ok: false,
                    error: 'This email is already linked to a different Google account',
                    status: 403,
                };
            }

            await usersCollection.updateOne(
                { _id: existing._id },
                {
                    $set: {
                        firebaseUid: decoded.uid,
                        email,
                        phoneNumber: decoded.phone_number,
                        ...(decoded.name ? { name: decoded.name } : {}),
                    },
                    $unset: { password: '' },
                },
            );
        } else {
            const doc: UserDoc = {
                firebaseUid: decoded.uid,
                email,
                phoneNumber: decoded.phone_number,
                name: decoded.name ?? undefined,
                isAdmin: false,
                tenantId: tenant._id,
                moduleAccess: {},
                credits: 0,
            };
            await usersCollection.insertOne(doc);
        }

        const sessionCookie = await adminAuth.createSessionCookie(idToken, {
            expiresIn: SESSION_COOKIE_EXPIRES_MS,
        });

        return { ok: true, sessionCookie };
    } catch (error) {
        console.error('Session create failed:', error);
        return { ok: false, error: 'Authentication failed', status: 401 };
    }
}

/** Convenience for server actions: read request headers automatically. */
export async function exchangeIdTokenForSessionCookieFromHeaders(idToken: string): Promise<CreateSessionResult> {
    return exchangeIdTokenForSessionCookie(idToken, await headers());
}

export const sessionCookieOptions = {
    name: SESSION_COOKIE_NAME,
    maxAge: SESSION_COOKIE_EXPIRES_MS / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
};
