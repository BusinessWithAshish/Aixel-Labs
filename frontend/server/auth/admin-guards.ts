import 'server-only';

import { getAppSession, requireAppSession } from '@/server/auth/session/get-app-session';
import { getCollection, MongoCollections, MongoObjectId, type TenantDoc } from '@aixellabs/backend/db';
import type { AppSession } from '@/lib/auth/types';

export type AdminSessionContext = {
    session: AppSession;
    /** Mongo ObjectId of the caller's current host tenant. */
    tenantObjectId: MongoObjectId;
    /** Tenant slug (`name`) for the current host. */
    tenantName: string;
};

/**
 * Require an authenticated admin on the current host tenant.
 * Resolves the session tenant's Mongo ObjectId for scoping mutations.
 */
export async function requireAdminSessionContext(): Promise<AdminSessionContext> {
    const session = await requireAppSession();
    if (!session.user.isAdmin) {
        throw new Error('Unauthorized: admin access required');
    }

    const tenantName = session.user.tenantName;
    const tenantObjectId = await getTenantObjectIdByName(tenantName);

    return {
        session,
        tenantObjectId,
        tenantName,
    };
}

/** Admin check only (no tenant ObjectId resolution). */
export async function assertCallerIsAdmin(): Promise<AppSession> {
    const session = await getAppSession();
    if (!session?.user?.isAdmin) {
        throw new Error('Unauthorized: admin access required');
    }
    return session;
}

/** Resolve a tenant slug (`name`) to its Mongo ObjectId. Throws if missing. */
export async function getTenantObjectIdByName(tenantName: string): Promise<MongoObjectId> {
    const tenants = await getCollection<TenantDoc>(MongoCollections.TENANTS);
    const tenant = await tenants.findOne({ name: tenantName.trim() }, { projection: { _id: 1 } });
    if (!tenant?._id) {
        throw new Error('Tenant not found');
    }
    return tenant._id;
}
