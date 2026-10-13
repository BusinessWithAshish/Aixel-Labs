import { test as base } from '@playwright/test';
import { E2eDb } from './db';

export const test = base.extend<{ db: E2eDb }>({
    // Named `provide` because `use` trips the React hooks lint rule.
    db: async ({}, provide) => {
        const db = await E2eDb.connect();
        await provide(db);
        await db.close();
    },
});

export { expect } from '@playwright/test';
