import type { Tenant, User } from '@aixellabs/backend/db';

export { AUTH_ERRORS, AUTH_TOAST, SESSION_COOKIE_EXPIRES_MS, SESSION_COOKIE_NAME, SIGN_IN_PATH } from '@/lib/auth/constants';

/**
 * App session user — profile fields from {@link User}, with session-specific id/tenant naming.
 * `tenantId` / `tenantName` are the tenant document `name` (not Mongo ObjectId).
 */
export type AppSessionUser = Pick<User, 'email' | 'name' | 'isAdmin' | 'moduleAccess' | 'tenantName'> & {
    id: NonNullable<User['_id']>;
    /** Tenant slug — same value as `tenantName`. */
    tenantId: Tenant['name'];
};

export type AppSession = {
    user: AppSessionUser;
};

export type CreateSessionResult = { ok: true; sessionCookie: string } | { ok: false; error: string; status: number };

export type CreateSessionActionResult = { success: true } | { success: false; error: string };
