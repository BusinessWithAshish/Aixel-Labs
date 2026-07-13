import 'server-only';

import { cookies, headers } from 'next/headers';
import { getCollection, MongoCollections, MongoObjectId, type TenantDoc, type UserDoc } from '@aixellabs/backend/db';
import { extractSubdomain } from '@/middleware';
import { AUTH_ERRORS, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import type { AppSession } from '@/lib/auth/types';
import { verifySessionCookie } from '@/server/auth/identity/session-cookie';
import { mapUserDocToAppSessionUser } from '@/server/auth/session/map-session-user';

type UserWithId = UserDoc & { _id: NonNullable<UserDoc['_id']> };

/** Membership for this Firebase UID on the current host tenant only. */
async function findHostMembership(firebaseUid: string): Promise<UserWithId | null> {
    const { subdomain } = extractSubdomain(await headers());
    const tenantSlug = subdomain?.toLowerCase();
    if (!tenantSlug) return null;

    const users = await getCollection<UserDoc>(MongoCollections.USERS);
    const byName = await users.findOne({ firebaseUid, tenantName: tenantSlug });
    if (byName?._id) return byName as UserWithId;

    const tenants = await getCollection<TenantDoc>(MongoCollections.TENANTS);
    const tenant = await tenants.findOne({ name: tenantSlug }, { projection: { _id: 1 } });
    if (!tenant?._id) return null;

    const byId = await users.findOne({ firebaseUid, tenantId: tenant._id });
    return byId?._id ? (byId as UserWithId) : null;
}

/**
 * Verifies the Firebase session cookie and loads the Mongo membership for this host.
 */
export async function getAppSession(): Promise<AppSession | null> {
    const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) return null;

    try {
        const decoded = await verifySessionCookie(sessionCookie);
        const user = await findHostMembership(decoded.uid);
        if (!user?.tenantName) return null;
        return { user: mapUserDocToAppSessionUser(user, user.tenantName) };
    } catch {
        return null;
    }
}

export async function requireAppSession(): Promise<AppSession> {
    const session = await getAppSession();
    if (!session?.user) {
        throw new Error(AUTH_ERRORS.UNAUTHORIZED);
    }
    return session;
}

export async function getCurrentUserObjectId(): Promise<MongoObjectId | null> {
    const session = await getAppSession();
    if (!session?.user?.id) return null;
    return new MongoObjectId(session.user.id);
}
