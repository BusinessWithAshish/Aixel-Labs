import type { Tenant, User } from '@aixellabs/backend/db';

export const SESSION_COOKIE_NAME = '__session';

/** Session cookie lifetime: 5 days (Firebase Admin max is 14 days). */
export const SESSION_COOKIE_EXPIRES_MS = 60 * 60 * 24 * 5 * 1000;

/**
 * App session user — profile fields from {@link User}, with session-specific id/tenant naming.
 * `tenantId` / `tenantName` are the tenant document `name` (not Mongo ObjectId).
 */
export type AppSessionUser = Pick<User, 'email' | 'name' | 'isAdmin' | 'moduleAccess' | 'phoneNumber'> & {
    id: NonNullable<User['_id']>;
    tenantId: Tenant['name'];
    tenantName: Tenant['name'];
};

export type AppSession = {
    user: AppSessionUser;
};
