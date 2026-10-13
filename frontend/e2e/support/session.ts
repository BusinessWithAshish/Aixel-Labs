import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { SESSION_COOKIE_EXPIRES_MS, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { E2E_AUTH_EMULATOR_HOST, E2E_FIREBASE_PROJECT_ID, E2E_HOST } from './env';
import type { E2eUser } from './users';

const EMULATOR_ORIGIN = `http://${E2E_AUTH_EMULATOR_HOST}`;

function emulatorAuth() {
    // The Admin SDK routes every call to the emulator once this is set.
    process.env.FIREBASE_AUTH_EMULATOR_HOST = E2E_AUTH_EMULATOR_HOST;
    const app = getApps()[0] ?? initializeApp({ projectId: E2E_FIREBASE_PROJECT_ID });
    return getAuth(app);
}

/** Removes every account so reruns start from the same identities. */
export async function clearEmulatorUsers(): Promise<void> {
    let res: Response;
    try {
        res = await fetch(`${EMULATOR_ORIGIN}/emulator/v1/projects/${E2E_FIREBASE_PROJECT_ID}/accounts`, {
            method: 'DELETE',
        });
    } catch (error) {
        throw new Error(
            `Firebase Auth emulator is not reachable at ${EMULATOR_ORIGIN}. Start the services first: pnpm e2e:services:up`,
            { cause: error },
        );
    }
    if (!res.ok) throw new Error(`Could not clear emulator accounts: ${res.status} ${await res.text()}`);
}

/**
 * Same exchange the app does after the Google popup, minus the popup: a fresh ID token
 * is traded for the httpOnly `__session` cookie that `getAppSession` verifies.
 */
async function mintSessionCookie(user: E2eUser): Promise<string> {
    const auth = emulatorAuth();
    await auth.createUser({
        uid: user.firebaseUid,
        email: user.email,
        displayName: user.name,
        emailVerified: true,
    });

    const customToken = await auth.createCustomToken(user.firebaseUid);
    const res = await fetch(
        `${EMULATOR_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=e2e`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: customToken, returnSecureToken: true }),
        },
    );
    if (!res.ok) throw new Error(`Emulator sign-in failed for ${user.email}: ${res.status} ${await res.text()}`);
    const { idToken } = (await res.json()) as { idToken: string };

    return auth.createSessionCookie(idToken, { expiresIn: SESSION_COOKIE_EXPIRES_MS });
}

/** Signs the user in and writes a Playwright storage state holding their session cookie. */
export async function saveSignedInState(user: E2eUser, file: string): Promise<void> {
    const value = await mintSessionCookie(user);
    const state = {
        cookies: [
            {
                name: SESSION_COOKIE_NAME,
                value,
                domain: E2E_HOST,
                path: '/',
                expires: Math.floor((Date.now() + SESSION_COOKIE_EXPIRES_MS) / 1000),
                httpOnly: true,
                secure: false,
                sameSite: 'Lax' as const,
            },
        ],
        origins: [],
    };
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(state, null, 4));
}
