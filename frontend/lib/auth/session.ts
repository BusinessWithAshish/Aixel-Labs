import 'server-only';

import { cookies } from 'next/headers';
import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    type TenantDoc,
    type UserDoc,
} from '@aixellabs/backend/db';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME, type AppSession } from '@/lib/auth/types';

/**
 * Verifies the Firebase session cookie and loads the Mongo user profile.
 * Used by route guards, server actions, and API routes.
 */
export async function getAppSession(): Promise<AppSession | null> {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
        return null;
    }

    try {
        const decoded = await getFirebaseAdminAuth().verifySessionCookie(sessionCookie, true);
        const firebaseUid = decoded.uid;

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);

        const user = await usersCollection.findOne({ firebaseUid });
        if (!user?._id) {
            return null;
        }

        const tenant = await tenantsCollection.findOne({ _id: user.tenantId });
        if (!tenant?.name) {
            return null;
        }

        return {
            user: {
                id: user._id.toString(),
                email: user.email,
                name: user.name,
                isAdmin: user.isAdmin,
                tenantId: tenant.name,
                tenantName: tenant.name,
                moduleAccess: user.moduleAccess,
                phoneNumber: user.phoneNumber,
            },
        };
    } catch {
        return null;
    }
}

export async function requireAppSession(): Promise<AppSession> {
    const session = await getAppSession();
    if (!session?.user) {
        throw new Error('Unauthorized');
    }
    return session;
}

/** Convenience: Mongo ObjectId of the authenticated user, or null. */
export async function getCurrentUserObjectId(): Promise<MongoObjectId | null> {
    const session = await getAppSession();
    if (!session?.user?.id) {
        return null;
    }
    return new MongoObjectId(session.user.id);
}
