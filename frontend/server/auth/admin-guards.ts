import 'server-only';

import { getAppSession, requireAppSession } from '@/server/auth/session/get-app-session';
import { getCollection, MongoCollections, MongoObjectId, type TenantDoc, type UserDoc } from '@aixellabs/backend/db';
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
    const tenants = await getCollection<TenantDoc>(MongoCollections.TENANTS);
    const tenant = await tenants.findOne({ name: tenantName }, { projection: { _id: 1, name: 1 } });
    if (!tenant?._id) {
        throw new Error('Tenant not found for current session');
    }

    return {
        session,
        tenantObjectId: tenant._id,
        tenantName: tenant.name,
    };
}

/** Admin check only (no tenant ObjectId resolution). Prefer {@link requireAdminSessionContext} for mutations. */
export async function assertCallerIsAdmin(): Promise<AppSession> {
    const session = await getAppSession();
    if (!session?.user?.isAdmin) {
        throw new Error('Unauthorized: admin access required');
    }
    return session;
}

export function assertUserInSessionTenant(
    user: Pick<UserDoc, 'tenantId'>,
    sessionTenantObjectId: MongoObjectId,
): void {
    if (!user.tenantId.equals(sessionTenantObjectId)) {
        throw new Error('Unauthorized: user belongs to another tenant');
    }
}

export function assertTenantIsSessionTenant(
    tenant: Pick<TenantDoc, '_id' | 'name'>,
    ctx: Pick<AdminSessionContext, 'tenantObjectId' | 'tenantName'>,
): void {
    const idMatch = tenant._id != null && tenant._id.equals(ctx.tenantObjectId);
    const nameMatch = tenant.name === ctx.tenantName;
    if (!idMatch && !nameMatch) {
        throw new Error('Unauthorized: cannot modify another tenant');
    }
}

export function assertTenantNameIsSessionTenant(tenantName: string, sessionTenantName: string): void {
    if (tenantName.trim() !== sessionTenantName) {
        throw new Error('Unauthorized: tenant is outside your current session');
    }
}
