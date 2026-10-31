import { generateKeyPairSync } from 'node:crypto';
import path from 'node:path';

/**
 * Everything the suite runs against is local and throwaway (see `e2e/docker-compose.yml`).
 * These values are forced onto the Next.js servers in `playwright.config.ts`, overriding `.env`.
 *
 * Each Playwright worker gets its own stack, so specs never share state: an app server on
 * `3103 + worker`, its own database, and the fake APIs' ports shifted by 20 per worker. Worker 0
 * keeps the original values, which the engine-live specs' instructions rely on.
 */
/** `E2E_DEV=1`: one `next dev` server and one worker, no build (routes compile on first hit). */
export const E2E_DEV = process.env.E2E_DEV === '1';
export const E2E_WORKERS = E2E_DEV ? 1 : Number(process.env.E2E_WORKERS || 3);
/** Where `pnpm e2e:build` puts the production build the servers run, apart from `next dev`'s `.next`. */
export const E2E_DIST_DIR = '.next-e2e';
/** Set inside a test worker; the config and global setup run as worker 0. */
const WORKER = Number(process.env.TEST_PARALLEL_INDEX || 0);

/**
 * Two runs on one box (e.g. two branches' sessions) collide on ports, databases and emulator
 * accounts. Each run can move all three; the defaults are the suite's usual values.
 */
const E2E_PORT_BASE = Number(process.env.E2E_PORT_BASE || 3103);
const E2E_DB_PREFIX = process.env.E2E_DB_PREFIX || 'AixelLabsE2E';

const shift = (worker: number) => worker * 20;
export const e2ePort = (worker: number) => E2E_PORT_BASE + worker;
export const e2eBaseUrl = (worker: number) => `http://${E2E_HOST}:${e2ePort(worker)}`;
export const e2eDbName = (worker: number) => (worker === 0 ? E2E_DB_PREFIX : `${E2E_DB_PREFIX}${worker}`);

export const E2E_PORT = e2ePort(WORKER);
export const E2E_TENANT = 'e2e';
export const E2E_HOST = `${E2E_TENANT}.localhost`;
export const E2E_BASE_URL = e2eBaseUrl(WORKER);

export const E2E_MONGODB_URI = 'mongodb://127.0.0.1:27018';
export const E2E_DB_NAME = e2eDbName(WORKER);

/** One project for every run: the emulator signs custom tokens in only to its default project. */
export const E2E_FIREBASE_PROJECT_ID = 'demo-aixel-e2e';
export const E2E_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

/**
 * The scrapers are a local fake on 7880, started by `mockScrape`. Until a spec does, the port is
 * closed and a scrape fails fast instead of reaching a real backend.
 */
const beApi = (worker: number) => `http://127.0.0.1:${7880 + shift(worker)}`;
export const E2E_BE_API = beApi(WORKER);

/**
 * Voice agents. A spec that needs the real engine starts `phone.py --port 7862` against the e2e
 * Mongo with the same secret; otherwise the port is closed and engine calls fail fast. Telnyx's
 * API is replaced by a local fake on 7863 (`TELNYX_API_BASE`), so no test touches a real account.
 */
const voiceEngineUrl = (worker: number) => `http://127.0.0.1:${7862 + shift(worker)}`;
export const E2E_VOICE_ENGINE_URL = voiceEngineUrl(WORKER);
/** `engine-live.spec.ts` runs the real engine, which signs with its own `VOICELAB_KEY`: pass it in here. */
export const E2E_VOICE_ENGINE_SECRET = process.env.E2E_VOICE_ENGINE_SECRET || 'e2e-voice-engine-secret';
const telnyxApiBase = (worker: number) => `http://127.0.0.1:${7863 + shift(worker)}`;
export const E2E_TELNYX_API_BASE = telnyxApiBase(WORKER);
/** VoiceLink's API is replaced by a local fake on 7864 the same way. */
const voicelinkApiBase = (worker: number) => `http://127.0.0.1:${7864 + shift(worker)}`;
export const E2E_VOICELINK_API_BASE = voicelinkApiBase(WORKER);
/**
 * Twilio's REST API is replaced by a local fake on 7865 the same way. Its recordings' media links
 * point at 127.0.0.2:7865, another origin, as Twilio's own links point at another host.
 */
