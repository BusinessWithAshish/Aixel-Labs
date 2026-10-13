import { NO_CREDITS_MESSAGE } from '@/helpers/credits';
import { expect, test } from '../support/fixtures';
import { ADMIN_STORAGE_STATE, USER_STORAGE_STATE } from '../support/env';
import {
    creditsBadge,
    fillRequiredFields,
    mockScrape,
    openGoogleAdvancedSearch,
    saveAndRun,
    searchLeads,
} from '../support/lead-gen';
import { E2E_ADMIN, E2E_USER } from '../support/users';

test.describe('user low on credits', () => {
    test.use({ storageState: USER_STORAGE_STATE });

    test('keeps only what the balance covers and reports credits exhausted', async ({ page, db }) => {
        await db.resetUser(E2E_USER, { credits: 2 });
        await mockScrape(page, { body: { success: true, data: searchLeads(3) } });
        await openGoogleAdvancedSearch(page);

        await fillRequiredFields(page, { query: 'plumbers in pune', country: 'India' });
        await saveAndRun(page, 'Last credits');

        const dialog = page.getByRole('dialog', { name: 'Credits exhausted' });
        await expect(dialog).toContainText('We saved 2 leads from this run.');
        await dialog.getByRole('button', { name: 'Close' }).first().click();
        await expect(creditsBadge(page)).toHaveText(/^0/);

        expect(await db.getCredits(E2E_USER)).toBe(0);
        expect(await db.getLeadLists(E2E_USER)).toEqual([
            { name: expect.stringMatching(/^Last credits · /), leadCount: 2 },
        ]);
    });

    test('cannot run with an empty balance', async ({ page, db }) => {
        await db.resetUser(E2E_USER, { credits: 0 });
        await mockScrape(page, { body: { success: true, data: searchLeads(3) } });
        await openGoogleAdvancedSearch(page);

        await fillRequiredFields(page, { query: 'plumbers in pune', country: 'India' });
        await saveAndRun(page, 'No credits');

        await expect(page.getByText(NO_CREDITS_MESSAGE)).toBeVisible();
        expect(await db.getCredits(E2E_USER)).toBe(0);
        expect(await db.getLeadLists(E2E_USER)).toEqual([]);
    });
});

test.describe('admin', () => {
    test.use({ storageState: ADMIN_STORAGE_STATE });

    test('is never charged and sees no credits UI', async ({ page, db }) => {
        await db.resetUser(E2E_ADMIN);
        await mockScrape(page, { body: { success: true, data: searchLeads(2) } });
        await openGoogleAdvancedSearch(page);

        await fillRequiredFields(page, { query: 'plumbers in pune', country: 'India' });
        await saveAndRun(page, 'Admin run');

        await expect(page.getByText('Saved 2 leads.')).toBeVisible();
        await expect(page.getByText('1 credit per result')).toBeHidden();
        await expect(creditsBadge(page)).toBeHidden();
        await expect(page.getByRole('dialog', { name: 'Credits exhausted' })).toBeHidden();

        expect(await db.getCredits(E2E_ADMIN)).toBeUndefined();
        expect(await db.getLeadLists(E2E_ADMIN)).toEqual([
            { name: expect.stringMatching(/^Admin run · /), leadCount: 2 },
        ]);
    });
});
