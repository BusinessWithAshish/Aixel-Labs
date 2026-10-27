import { CONTENT_LAB_ERROR_MESSAGES } from '@aixellabs/backend/content-lab/constants';
import { Modules } from '@aixellabs/backend/db/types';
import { CONTENT_LAB_API_ROUTES } from '@/config/app-config';
import { getDefaultModuleAccess } from '@/helpers/module-access-helpers';
import { expect, test } from '../support/fixtures';
import { E2E_BASE_URL, E2E_GEMINI_API_KEY, USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';

/** The real BFF routes (nothing mocked): sign-in, access, validation, the owner's key, and a backend that is down. */
const EXPLORE_BODY = { query: 'protein breakfast' };

test.describe('Content Lab BFF · signed out', () => {
    test('every route answers 401', async ({ playwright }) => {
        const api = await playwright.request.newContext({ baseURL: E2E_BASE_URL, storageState: { cookies: [], origins: [] } });
        for (const route of Object.values(CONTENT_LAB_API_ROUTES)) {
            const res = await api.post(route, { data: EXPLORE_BODY });
            expect(res.status(), route).toBe(401);
            expect(await res.json()).toEqual({ success: false, error: 'Unauthorized' });
        }
        await api.dispose();
    });
});

test.describe('Content Lab BFF · signed in', () => {
    test.use({ storageState: USER_STORAGE_STATE });
    test.beforeEach(async ({ db }) => {
        await db.resetUser(E2E_USER);
        await db.setVoiceGeminiKey(E2E_USER, E2E_GEMINI_API_KEY);
    });

    test('a user without Content Lab gets 403', async ({ db, request }) => {
        await db.resetUser(E2E_USER, { moduleAccess: { ...getDefaultModuleAccess(), [Modules.CONTENT_LAB]: [] } });
        const res = await request.post(CONTENT_LAB_API_ROUTES.EXPLORE, { data: EXPLORE_BODY });
        expect(res.status()).toBe(403);
    });

    test('a bad body gets 400 from the backend schema', async ({ request }) => {
        const res = await request.post(CONTENT_LAB_API_ROUTES.CHECK, { data: { text: '', platform: 'tiktok' } });
        expect(res.status()).toBe(400);
        expect((await res.json()).error).toBe(CONTENT_LAB_ERROR_MESSAGES.INVALID_PARAMS);
    });

    test('a backend that is down gets 502 without its address', async ({ request }) => {
        const res = await request.post(CONTENT_LAB_API_ROUTES.EXPLORE, { data: EXPLORE_BODY });
        expect(res.status()).toBe(502);
        expect((await res.json()).error).toBe('Service is temporarily unavailable');
    });

    test('write without a Gemini key says where to add it', async ({ db, request }) => {
        await db.setVoiceGeminiKey(E2E_USER, null);
        const res = await request.post(CONTENT_LAB_API_ROUTES.WRITE, {
            data: { mode: 'rewrites', draft: 'My routine', platform: 'youtube', language: 'English', context: {} },
        });
        expect(res.status()).toBe(400);
        expect((await res.json()).error).toContain('Content Lab > Settings');
    });
});
