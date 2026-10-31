import { type BrowserContext } from '@playwright/test';
import { encryptOverrides } from 'flags';
import { LINE_FINDER_SUB_MODULES, Modules } from '@aixellabs/backend/db/types';
import { skeleton, soundsOf } from '@aixellabs/backend/line-finder/compute/sound';
import { SubModuleUrls } from '@/config/app-config';
import { FeatureFlagKey } from '@/flags';
import { ADMIN_STORAGE_STATE, E2E_BASE_URL, E2E_FLAGS_SECRET, USER_STORAGE_STATE } from '../support/env';
import { expect, test } from '../support/fixtures';
import { E2E_USER } from '../support/users';
import { waitForHydration } from '../support/voice-agents';

const SEARCH_URL = SubModuleUrls[LINE_FINDER_SUB_MODULES.SEARCH];
const PEOPLE_URL = SubModuleUrls[LINE_FINDER_SUB_MODULES.PEOPLE];
const LINE_BOX = 'input[aria-label="Line"]';

const TEXTS = ['आज की बात', 'यार मेरे पास बहुत पैसा है', 'बिल्कुल सच में', 'पैसा मेरे पे पहले भी नहीं था', 'और कुछ नहीं'];
const LINES = TEXTS.map((text, i) => ({
    startMs: i * 60_000,
    text,
    keys: [...new Set([...soundsOf(text), ...soundsOf(TEXTS[i + 1] ?? '')].map(skeleton))],
}));

async function enableLineFinder(context: BrowserContext): Promise<void> {
    const value = await encryptOverrides({ [FeatureFlagKey.LINE_FINDER]: true }, E2E_FLAGS_SECRET);
    await context.addCookies([{ name: 'vercel-flag-overrides', value, url: E2E_BASE_URL }]);
}

async function find(page: import('@playwright/test').Page, line: string): Promise<void> {
    await page.locator(LINE_BOX).fill(line);
    await page.getByRole('button', { name: 'Find', exact: true }).click();
}

test.describe('LineFinder · user', () => {
    test.use({ storageState: USER_STORAGE_STATE });

    test.beforeEach(async ({ db, context }) => {
        await db.resetUser(E2E_USER, { moduleAccess: { [Modules.LINE_FINDER]: [LINE_FINDER_SUB_MODULES.SEARCH] } });
        await db.seedLineFinder(LINES);
        await enableLineFinder(context);
    });

    test('the sidebar shows this module only, and People is closed', async ({ page }) => {
        await page.goto(SEARCH_URL);
        await waitForHydration(page, LINE_BOX);
        await expect(page.getByRole('link', { name: 'Find a line' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Lead Generation' })).toHaveCount(0);
        const response = await page.goto(PEOPLE_URL);
        expect(response?.status()).toBe(404);
    });

    test('typed in Roman, an exact line links to its moment and plays from there', async ({ page }) => {
        await page.goto(SEARCH_URL);
        await waitForHydration(page, LINE_BOX);
        await find(page, 'mere paas bahut paisa hai');

        await expect(page.getByRole('heading', { name: 'Found "mere paas bahut paisa hai"' })).toBeVisible();
        await expect(page.getByText('Searched 1 video. 1 couldn\'t be searched, usually because they have no captions.')).toBeVisible();
        await expect(page.locator('article'), 'one moment is one result, whichever lines found it').toHaveCount(1);
        const card = page.locator('article').first();
        await expect(card.getByText('Exact', { exact: true })).toBeVisible();
        await expect(card.getByText('Speaker: Not checked')).toBeVisible();
        await expect(card.getByText('यार मेरे पास बहुत पैसा है')).toBeVisible();
        await expect(card.getByText('Reusing it may get a copyright claim.')).toBeVisible();
        await expect(card.getByRole('link', { name: 'Open on YouTube at 0:58' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=vid_one&t=58s');
        await expect(card.getByRole('button', { name: 'Right person' })).toHaveCount(0);

        await expect(card.locator('iframe')).toHaveCount(0);
        await card.getByRole('button', { name: /Play this moment/ }).click();
        await expect(card.locator('iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/vid_one\?start=58&end=66/);
    });

    test('loose wording says it is the closest, and a line that says no is called out', async ({ page }) => {
        await page.goto(SEARCH_URL);
        await waitForHydration(page, LINE_BOX);
        await find(page, 'paisa mere paas pehle tha');

        await expect(page.getByRole('heading', { name: "We didn't find those exact words. These are the closest." })).toBeVisible();
        await expect(page.getByText('Says no, may mean the opposite').first()).toBeVisible();
    });

    test('a line nobody said gets a plain answer', async ({ page }) => {
        await page.goto(SEARCH_URL);
        await waitForHydration(page, LINE_BOX);
        await find(page, 'xyzzy qwerty');

        await expect(page.getByRole('heading', { name: "We couldn't find this line in 1 video of Puneet Superstar." })).toBeVisible();
        await expect(page.locator('article')).toHaveCount(0);
    });

    test('fits a phone with no sideways scroll', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(SEARCH_URL);
        await waitForHydration(page, LINE_BOX);
        await find(page, 'mere paas bahut paisa hai');
        await expect(page.locator('article').first()).toBeVisible();
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    });
});

test('without the module, LineFinder is closed', async ({ browser, db }) => {
    const context = await browser.newContext({ storageState: USER_STORAGE_STATE });
    await db.resetUser(E2E_USER, { moduleAccess: { [Modules.LEAD_GENERATION]: [] } });
    await enableLineFinder(context);
    const page = await context.newPage();
    const response = await page.goto(`${E2E_BASE_URL}${SEARCH_URL}`);
    expect(response?.status()).toBe(404);
    await context.close();
});

test.describe('LineFinder · admin', () => {
    test.use({ storageState: ADMIN_STORAGE_STATE });

    test.beforeEach(async ({ db, context }) => {
        await db.seedLineFinder(LINES);
        await enableLineFinder(context);
    });

    test('marking a result sets its speaker for good', async ({ page, db }) => {
        await page.goto(SEARCH_URL);
        await waitForHydration(page, LINE_BOX);
        await find(page, 'mere paas bahut paisa hai');
        const card = page.locator('article').first();
        await card.getByRole('button', { name: 'Right person' }).click();
        await expect(card.getByText('Speaker: Confirmed')).toBeVisible();
        await expect.poll(async () => (await db.getLineFinderLabels())[0]?.source).toBe('mark');
    });

    test('adding and removing a person', async ({ page }) => {
        page.on('dialog', (dialog) => void dialog.accept());
        await page.goto(PEOPLE_URL);
        await waitForHydration(page, 'input[aria-label="Name"]');
        await expect(page.getByText('1 searchable of 2 videos found. 1 with no captions.')).toBeVisible();

        await page.locator('input[aria-label="Name"]').fill('Salman Khan');
        await page.getByRole('button', { name: 'Add' }).click();
        await expect(page.getByText('Salman Khan')).toBeVisible();
        await expect(page.getByText('Collecting').first()).toBeVisible();

        await page.getByRole('button', { name: 'Remove Puneet Superstar' }).click();
        await expect(page.getByText('Puneet Superstar')).toHaveCount(0);
    });
});
