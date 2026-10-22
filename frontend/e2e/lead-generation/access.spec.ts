import { LEAD_GENERATION_SUB_MODULES, Modules } from '@aixellabs/backend/db/types';
import { LEAD_GEN_SCRAPE_API_ROUTE } from '@/config/app-config';
import { SIGN_IN_PATH } from '@/lib/auth/constants';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { GOOGLE_ADVANCED_SEARCH_URL } from '../support/lead-gen';
import { E2E_USER } from '../support/users';

test.describe('signed out', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('is sent to sign-in', async ({ page }) => {
        await page.goto(GOOGLE_ADVANCED_SEARCH_URL);
        await expect(page).toHaveURL(new RegExp(`${SIGN_IN_PATH}$`));
    });

    test('cannot call the scrape API', async ({ request }) => {
        const res = await request.post(LEAD_GEN_SCRAPE_API_ROUTE, {
            data: { subModule: LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH, body: {} },
        });
        expect(res.status()).toBe(401);
    });
});

test.describe('user without the submodule', () => {
    test.use({ storageState: USER_STORAGE_STATE });

    test.beforeEach(async ({ db }) => {
        await db.resetUser(E2E_USER, {
            moduleAccess: { [Modules.LEAD_GENERATION]: [LEAD_GENERATION_SUB_MODULES.LEADS] },
        });
    });

    test.afterEach(async ({ db }) => {
        await db.resetUser(E2E_USER);
    });

    test('gets a 404 instead of the form', async ({ page }) => {
        await page.goto(GOOGLE_ADVANCED_SEARCH_URL);
        await expect(page.getByRole('heading', { name: '404 - Page Not Found' }).first()).toBeVisible();
        await expect(page.getByText('Google Advanced Search Form')).toBeHidden();
    });

    test('is refused by the scrape API', async ({ request }) => {
        const res = await request.post(LEAD_GEN_SCRAPE_API_ROUTE, {
            data: { subModule: LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH, body: {} },
        });
        expect(res.status()).toBe(403);
    });
});
