export { exchangeIdTokenForSessionCookie, exchangeIdTokenForSessionCookieFromHeaders } from '@/server/auth/create-session';
export { getAppSession, requireAppSession, getCurrentUserObjectId } from '@/server/auth/session/get-app-session';
export { revokeSessionCookie } from '@/server/auth/identity/session-cookie';
export {
    assertCallerIsAdmin,
    assertTenantIsSessionTenant,
    assertTenantNameIsSessionTenant,
    assertUserInSessionTenant,
    requireAdminSessionContext,
    type AdminSessionContext,
} from '@/server/auth/admin-guards';
