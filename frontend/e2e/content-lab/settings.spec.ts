import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import { E2E_GEMINI_API_KEY, USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import { enableContentLab, expect, expectNoSidewaysScroll, SETTINGS_URL, test, VIEWPORTS } from './support-boards';

test.use({ storageState: USER_STORAGE_STATE });

test.beforeEach(async ({ db, lab, context }) => {
    await db.resetUser(E2E_USER);
    await lab.reset(E2E_USER);
    // As seeded: the user has a working Gemini key.
    await db.setVoiceGeminiKey(E2E_USER, E2E_GEMINI_API_KEY);
    await enableContentLab(context);
});

for (const viewport of VIEWPORTS) {
    test.describe(viewport.name, () => {
        test.use(viewport.use);

        test('own accounts and defaults save and come back after a reload', async ({ page, lab }) => {
            await page.goto(SETTINGS_URL);
            await waitForHydration(page, 'button[type="submit"]');
            await expect(page.getByLabel('Country')).toHaveText('India');
            await expect(page.getByLabel('Language')).toHaveText('English');
            await expect(page.getByText('Beta')).toHaveCount(2);
            await expectNoSidewaysScroll(page);

            await page.getByLabel('YouTube').fill('@MyKitchenLab');
            await page.getByLabel('Instagram').fill('mykitchenlab.ig');
            await page.getByLabel('X').fill('@mkl');
            await page.getByLabel('Country').click();
            await page.getByRole('option', { name: 'United States' }).click();
            await page.getByLabel('Language').click();
            await page.getByRole('option', { name: 'Hinglish' }).click();
            await page.getByRole('button', { name: 'Save settings' }).click();
            await expect(page.getByText('Settings saved')).toBeVisible();

            const profile = await lab.profiles.findOne({});
            expect(profile).toMatchObject({
                handles: { youtube: 'mykitchenlab', instagram: 'mykitchenlab.ig' },
                betaHandles: { x: 'mkl' },
                country: 'US',
                language: 'Hinglish',
            });

            await page.reload();
            await waitForHydration(page, 'button[type="submit"]');
            await expect(page.getByLabel('YouTube')).toHaveValue('mykitchenlab');
            await expect(page.getByLabel('X')).toHaveValue('mkl');
            await expect(page.getByLabel('LinkedIn')).toHaveValue('');
            await expect(page.getByLabel('Country')).toHaveText('United States');
            await expect(page.getByLabel('Language')).toHaveText('Hinglish');
        });

        test('shows whether the Gemini key drafts run on is set, and where to change it', async ({ page, db }) => {
            await page.goto(SETTINGS_URL);
            const status = page.getByTestId('gemini-key-status');
            await expect(status).toContainText(`Working · ends in ${E2E_GEMINI_API_KEY.slice(-4)}`);
            await expect(status.getByRole('link', { name: 'Change it in Voice agent settings' })).toHaveAttribute('href', GEMINI_KEY_URL);

            await db.setVoiceGeminiKey(E2E_USER, null);
            await page.reload();
            await expect(status).toContainText('No key yet');
            await expect(status.getByRole('link', { name: 'Add it in Voice agent settings' })).toHaveAttribute('href', GEMINI_KEY_URL);
            await expectNoSidewaysScroll(page);
        });
    });
}