const twilioApiBase = (worker: number) => `http://127.0.0.1:${7865 + shift(worker)}`;
export const E2E_TWILIO_API_BASE = twilioApiBase(WORKER);
export const E2E_TWILIO_MEDIA_BASE = `http://127.0.0.2:${7865 + shift(WORKER)}`;
/**
 * Composio (customers' own booking apps) is replaced by a local fake on 7874: auth configs,
 * sessions (direct tools preset) with their Connect Links (a page that sends the browser straight
 * back) and tool runs, connected accounts.
 * The key is made up and only the fake accepts it.
 */
const composioApiBase = (worker: number) => `http://127.0.0.1:${7874 + shift(worker)}/api/v3.1`;
export const E2E_COMPOSIO_API_BASE = composioApiBase(WORKER);
export const E2E_COMPOSIO_ORIGIN = new URL(E2E_COMPOSIO_API_BASE).origin;
export const E2E_COMPOSIO_API_KEY = 'ck_e2e_fake_composio_key_not_real';

/**
 * Gemini: customers bring their own API key, which the app checks with Google before saving. Here
 * Google's API is a local fake on 7879 (`GEMINI_API_BASE`, started by `gemini-key.spec.ts`). The seeded
 * user has a key so the voice specs can run calls; the `engine-live*` specs reach the real model and
 * need a real one: pass `E2E_GEMINI_API_KEY`.
 */
const geminiApiBase = (worker: number) => `http://127.0.0.1:${7879 + shift(worker)}`;
export const E2E_GEMINI_API_BASE = geminiApiBase(WORKER);
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

/** Env for one worker's Next.js server. Next never overrides variables already set on the process. */
export function e2eServerEnv(worker: number): Record<string, string> {
    // `lib/firebase/admin.ts` requires a parseable service-account key; the emulator never checks it.
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    return {
        MONGODB_URI: E2E_MONGODB_URI,
        MONGODB_DB_NAME: e2eDbName(worker),
        BE_API: beApi(worker),
        VOICE_ENGINE_URL: voiceEngineUrl(worker),
        VOICE_ENGINE_SECRET: E2E_VOICE_ENGINE_SECRET,
        TELNYX_API_BASE: telnyxApiBase(worker),
        VOICELINK_API_BASE: voicelinkApiBase(worker),
        TWILIO_API_BASE: twilioApiBase(worker),
        COMPOSIO_API_BASE: composioApiBase(worker),
        COMPOSIO_API_KEY: E2E_COMPOSIO_API_KEY,
        GEMINI_API_BASE: geminiApiBase(worker),
        // The other providers' key checks and voice lists, on the same fake (`/providers/{provider}/…`).
        VOICE_PROVIDER_API_BASE: `${geminiApiBase(worker)}/providers`,
        // The model catalogue (Vercel AI Gateway's /v1/models), on the same fake; unreachable = the rates file's models.
        VOICE_CATALOGUE_URL: `${geminiApiBase(worker)}/providers/gateway/v1/models`,
        FLAGS_SECRET: E2E_FLAGS_SECRET,
        FIREBASE_AUTH_EMULATOR_HOST: E2E_AUTH_EMULATOR_HOST,
        FIREBASE_ADMIN_PROJECT_ID: E2E_FIREBASE_PROJECT_ID,
        FIREBASE_ADMIN_CLIENT_EMAIL: `e2e@${E2E_FIREBASE_PROJECT_ID}.iam.gserviceaccount.com`,
        FIREBASE_ADMIN_PRIVATE_KEY: privateKey,
    };
}
