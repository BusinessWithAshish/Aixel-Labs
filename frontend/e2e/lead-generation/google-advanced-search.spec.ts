import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import {
    creditsBadge,
    expectRunBlockedByValidation,
    expectSavedList,
    fillRequiredFields,
    mockScrape,
    openGoogleAdvancedSearch,
    saveAndRun,
    searchLeads,
} from '../support/lead-gen';
import { DEFAULT_USER_CREDITS, E2E_USER } from '../support/users';

test.use({ storageState: USER_STORAGE_STATE });

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
});

test('shows the cost per result and the current balance', async ({ page }) => {
    await openGoogleAdvancedSearch(page);

    await expect(page.getByText('1 credit per result')).toBeVisible();
    await expect(creditsBadge(page)).toHaveText(new RegExp(`^${DEFAULT_USER_CREDITS}`));
});

test('does not run while required fields are empty', async ({ page, db }) => {
    const scrape = await mockScrape(page, { body: { success: true, data: searchLeads(1) } });
    await openGoogleAdvancedSearch(page);

    await expectRunBlockedByValidation(page);
    await expect(page.getByText('This field is required')).toHaveCount(2);
    expect(scrape.requests).toHaveLength(0);
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS);
});

test('saves scraped leads into a list named after the preset and debits one credit each', async ({ page, db }) => {
    const scrape = await mockScrape(page, { body: { success: true, data: searchLeads(3) } });
    await openGoogleAdvancedSearch(page);

    await fillRequiredFields(page, { query: 'plumbers in pune', country: 'India' });
    await saveAndRun(page, 'Pune plumbers');

    await expect(page.getByText('Your leads are ready.')).toBeVisible();
    await expect(page.getByText('Saved 3 leads.')).toBeVisible();
    await expect(creditsBadge(page)).toHaveText(new RegExp(`^${DEFAULT_USER_CREDITS - 3}`));

    expect(scrape.requests).toEqual([
        {
            subModule: 'GOOGLE_ADVANCED_SEARCH',
            body: expect.objectContaining({ searchQuery: 'plumbers in pune', country: 'IN' }),
        },
    ]);
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS - 3);
    expect(await db.getLeadLists(E2E_USER)).toEqual([
        { name: expect.stringMatching(/^Pune plumbers · /), leadCount: 3 },
    ]);

    await expectSavedList(page, { presetName: 'Pune plumbers', leadCount: 3, leadText: 'Plumber 3 of Pune' });
});

test('a failed scrape shows the error and charges nothing', async ({ page, db }) => {
    await mockScrape(page, { status: 502, body: { success: false, error: 'Search provider blocked the request' } });
    await openGoogleAdvancedSearch(page);

    await fillRequiredFields(page, { query: 'plumbers in pune', country: 'India' });
    await saveAndRun(page, 'Blocked run');

    await expect(page.getByText('Search provider blocked the request')).toBeVisible();
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS);
    expect(await db.getLeadLists(E2E_USER)).toEqual([]);
});

test('aborting an in-flight run charges nothing', async ({ page, db }) => {
    await mockScrape(page, 'hang');
    await openGoogleAdvancedSearch(page);

    await fillRequiredFields(page, { query: 'plumbers in pune', country: 'India' });
    await saveAndRun(page, 'Aborted run');
    await page.getByRole('button', { name: 'Abort request' }).click();

    await expect(page.getByText('Request cancelled.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run "Aborted run"' })).toBeEnabled();
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS);
    expect(await db.getLeadLists(E2E_USER)).toEqual([]);
});
