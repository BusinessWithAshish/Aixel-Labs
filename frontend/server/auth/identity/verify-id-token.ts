import 'server-only';

import type { DecodedIdToken } from 'firebase-admin/auth';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';
import { AUTH_ERRORS } from '@/lib/auth/constants';

export type VerifiedIdentity = {
    uid: string;
    email: string;
    phoneNumber: string;
    name?: string;
};

export type VerifyIdTokenResult =
    | { ok: true; identity: VerifiedIdentity; decoded: DecodedIdToken }
    | { ok: false; error: string; status: number };

export async function verifyIdToken(idToken: string): Promise<VerifyIdTokenResult> {
    if (!idToken) {
        return { ok: false, error: AUTH_ERRORS.MISSING_ID_TOKEN, status: 400 };
    }

    try {
        const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);

        if (!decoded.phone_number) {
            return { ok: false, error: AUTH_ERRORS.PHONE_REQUIRED, status: 403 };
        }
        if (!decoded.email) {
            return { ok: false, error: AUTH_ERRORS.EMAIL_REQUIRED, status: 403 };
        }

        return {
            ok: true,
            decoded,
            identity: {
                uid: decoded.uid,
                email: decoded.email,
                phoneNumber: decoded.phone_number,
                name: decoded.name,
            },
        };
    } catch (error) {
        console.error('verifyIdToken failed:', error);
        return { ok: false, error: AUTH_ERRORS.AUTH_FAILED, status: 401 };
    }
}
