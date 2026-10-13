import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import {
    creditsBadge,
    expectRunBlockedByValidation,
    expectSavedList,
    GOOGLE_MAPS_FORM,
    mapsLeads,
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

test('needs a place type or keywords in addition to the country', async ({ page, db }) => {
    const scrape = await mockScrape(page, { body: { success: true, data: mapsLeads(1) } });
    await openLeadGenForm(page, GOOGLE_MAPS_FORM);

    await selectOption(page, 'Select country', 'India');
    await expectRunBlockedByValidation(page);
    await expect(page.getByText('Either placeType, query, or urls is required')).toBeVisible();
    expect(scrape.requests).toHaveLength(0);
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS);
});

test('runs a keyword search and saves the places', async ({ page, db }) => {
    const scrape = await mockScrape(page, { body: { success: true, data: mapsLeads(4) } });
    await openLeadGenForm(page, GOOGLE_MAPS_FORM);

    await selectOption(page, 'Select country', 'India');
    await page.getByLabel('Keywords').fill('cafes');
    await saveAndRun(page, 'Pune cafes');

    await expect(page.getByText('Saved 4 leads.')).toBeVisible();
    await expect(creditsBadge(page)).toHaveText(new RegExp(`^${DEFAULT_USER_CREDITS - 4}`));

    expect(scrape.requests).toEqual([
        {
            subModule: GOOGLE_MAPS_FORM.subModule,
            body: expect.objectContaining({ query: 'cafes', country: 'IN', countryCode: 'IN' }),
        },
    ]);
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS - 4);
    expect(await db.getLeadLists(E2E_USER)).toEqual([{ name: expect.stringMatching(/^Pune cafes · /), leadCount: 4 }]);

    await expectSavedList(page, { presetName: 'Pune cafes', leadCount: 4, leadText: 'Cafe 4 of Pune' });
});
