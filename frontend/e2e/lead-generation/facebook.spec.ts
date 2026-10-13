import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import {
    creditsBadge,
    expectRunBlockedByValidation,
    expectSavedList,
    FACEBOOK_FORM,
    facebookLeads,
    mockScrape,
    openLeadGenForm,
    saveAndRun,
    selectOption,
} from '../support/lead-gen';
import { DEFAULT_USER_CREDITS, E2E_USER } from '../support/users';

test.use({ storageState: USER_STORAGE_STATE });

async function addPage(page: Page, value: string): Promise<void> {
    const entities = page.getByRole('group', { name: 'Entities' });
    await entities.getByRole('button', { name: '+ Add Item' }).click();
    await entities.getByRole('textbox').last().fill(value);
}

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
});

test('does not run without a country', async ({ page, db }) => {
    const scrape = await mockScrape(page, { body: { success: true, data: facebookLeads(1) } });
    await openLeadGenForm(page, FACEBOOK_FORM);

    await page.getByRole('textbox', { name: 'Query' }).fill('dentists in pune');
    await expectRunBlockedByValidation(page);
    expect(scrape.requests).toHaveLength(0);
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS);
});

test('runs a query search and saves the pages', async ({ page, db }) => {
    const scrape = await mockScrape(page, { body: { success: true, data: facebookLeads(3) } });
    await openLeadGenForm(page, FACEBOOK_FORM);

    await page.getByRole('textbox', { name: 'Query' }).fill('dentists in pune');
    await selectOption(page, 'Select country', 'India');
    await saveAndRun(page, 'Pune dentists');

    await expect(page.getByText('Saved 3 leads.')).toBeVisible();
    await expect(creditsBadge(page)).toHaveText(new RegExp(`^${DEFAULT_USER_CREDITS - 3}`));

    expect(scrape.requests).toEqual([
        {
            subModule: FACEBOOK_FORM.subModule,
            body: expect.objectContaining({ query: 'dentists in pune', country: 'IN' }),
        },
    ]);
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS - 3);

    await expectSavedList(page, { presetName: 'Pune dentists', leadCount: 3, leadText: 'Pune Dental Clinic 3' });
});

test('looks up specific pages', async ({ page, db }) => {
    const scrape = await mockScrape(page, { body: { success: true, data: facebookLeads(2) } });
    await openLeadGenForm(page, FACEBOOK_FORM);

    await page.getByRole('tab', { name: 'Pages' }).click();
    await selectOption(page, 'Select country', 'India');
    await addPage(page, 'punedental1');
    await addPage(page, 'https://www.facebook.com/punedental2');
    await saveAndRun(page, 'Two clinics');

    await expect(page.getByText('Saved 2 leads.')).toBeVisible();
    expect(scrape.requests).toEqual([
        {
            subModule: FACEBOOK_FORM.subModule,
            body: expect.objectContaining({
                country: 'IN',
                entities: ['punedental1', 'https://www.facebook.com/punedental2'],
            }),
        },
    ]);
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS - 2);
});

test('a search that finds nothing usable saves no list and charges nothing', async ({ page, db }) => {
    await mockScrape(page, { body: { success: true, data: [] } });
    await openLeadGenForm(page, FACEBOOK_FORM);

    await page.getByRole('textbox', { name: 'Query' }).fill('dentists in pune');
    await selectOption(page, 'Select country', 'India');
    await saveAndRun(page, 'Nothing found');

    await expect(page.getByText('Failed to generate leads')).toBeVisible();
    expect(await db.getCredits(E2E_USER)).toBe(DEFAULT_USER_CREDITS);
    expect(await db.getLeadLists(E2E_USER)).toEqual([]);
});
