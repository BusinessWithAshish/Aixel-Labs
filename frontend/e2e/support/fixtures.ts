import { test as base } from '@playwright/test';
import { E2eDb } from './db';
import { E2E_BASE_URL } from './env';

export const test = base.extend<{ db: E2eDb }>({
    // This worker's own app server (`env.ts`); the config cannot know which worker runs a test.
    baseURL: async ({}, provide) => provide(E2E_BASE_URL),
    // Named `provide` because `use` trips the React hooks lint rule.
    db: async ({}, provide) => {
        const db = await E2eDb.connect();
        await provide(db);
        await db.close();
    },
});

export { expect } from '@playwright/test';

/**
 * For a test whose app server calls a fake on this machine (a tool webhook, a recording link). A
 * production build refuses private addresses by design (`server/voice-agent/public-url.ts`), so
 * these run in a second, `next dev` pass: `pnpm e2e` does both.
 */
export const LOCAL_FETCH = { tag: '@local-fetch' };
