import 'server-only';

import { getCollection, MongoCollections, type TenantDoc, type UserDoc } from '@aixellabs/backend/db';
import { AUTH_ERRORS } from '@/lib/auth/constants';
import { isDeviceFingerprintSkipped } from '@/lib/auth/device-fingerprint-config';
import { authErrorMessage, decideCreateMembership } from '@/server/auth/policy';
import type { VerifiedIdentity } from '@/server/auth/identity/verify-id-token';
import { ensureMembershipIndexes } from '@/server/auth/membership/indexes';
import { mapDuplicateKeyError } from '@/server/auth/membership/duplicate-key';

export type GetOrCreateMembershipResult = { ok: true } | { ok: false; error: string; status: number };

function resolveDeviceFingerprint(identity: VerifiedIdentity, deviceFingerprint: string): string {
    if (isDeviceFingerprintSkipped()) {
        return `local-dev:${identity.uid}`;
    }
    return deviceFingerprint;
}

/**
 * Ensure a Mongo membership exists for this Firebase identity on the host tenant.
 * Policy: normal users = one tenant; admins = many.
 * Uniqueness: one deviceFingerprint per tenant (blocks another account from the same browser).
 * Local: when NEXT_PUBLIC_SKIP_DEVICE_FINGERPRINT=true in development, uniqueness is not enforced.
 */
export async function getOrCreateMembership(
    identity: VerifiedIdentity,
    tenantSlug: string,
    deviceFingerprint: string,
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
    const skipFingerprintGate = isDeviceFingerprintSkipped();
    const fingerprint = resolveDeviceFingerprint(identity, deviceFingerprint);

    try {
        const onTenant = await users.findOne({ firebaseUid: identity.uid, tenantId: tenant._id });
        if (onTenant) {
            await users.updateOne(
                { _id: onTenant._id },
                {
                    $set: {
                        firebaseUid: identity.uid,
                        email,
                        tenantName,
                        ...(identity.name ? { name: identity.name } : {}),
                    },
                },
            );
            return { ok: true };
        }

        if (!skipFingerprintGate) {
            const fingerprintTaken = await users.findOne({
                deviceFingerprint: fingerprint,
                tenantId: tenant._id,
                firebaseUid: { $ne: identity.uid },
            });
            if (fingerprintTaken) {
                return { ok: false, error: AUTH_ERRORS.DEVICE_IN_USE_ON_TENANT, status: 409 };
            }
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
            deviceFingerprint: fingerprint,
            name: identity.name,
            isAdmin: decision.isAdmin,
            tenantId: tenant._id,
            tenantName,
            moduleAccess: decision.isAdmin ? {} : (tenant.defaultModuleAccess ?? {}),
            credits: tenant.defaultCredits ?? 0,
        };
        await users.insertOne(doc);
        return { ok: true };
    } catch (error) {
        const conflict = mapDuplicateKeyError(error);
        if (conflict) return conflict;
        throw error;
    }
}
