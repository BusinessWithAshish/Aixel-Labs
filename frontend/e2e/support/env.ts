import { generateKeyPairSync } from 'node:crypto';
import path from 'node:path';

/**
 * Everything the suite runs against is local and throwaway (see `e2e/docker-compose.yml`).
 * These values are forced onto the Next.js server in `playwright.config.ts`, overriding `.env`.
 */
export const E2E_PORT = 3103;
export const E2E_TENANT = 'e2e';
export const E2E_HOST = `${E2E_TENANT}.localhost`;
export const E2E_BASE_URL = `http://${E2E_HOST}:${E2E_PORT}`;

export const E2E_MONGODB_URI = 'mongodb://127.0.0.1:27018';
export const E2E_DB_NAME = 'AixelLabsE2E';

export const E2E_FIREBASE_PROJECT_ID = 'demo-aixel-e2e';
export const E2E_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

/** Closed port: an unmocked scrape fails fast instead of reaching a real backend. */
const E2E_BE_API = 'http://127.0.0.1:1';

/**
 * Run artifacts (sessions, traces, report) live outside the tree `next dev` watches:
 * files written inside `frontend/` during a run send the dev server into a rebuild loop.
 */
export const E2E_ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'node_modules', '.cache', 'e2e');
export const USER_STORAGE_STATE = path.join(E2E_ARTIFACTS_DIR, 'auth', 'user.json');
export const ADMIN_STORAGE_STATE = path.join(E2E_ARTIFACTS_DIR, 'auth', 'admin.json');

/** Env for the Next.js server under test. Next never overrides variables already set on the process. */
export function e2eServerEnv(): Record<string, string> {
    // `lib/firebase/admin.ts` requires a parseable service-account key; the emulator never checks it.
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    return {
        MONGODB_URI: E2E_MONGODB_URI,
        MONGODB_DB_NAME: E2E_DB_NAME,
        BE_API: E2E_BE_API,
        FIREBASE_AUTH_EMULATOR_HOST: E2E_AUTH_EMULATOR_HOST,
        FIREBASE_ADMIN_PROJECT_ID: E2E_FIREBASE_PROJECT_ID,
        FIREBASE_ADMIN_CLIENT_EMAIL: `e2e@${E2E_FIREBASE_PROJECT_ID}.iam.gserviceaccount.com`,
        FIREBASE_ADMIN_PRIVATE_KEY: privateKey,
    };
}
