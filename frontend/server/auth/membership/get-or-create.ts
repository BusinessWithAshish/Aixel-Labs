import 'server-only';

import { getCollection, MongoCollections, type TenantDoc, type UserDoc } from '@aixellabs/backend/db';
import { AUTH_ERRORS } from '@/lib/auth/constants';
import { authErrorMessage, decideCreateMembership } from '@/server/auth/policy';
import type { VerifiedIdentity } from '@/server/auth/identity/verify-id-token';
import { ensureMembershipIndexes } from '@/server/auth/membership/indexes';
import { mapDuplicateKeyError } from '@/server/auth/membership/duplicate-key';

export type GetOrCreateMembershipResult = { ok: true } | { ok: false; error: string; status: number };

function profileFields(identity: VerifiedIdentity, email: string, tenantName: string) {
    return {
        firebaseUid: identity.uid,
        email,
        phoneNumber: identity.phoneNumber,
        tenantName,
        ...(identity.name ? { name: identity.name } : {}),
    };
}

/**
 * Ensure a Mongo membership exists for this Firebase identity on the host tenant.
 * Policy: normal users = one tenant; admins = many.
 */
export async function getOrCreateMembership(
    identity: VerifiedIdentity,
    tenantSlug: string,
): Promise<GetOrCreateMembershipResult> {
    await ensureMembershipIndexes();

    const tenants = await getCollection<TenantDoc>(MongoCollections.TENANTS);
    const tenant = await tenants.findOne({ name: tenantSlug.toLowerCase() });
    if (!tenant?._id) {
        return { ok: false, error: AUTH_ERRORS.TENANT_NOT_FOUND, status: 404 };
    }

    const users = await getCollection<UserDoc>(MongoCollections.USERS);
    const email = identity.email.toLowerCase();
    const tenantName = tenant.name;

    try {
        const onTenant = await users.findOne({ firebaseUid: identity.uid, tenantId: tenant._id });
        if (onTenant) {
            await users.updateOne(
                { _id: onTenant._id },
                { $set: profileFields(identity, email, tenantName) },
            );
            return { ok: true };
        }

        const existingForUid = await users
            .find({ firebaseUid: identity.uid })
            .project<{ isAdmin: boolean }>({ isAdmin: 1 })
            .toArray();
        const decision = decideCreateMembership(existingForUid);

        if (!decision.allow) {
            return { ok: false, error: authErrorMessage(decision.reason), status: 403 };
        }

        const doc: UserDoc = {
            firebaseUid: identity.uid,
            email,
            phoneNumber: identity.phoneNumber,
            name: identity.name,
            isAdmin: decision.isAdmin,
            tenantId: tenant._id,
            tenantName,
            moduleAccess: decision.isAdmin ? {} : (tenant.defaultModuleAccess ?? {}),
            credits: 0,
        };
        await users.insertOne(doc);
        return { ok: true };
    } catch (error) {
        const conflict = mapDuplicateKeyError(error);
        if (conflict) return conflict;
        throw error;
    }
}
