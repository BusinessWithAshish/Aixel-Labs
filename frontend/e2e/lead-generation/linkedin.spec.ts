import { LINKEDIN_SEARCH_TYPE } from '@aixellabs/backend/linkedin/schemas';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import {
    creditsBadge,
    expectRunBlockedByValidation,
    expectSavedList,
    LINKEDIN_FORM,
    linkedinCompanyLeads,
    mockScrape,
    openLeadGenForm,
    saveAndRun,
    selectOption,
} from '../support/lead-gen';
import { DEFAULT_USER_CREDITS, E2E_USER } from '../support/users';

test.use({ storageState: USER_STORAGE_STATE });

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
});

test('company search does not run without a country', async ({ page, db }) => {
    const scrape = await mockScrape(page, { body: { success: true, data: linkedinCompanyLeads(1) } });
    await openLeadGenForm(page, LINKEDIN_FORM);

    await page.getByLabel('Name', { exact: true }).fill('Pune Software');
    await expectRunBlockedByValidation(page);
    expect(scrape.requests).toHaveLength(0);
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS);
});

test('runs a company search and saves the companies', async ({ page, db }) => {
    const scrape = await mockScrape(page, { body: { success: true, data: linkedinCompanyLeads(2) } });
    await openLeadGenForm(page, LINKEDIN_FORM);

    await selectOption(page, 'Select country', 'India');
    await page.getByLabel('Name', { exact: true }).fill('Pune Software');
    await saveAndRun(page, 'Pune software');

    await expect(page.getByText('Saved 2 leads.')).toBeVisible();
    await expect(creditsBadge(page)).toHaveText(new RegExp(`^${DEFAULT_USER_CREDITS - 2}`));

    expect(scrape.requests).toEqual([
        {
            subModule: LINKEDIN_FORM.subModule,
            body: expect.objectContaining({
                searchType: LINKEDIN_SEARCH_TYPE.COMPANY,
                discovery_filters: expect.objectContaining({ country: 'IN', company_name: 'Pune Software' }),
            }),
        },
    ]);
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS - 2);

    await expectSavedList(page, {
        presetName: 'Pune software',
        leadCount: 2,
        leadText: 'Pune Software 2 Pvt Ltd',
    });
});

test('people search is hidden while its feature flag is off', async ({ page }) => {
    await openLeadGenForm(page, LINKEDIN_FORM);

    await page.getByRole('tab', { name: 'By People' }).click();

    await expect(page.getByText('Job Titles')).toBeHidden();
});
