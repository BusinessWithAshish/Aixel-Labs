import 'server-only';

import { AUTH_ERRORS, type AuthErrorCode } from '@/lib/auth/constants';

export type CreateMembershipDecision =
    | { allow: true; isAdmin: boolean }
    | { allow: false; reason: Extract<AuthErrorCode, 'WRONG_TENANT'> };

/**
 * Decide whether a Firebase identity may create a membership on this tenant.
 *
 * - No existing memberships → create as normal user.
 * - Admin elsewhere → create as admin on this tenant.
 * - Non-admin elsewhere → deny (one tenant only).
 */
export function decideCreateMembership(existingForUid: Array<{ isAdmin: boolean }>): CreateMembershipDecision {
    if (existingForUid.length === 0) {
        return { allow: true, isAdmin: false };
    }

    if (existingForUid.some((m) => m.isAdmin)) {
        return { allow: true, isAdmin: true };
    }

    return { allow: false, reason: 'WRONG_TENANT' };
}

export function authErrorMessage(reason: AuthErrorCode): string {
    return AUTH_ERRORS[reason];
}
