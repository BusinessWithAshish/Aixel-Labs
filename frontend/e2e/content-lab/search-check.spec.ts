import { CONTENT_LAB_SUB_MODULES } from '@aixellabs/backend/db/types';
import { CONTENT_LAB_CHECK_ROUTE, SubModuleUrls } from '@/config/app-config';
import { expect, test } from '../support/fixtures';
import { E2E_GEMINI_API_KEY, USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import { CHECK_RESPONSE, enableContentLab, expectNoHorizontalOverflow, fail, mockContentLab, ok, REWRITES, VIEWPORTS } from './support-search';

const IDEA = 'textarea[aria-label="Your idea"]';

for (const { name, use } of VIEWPORTS) {
    test.describe(`Check my idea · ${name}`, () => {
        test.use({ storageState: USER_STORAGE_STATE, ...use });
        test.beforeEach(async ({ db, context }) => {
            await db.resetUser(E2E_USER);
            await db.setContentLabGeminiKey(E2E_USER, E2E_GEMINI_API_KEY);
            await enableContentLab(context);
        });

        test('scores the idea, shows red and green checks, the winners and 3 stronger versions; Use checks again', async ({ page }) => {
            const check = await mockContentLab(page, 'CHECK', (body) => ok({ ...CHECK_RESPONSE, score: body.text === REWRITES[0] ? 81 : 42 }));
            const write = await mockContentLab(page, 'WRITE', ok({ versions: REWRITES }));
            await page.goto(CONTENT_LAB_CHECK_ROUTE);
            await waitForHydration(page, IDEA);

            await page.getByLabel('Topic or niche').fill('protein breakfast');
            await page.locator(IDEA).fill('My protein breakfast routine');
            await page.getByRole('button', { name: 'Check it' }).click();

            await expect(page.getByTestId('content-lab-check-score')).toHaveText('42/100');
            await expect(page.locator('li[data-passed="true"]')).toHaveCount(1);
            await expect(page.locator('li[data-passed="false"]')).toHaveCount(2);
            await expect(page.getByText('No number or ₹ price')).toBeVisible();
            await expect(page.getByRole('link', { name: 'What I eat in a day on ₹20k/month' })).toBeVisible();
            expect(check.requests[0]).toMatchObject({ text: 'My protein breakfast routine', platform: 'youtube', query: 'protein breakfast', country: 'IN' });

            for (const version of REWRITES) await expect(page.getByText(version, { exact: true })).toBeVisible();
            expect(write.requests[0]).toMatchObject({ mode: 'rewrites', draft: 'My protein breakfast routine', platform: 'youtube', language: 'English' });
            await expectNoHorizontalOverflow(page);

            await page.getByRole('button', { name: `Use: ${REWRITES[0]}` }).click();
            await expect(page.locator(IDEA)).toHaveValue(REWRITES[0]);
            await expect(page.getByTestId('content-lab-check-score')).toHaveText('81/100');
            expect(check.requests.at(-1)?.text).toBe(REWRITES[0]);
            await expect(page).toHaveURL(/text=I\+ate/);
        });

        test('a Reel hook in Hinglish checks against Instagram and asks for Hinglish versions', async ({ page }) => {
            const check = await mockContentLab(page, 'CHECK', ok(CHECK_RESPONSE));
            const write = await mockContentLab(page, 'WRITE', ok({ versions: REWRITES }));
            await page.goto(CONTENT_LAB_CHECK_ROUTE);
            await waitForHydration(page, IDEA);

            await page.getByRole('combobox', { name: 'Platform' }).click();
            await page.getByRole('option', { name: 'Reel hook' }).click();
            await page.getByRole('combobox', { name: 'Language for stronger versions' }).click();
            await page.getByRole('option', { name: 'Hinglish' }).click();
            await page.getByLabel('Topic or niche').fill('protein breakfast');
            await page.locator(IDEA).fill('Mera protein breakfast');
            await page.getByRole('button', { name: 'Check it' }).click();

            await expect(page.getByText(REWRITES[1], { exact: true })).toBeVisible();
            expect(check.requests[0]?.platform).toBe('instagram');
            expect(write.requests[0]).toMatchObject({ platform: 'instagram', language: 'Hinglish' });
        });

        test('a shared link checks at once', async ({ page }) => {
            const check = await mockContentLab(page, 'CHECK', ok(CHECK_RESPONSE));
            await mockContentLab(page, 'WRITE', ok({ versions: REWRITES }));
            await page.goto(`${CONTENT_LAB_CHECK_ROUTE}?platform=youtube&q=protein+breakfast&text=My+routine`);
            await expect(page.getByTestId('content-lab-check-score')).toHaveText('42/100');
            expect(check.requests[0]).toMatchObject({ text: 'My routine', query: 'protein breakfast' });
        });

        test('without a Gemini key it still scores and points to Content Lab settings', async ({ page, db }) => {
            await db.setContentLabGeminiKey(E2E_USER, null);
            await mockContentLab(page, 'CHECK', ok(CHECK_RESPONSE));
            const write = await mockContentLab(page, 'WRITE', ok({ versions: REWRITES }));
            await page.goto(`${CONTENT_LAB_CHECK_ROUTE}?q=protein+breakfast&text=My+routine`);

            await expect(page.getByTestId('content-lab-check-score')).toHaveText('42/100');
            await expect(page.getByText('Add your Gemini key to get 3 stronger versions')).toBeVisible();
            await expect(page.getByRole('link', { name: 'Open Content Lab settings' })).toHaveAttribute(
                'href',
                SubModuleUrls[CONTENT_LAB_SUB_MODULES.SETTINGS],
            );
            expect(write.requests).toHaveLength(0);
            await expectNoHorizontalOverflow(page);
        });

        test('a failed rewrite says why; a failed check says why', async ({ page }) => {
            let checks = 0;
            await mockContentLab(page, 'CHECK', () => (++checks === 1 ? ok(CHECK_RESPONSE) : fail('Service is temporarily unavailable')));
            await mockContentLab(page, 'WRITE', fail('Google says your Gemini key is out of quota right now.'));
            await page.goto(`${CONTENT_LAB_CHECK_ROUTE}?q=protein+breakfast&text=My+routine`);
            await waitForHydration(page, IDEA);
            await expect(page.getByRole('alert').filter({ hasText: 'No stronger versions this time' })).toContainText('out of quota');

            await page.getByRole('button', { name: 'Check it' }).click();
            await expect(page.getByRole('alert').filter({ hasText: 'Could not check this idea' })).toContainText('Service is temporarily unavailable');
        });
    });
}
