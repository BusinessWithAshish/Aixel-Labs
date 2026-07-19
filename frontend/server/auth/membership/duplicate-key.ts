import 'server-only';

import { AUTH_ERRORS } from '@/lib/auth/constants';

/** MongoDB E11000 duplicate-key error code. */
export const DUPLICATE_KEY_CODE = 11000;

/** Shape of a Mongo E11000 duplicate-key error (subset used by callers). */
export type MongoDuplicateKeyError = { code: typeof DUPLICATE_KEY_CODE; keyPattern?: Record<string, unknown> };

/** Returns true when `error` is a Mongo E11000 duplicate-key error. */
export function isMongoDuplicateKeyError(error: unknown): error is MongoDuplicateKeyError {
    return Boolean(
        error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as { code: unknown }).code === DUPLICATE_KEY_CODE,
    );
}

type ConflictResult = { ok: false; error: string; status: number };

/** Map Mongo duplicate-key (E11000) to a user-facing membership conflict. */
export function mapDuplicateKeyError(error: unknown): ConflictResult | null {
    if (!isMongoDuplicateKeyError(error)) return null;

    const keyPattern = error.keyPattern ?? {};

    if ('deviceFingerprint' in keyPattern) {
        return { ok: false, error: AUTH_ERRORS.DEVICE_IN_USE_ON_TENANT, status: 409 };
    }
    if ('email' in keyPattern) {
        return { ok: false, error: AUTH_ERRORS.EMAIL_IN_USE_ON_TENANT, status: 409 };
    }

    return { ok: false, error: AUTH_ERRORS.MEMBERSHIP_CONFLICT, status: 409 };
}
