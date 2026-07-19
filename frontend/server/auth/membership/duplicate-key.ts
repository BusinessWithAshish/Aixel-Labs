import 'server-only';

import { AUTH_ERRORS } from '@/lib/auth/constants';

type ConflictResult = { ok: false; error: string; status: number };

/** Map Mongo duplicate-key (E11000) to a user-facing membership conflict. */
export function mapDuplicateKeyError(error: unknown): ConflictResult | null {
    if (!error || typeof error !== 'object') return null;
    if (!('code' in error) || (error as { code: unknown }).code !== 11000) return null;

    const keyPattern =
        'keyPattern' in error && error.keyPattern && typeof error.keyPattern === 'object'
            ? (error.keyPattern as Record<string, unknown>)
            : {};

    if ('deviceFingerprint' in keyPattern) {
        return { ok: false, error: AUTH_ERRORS.DEVICE_IN_USE_ON_TENANT, status: 409 };
    }
    if ('email' in keyPattern) {
        return { ok: false, error: AUTH_ERRORS.EMAIL_IN_USE_ON_TENANT, status: 409 };
    }

    return { ok: false, error: AUTH_ERRORS.MEMBERSHIP_CONFLICT, status: 409 };
}
