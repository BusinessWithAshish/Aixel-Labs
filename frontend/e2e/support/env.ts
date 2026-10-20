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
 * Voice agents. A spec that needs the real engine starts `phone.py --port 7862` against the e2e
 * Mongo with the same secret; otherwise the port is closed and engine calls fail fast. Telnyx's
 * API is replaced by a local fake on 7863 (`TELNYX_API_BASE`), so no test touches a real account.
 */
export const E2E_VOICE_ENGINE_URL = 'http://127.0.0.1:7862';
/** `engine-live.spec.ts` runs the real engine, which signs with its own `VOICELAB_KEY`: pass it in here. */
export const E2E_VOICE_ENGINE_SECRET = process.env.E2E_VOICE_ENGINE_SECRET || 'e2e-voice-engine-secret';
export const E2E_TELNYX_API_BASE = 'http://127.0.0.1:7863';
/** VoiceLink's API is replaced by a local fake on 7864 the same way. */
export const E2E_VOICELINK_API_BASE = 'http://127.0.0.1:7864';
/**
 * Twilio's REST API is replaced by a local fake on 7865 the same way. Its recordings' media links
 * point at 127.0.0.2:7865, another origin, as Twilio's own links point at another host.
 */
export const E2E_TWILIO_API_BASE = 'http://127.0.0.1:7865';
export const E2E_TWILIO_MEDIA_BASE = 'http://127.0.0.2:7865';
/**
 * Composio (customers' own booking apps) is replaced by a local fake on 7874: auth configs,
 * sessions (direct tools preset) with their Connect Links (a page that sends the browser straight
 * back) and tool runs, connected accounts.
 * The key is made up and only the fake accepts it.
 */
export const E2E_COMPOSIO_ORIGIN = 'http://127.0.0.1:7874';
export const E2E_COMPOSIO_API_BASE = `${E2E_COMPOSIO_ORIGIN}/api/v3.1`;
export const E2E_COMPOSIO_API_KEY = 'ck_e2e_fake_composio_key_not_real';

/**
 * Gemini: customers bring their own API key, which the app checks with Google before saving. Here
 * Google's API is a local fake on 7879 (`GEMINI_API_BASE`, started by `gemini-key.spec.ts`). The seeded
 * user has a key so the voice specs can run calls; the `engine-live*` specs reach the real model and
 * need a real one: pass `E2E_GEMINI_API_KEY`.
 */
export const E2E_GEMINI_API_BASE = 'http://127.0.0.1:7879';
export const E2E_GEMINI_API_KEY = process.env.E2E_GEMINI_API_KEY || 'AIzaE2eSeededFakeGeminiKey000000000000';

/** Lets a spec turn a feature flag on for its own browser (`vercel-flag-overrides` cookie). Test-only key. */
export const E2E_FLAGS_SECRET = 'u0ZfEr2WbJ1xqk6c3aT9yLmN8pQvHs4dG7oKiXeA5Bw';

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
        VOICE_ENGINE_URL: E2E_VOICE_ENGINE_URL,
        VOICE_ENGINE_SECRET: E2E_VOICE_ENGINE_SECRET,
        TELNYX_API_BASE: E2E_TELNYX_API_BASE,
        VOICELINK_API_BASE: E2E_VOICELINK_API_BASE,
        TWILIO_API_BASE: E2E_TWILIO_API_BASE,
        COMPOSIO_API_BASE: E2E_COMPOSIO_API_BASE,
        COMPOSIO_API_KEY: E2E_COMPOSIO_API_KEY,
        GEMINI_API_BASE: E2E_GEMINI_API_BASE,
        FLAGS_SECRET: E2E_FLAGS_SECRET,
        FIREBASE_AUTH_EMULATOR_HOST: E2E_AUTH_EMULATOR_HOST,
        FIREBASE_ADMIN_PROJECT_ID: E2E_FIREBASE_PROJECT_ID,
        FIREBASE_ADMIN_CLIENT_EMAIL: `e2e@${E2E_FIREBASE_PROJECT_ID}.iam.gserviceaccount.com`,
        FIREBASE_ADMIN_PRIVATE_KEY: privateKey,
    };
}
