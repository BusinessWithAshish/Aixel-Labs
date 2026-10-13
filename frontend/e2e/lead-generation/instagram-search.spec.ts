import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import {
    creditsBadge,
    expectRunBlockedByValidation,
    expectSavedList,
    INSTAGRAM_FORM,
    instagramLeads,
    mockScrape,
    openLeadGenForm,
    saveAndRun,
    selectOption,
} from '../support/lead-gen';
import { DEFAULT_USER_CREDITS, E2E_USER } from '../support/users';

test.use({ storageState: USER_STORAGE_STATE });

async function addUsername(page: Page, value: string): Promise<void> {
    const entities = page.getByRole('group', { name: 'Entities' });
    await entities.getByRole('button', { name: '+ Add Item' }).click();
    await entities.getByPlaceholder('Enter entities item').last().fill(value);
}

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
});

test('does not run without a country', async ({ page, db }) => {
    const scrape = await mockScrape(page, { body: { success: true, data: instagramLeads(1) } });
    await openLeadGenForm(page, INSTAGRAM_FORM);

    await page.getByRole('textbox', { name: 'Query' }).fill('bakers in pune');
    await expectRunBlockedByValidation(page);
    expect(scrape.requests).toHaveLength(0);
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS);
});

test('runs a query search and saves the profiles', async ({ page, db }) => {
    const scrape = await mockScrape(page, { body: { success: true, data: instagramLeads(3) } });
    await openLeadGenForm(page, INSTAGRAM_FORM);

    await page.getByRole('textbox', { name: 'Query' }).fill('bakers in pune');
    await selectOption(page, 'Select country', 'India');
    await saveAndRun(page, 'Pune bakers');

    await expect(page.getByText('Saved 3 leads.')).toBeVisible();
    await expect(creditsBadge(page)).toHaveText(new RegExp(`^${DEFAULT_USER_CREDITS - 3}`));

    expect(scrape.requests).toEqual([
        {
            subModule: INSTAGRAM_FORM.subModule,
            body: expect.objectContaining({ query: 'bakers in pune', country: 'IN' }),
        },
    ]);
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS - 3);

    await expectSavedList(page, { presetName: 'Pune bakers', leadCount: 3, leadText: 'pune_baker_3' });
});

test('looks up specific usernames', async ({ page, db }) => {
    const scrape = await mockScrape(page, { body: { success: true, data: instagramLeads(2) } });
    await openLeadGenForm(page, INSTAGRAM_FORM);

    await page.getByRole('tab', { name: 'Usernames' }).click();
    await selectOption(page, 'Select country', 'India');
    await addUsername(page, 'pune_baker_1');
    await addUsername(page, 'https://www.instagram.com/pune_baker_2');
    await saveAndRun(page, 'Two bakers');

    await expect(page.getByText('Saved 2 leads.')).toBeVisible();
    expect(scrape.requests).toEqual([
        {
            subModule: INSTAGRAM_FORM.subModule,
            body: expect.objectContaining({
                country: 'IN',
                entities: ['pune_baker_1', 'https://www.instagram.com/pune_baker_2'],
            }),
        },
    ]);
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS - 2);
});

test('rejects a username that is not a handle or profile URL', async ({ page }) => {
    const scrape = await mockScrape(page, { body: { success: true, data: instagramLeads(1) } });
    await openLeadGenForm(page, INSTAGRAM_FORM);

    await page.getByRole('tab', { name: 'Usernames' }).click();
    await selectOption(page, 'Select country', 'India');
    await addUsername(page, 'not a handle!');
    await expectRunBlockedByValidation(page);
    expect(scrape.requests).toHaveLength(0);
});
