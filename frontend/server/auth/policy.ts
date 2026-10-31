import 'server-only';

import { PREVIEW_TENANT } from '@/flags';
import { AUTH_ERRORS, type AuthErrorCode } from '@/lib/auth/constants';

export type CreateMembershipDecision =
    | { allow: true; isAdmin: boolean }
    | { allow: false; reason: Extract<AuthErrorCode, 'WRONG_TENANT' | 'ADMIN_ONLY_TENANT'> };

/** Tenants where only existing admins may sign up. */
const ADMIN_ONLY_TENANTS: ReadonlySet<string> = new Set([PREVIEW_TENANT]);

/**
 * Decide whether a Firebase identity may create a membership on this tenant.
 *
 * - Admin elsewhere → create as admin on this tenant.
 * - Admin-only tenant (e.g. `test`) → deny everyone else.
 * - No existing memberships → create as normal user.
 * - Non-admin elsewhere → deny (one tenant only).
 */
export function decideCreateMembership(
    existingForUid: Array<{ isAdmin: boolean }>,
    tenantName: string,
): CreateMembershipDecision {
    if (existingForUid.some((m) => m.isAdmin)) {
        return { allow: true, isAdmin: true };
    }

    if (ADMIN_ONLY_TENANTS.has(tenantName)) {
        return { allow: false, reason: 'ADMIN_ONLY_TENANT' };
    }

    if (existingForUid.length === 0) {
        return { allow: true, isAdmin: false };
    }

    return { allow: false, reason: 'WRONG_TENANT' };
}

export function authErrorMessage(reason: AuthErrorCode): string {
    return AUTH_ERRORS[reason];
}
