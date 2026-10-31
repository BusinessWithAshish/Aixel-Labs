import { ACCOUNT_SETTINGS_ROUTE } from '@/config/app-config';
import { CREDITS_REFILL_PERIOD_DAYS, MONTHLY_FREE_CREDITS, NO_CREDITS_MESSAGE } from '@/helpers/credits';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import {
    creditsBadge,
    fillRequiredFields,
    mockScrape,
    openGoogleAdvancedSearch,
    saveAndRun,
    searchLeads,
} from '../support/lead-gen';
import { E2E_USER } from '../support/users';

const REFILL_HOURS = CREDITS_REFILL_PERIOD_DAYS * 24;

test.use({ storageState: USER_STORAGE_STATE });

test('an empty balance is back to the monthly allowance once 30 days have passed', async ({ page, db }) => {
    await db.resetUser(E2E_USER, { credits: 0, refilledHoursAgo: REFILL_HOURS + 1 });
    await mockScrape(page, { body: { success: true, data: searchLeads(3) } });
    await openGoogleAdvancedSearch(page);

    await expect(creditsBadge(page)).toHaveText(new RegExp(`^${MONTHLY_FREE_CREDITS}`));

    await fillRequiredFields(page, { query: 'plumbers in pune', country: 'India' });
    await saveAndRun(page, 'After refill');

    await expect(page.getByText('Saved 3 leads.')).toBeVisible();
    expect(await db.getCredits(E2E_USER)).toBe(MONTHLY_FREE_CREDITS - 3);
});

test('an empty balance stays empty until the 30 days are up', async ({ page, db }) => {
    await db.resetUser(E2E_USER, { credits: 0, refilledHoursAgo: REFILL_HOURS - 1 });
    await mockScrape(page, { body: { success: true, data: searchLeads(3) } });
    await openGoogleAdvancedSearch(page);

    await expect(creditsBadge(page)).toHaveText(/^0/);

    await fillRequiredFields(page, { query: 'plumbers in pune', country: 'India' });
    await saveAndRun(page, 'Too early');

    await expect(page.getByText(NO_CREDITS_MESSAGE)).toBeVisible();
    expect(await db.getCredits(E2E_USER)).toBe(0);
    expect(await db.getLeadLists(E2E_USER)).toEqual([]);
});

test('the refill happens once a period, not on every visit', async ({ page, db }) => {
    await db.resetUser(E2E_USER, { credits: 0, refilledHoursAgo: REFILL_HOURS + 1 });
    await mockScrape(page, { body: { success: true, data: searchLeads(3) } });
    await openGoogleAdvancedSearch(page);
    await fillRequiredFields(page, { query: 'plumbers in pune', country: 'India' });
    await saveAndRun(page, 'Spend some');
    await expect(page.getByText('Saved 3 leads.')).toBeVisible();

    await page.reload();

    await expect(creditsBadge(page)).toHaveText(new RegExp(`^${MONTHLY_FREE_CREDITS - 3}`));
});

test('a refill never lowers a balance above the allowance', async ({ page, db }) => {
    const bonusBalance = MONTHLY_FREE_CREDITS + 500;
    await db.resetUser(E2E_USER, { credits: bonusBalance, refilledHoursAgo: REFILL_HOURS + 1 });
    await openGoogleAdvancedSearch(page);

    await expect(creditsBadge(page)).toHaveText(new RegExp(`^${bonusBalance}`));
    expect(await db.getCredits(E2E_USER)).toBe(bonusBalance);
});

test('account settings says when the next free refill is', async ({ page, db }) => {
    await db.resetUser(E2E_USER, { credits: 40, refilledHoursAgo: REFILL_HOURS - 4 });
    await page.goto(ACCOUNT_SETTINGS_ROUTE);

    await expect(page.getByText('40 credits available · next free refill in about 4 hours')).toBeVisible();
    await expect(page.getByText('Free credits refill to 5,000 every 30 days.')).toBeVisible();
});

test('running out of credits says when they come back', async ({ page, db }) => {
    await db.resetUser(E2E_USER, { credits: 2 });
    await mockScrape(page, { body: { success: true, data: searchLeads(3) } });
    await openGoogleAdvancedSearch(page);

    await fillRequiredFields(page, { query: 'plumbers in pune', country: 'India' });
    await saveAndRun(page, 'Last two');

    await expect(page.getByRole('dialog', { name: 'Credits exhausted' })).toContainText(
        'Your free credits refill to 5,000 every 30 days.',
    );
});
