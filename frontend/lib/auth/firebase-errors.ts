import { AUTH_TOAST } from '@/lib/auth/constants';

/**
 * Firebase Auth error codes we handle in the login UI.
 * @see https://firebase.google.com/docs/auth/admin/errors
 */
export const FIREBASE_AUTH_MESSAGES = {
    'auth/popup-closed-by-user': 'Google sign-in was cancelled. Try again when you are ready.',
    'auth/cancelled-popup-request': 'Google sign-in was cancelled. Try again.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in popup. Allow popups and try again.',
    'auth/account-exists-with-different-credential':
        'This email is already linked to a different Google account. Sign in with that Google account instead.',
    'auth/email-already-in-use':
        'This email is already registered with a different sign-in method. Use the original Google account.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/user-disabled': 'This account has been disabled. Contact support.',
    'auth/unauthorized-domain': 'This domain is not authorized for sign-in. Contact support.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled. Contact support.',
    'auth/internal-error': 'Something went wrong with authentication. Please try again.',
} as const;

export type FirebaseAuthErrorCode = keyof typeof FIREBASE_AUTH_MESSAGES;

export type AuthUserMessage = {
    title: string;
    description: string;
    code?: string;
};

function getFirebaseErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') return undefined;
    if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
        return (error as { code: string }).code;
    }
    return undefined;
}

/** Map a Firebase Auth client error to a user-facing toast message. */
export function mapFirebaseAuthError(error: unknown, fallbackTitle: string, fallbackDescription: string): AuthUserMessage {
    const code = getFirebaseErrorCode(error);
    if (code && code in FIREBASE_AUTH_MESSAGES) {
        return {
            title: fallbackTitle,
            description: FIREBASE_AUTH_MESSAGES[code as FirebaseAuthErrorCode],
            code,
        };
    }

    if (error instanceof Error && error.message && !error.message.startsWith('Firebase:')) {
        // Server createSession errors are plain Error(message) with AUTH_ERRORS text.
        return { title: fallbackTitle, description: error.message };
    }

    return { title: fallbackTitle, description: fallbackDescription, code };
}

export function mapGoogleSignInError(error: unknown): AuthUserMessage {
    return mapFirebaseAuthError(error, AUTH_TOAST.GOOGLE_FAILED, 'Google sign-in failed. Please try again.');
}

export function mapSessionCreateError(error: unknown): AuthUserMessage {
    return mapFirebaseAuthError(
        error,
        AUTH_TOAST.SESSION_FAILED,
        'Signed in with Google, but we could not create your organization session. Please try again.',
    );
}
