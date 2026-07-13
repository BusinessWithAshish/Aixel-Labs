/** Firebase session cookie name (httpOnly). */
export const SESSION_COOKIE_NAME = '__session';

/** Session cookie lifetime: 5 days (Firebase Admin max is 14 days). */
export const SESSION_COOKIE_EXPIRES_MS = 60 * 60 * 24 * 5 * 1000;

export const SIGN_IN_PATH = '/sign-in';

/**
 * Server / Mongo membership errors returned from createSession / upsert.
 * These strings are shown directly to the user (toast description).
 */
export const AUTH_ERRORS = {
    MISSING_ID_TOKEN: 'Sign-in session was incomplete. Please try again.',
    TENANT_NOT_FOUND: 'This organization could not be found. Check the URL and try again.',
    PHONE_REQUIRED: 'Phone verification is required before you can continue.',
    EMAIL_REQUIRED: 'A Google account with an email address is required.',
    WRONG_TENANT:
        'This account belongs to a different organization. Sign in from that organization, or ask an admin for access.',
    PHONE_IN_USE_ON_TENANT: 'This phone number is already used by another account on this organization.',
    EMAIL_IN_USE_ON_TENANT: 'This email is already used by another account on this organization.',
    MEMBERSHIP_CONFLICT:
        'This sign-in conflicts with an existing account on this organization. Try a different Google account or contact support.',
    AUTH_FAILED: 'Authentication failed. Please try signing in again.',
    UNAUTHORIZED: 'Unauthorized',
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERRORS;

/** Toast titles by login step (client). */
export const AUTH_TOAST = {
    GOOGLE_FAILED: 'Google sign-in failed',
    PHONE_FAILED: 'Phone verification failed',
    OTP_FAILED: 'Code verification failed',
    SESSION_FAILED: 'Could not finish sign-in',
    SESSION_EXPIRED: 'Session expired',
    NO_OTP: 'No verification in progress',
    CODE_SENT: 'Code sent',
    VERIFY_PHONE: 'Verify your phone',
    WELCOME: 'Welcome!',
} as const;

/** How long auth error toasts stay visible (ms). */
export const AUTH_ERROR_TOAST_DURATION_MS = 11_000;
