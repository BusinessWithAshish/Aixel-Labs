import { CONTENT_LAB_ERROR_MESSAGES } from '@aixellabs/backend/content-lab/constants';
import { CONTENT_LAB_SUB_MODULES } from '@aixellabs/backend/db/types';
import { CONTENT_LAB_CHECK_ROUTE, CONTENT_LAB_EXPLORE_ROUTE, SubModuleUrls } from '@/config/app-config';
import { CONTENT_LAB_HOME_EXAMPLE, CONTENT_LAB_QUERY_KINDS } from '@/app/(protected)/content-lab/_constants';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import {
    breakdownResponse,
    creatorResponse,
    enableContentLab,
    expectNoHorizontalOverflow,
    exploreResponse,
    mockContentLab,
    ok,
    SMART_BOX,
    VIEWPORTS,
    waitForSmartBox,
} from './support-search';

const SEARCH_URL = SubModuleUrls[CONTENT_LAB_SUB_MODULES.SEARCH];

for (const { name, use } of VIEWPORTS) {
    test.describe(`Search home · ${name}`, () => {
        test.use({ storageState: USER_STORAGE_STATE, ...use });
        test.beforeEach(async ({ db, context, page }) => {
            await db.resetUser(E2E_USER);
            await enableContentLab(context);
            await page.goto(SEARCH_URL);
            await waitForSmartBox(page);
        });

        test('shows the box, what it takes, the worked example and the vs Studio card without sideways scroll', async ({ page }) => {
            await expect(page.getByRole('heading', { name: "Find what's already working. Then make your version." })).toBeVisible();
            for (const kind of CONTENT_LAB_QUERY_KINDS) await expect(page.getByRole('heading', { name: kind.title })).toBeVisible();
            await expect(page.getByRole('heading', { name: 'One search, every platform' })).toBeVisible();
            for (const hook of CONTENT_LAB_HOME_EXAMPLE.hooks) await expect(page.getByText(hook.text, { exact: true })).toBeVisible();
            await expect(page.getByRole('heading', { name: 'Already have YouTube Studio and Instagram insights?' })).toBeVisible();
            await expect(page.getByRole('link', { name: /Already have an idea\? Check it/ })).toHaveAttribute('href', CONTENT_LAB_CHECK_ROUTE);
            await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeVisible();
            await expectNoHorizontalOverflow(page);
        });

        test('a topic example runs that search', async ({ page }) => {
            await mockContentLab(page, 'EXPLORE', ok(exploreResponse()));
            await page.getByRole('link', { name: 'skincare for men' }).click();
            await page.waitForURL(`**${CONTENT_LAB_EXPLORE_ROUTE}?q=skincare+for+men`);
            await expect(page.getByRole('heading', { name: `What's working in "skincare for men"` })).toBeVisible();
        });

        test('a topic says so and opens what is working', async ({ page }) => {
            const explore = await mockContentLab(page, 'EXPLORE', ok(exploreResponse()));
            await page.locator(SMART_BOX).fill('protein breakfast');
            await expect(page.getByText('Looks like a topic → shows what is working in this niche')).toBeVisible();
            await page.getByRole('button', { name: 'Go', exact: true }).click();

            await page.waitForURL(`**${CONTENT_LAB_EXPLORE_ROUTE}?q=protein+breakfast`);
            await expect(page.getByRole('heading', { name: `What's working in "protein breakfast"` })).toBeVisible();
            // Dev mode mounts effects twice, so one aborted request may come first; the last one is the search that ran.
            await expect.poll(() => explore.requests.length).toBeGreaterThan(0);
            expect(explore.requests.at(-1)).toMatchObject({ query: 'protein breakfast', platforms: ['youtube', 'instagram'], country: 'IN' });
        });

        test('a YouTube link says so and opens its breakdown', async ({ page }) => {
            const breakdown = await mockContentLab(page, 'BREAKDOWN', ok(breakdownResponse('video')));
            await page.locator(SMART_BOX).fill('https://youtu.be/abc123xyz');
            await expect(page.getByText('Looks like a link → breaks down this video or reel')).toBeVisible();
            await page.locator(SMART_BOX).press('Enter');

            await page.waitForURL(/\/content-lab\/search\/post\/youtube%3Aabc123xyz\?url=/);
            await expect(page.getByRole('heading', { name: 'I tried 30 days of protein breakfasts' })).toBeVisible();
            expect(breakdown.requests[0]).toMatchObject({ url: 'https://youtu.be/abc123xyz', country: 'IN' });
        });

        test('an @creator says so and shows their standouts on both platforms', async ({ page }) => {
            const creator = await mockContentLab(page, 'CREATOR', (body) => ok(creatorResponse(body.platform as 'youtube' | 'instagram')));
            await page.locator(SMART_BOX).fill('@hostelkitchen');
            await expect(page.getByText('Looks like a creator → shows their posts that did better than usual')).toBeVisible();
            await page.getByRole('button', { name: 'Go', exact: true }).click();

            await page.waitForURL(`**${CONTENT_LAB_EXPLORE_ROUTE}?creator=hostelkitchen`);
            await expect(page.getByRole('heading', { name: 'Standouts from @hostelkitchen' })).toBeVisible();
            await expect(page.getByTestId('content-lab-post-card')).toHaveCount(2);
            expect([...new Set(creator.requests.map((r) => r.platform))].sort()).toEqual(['instagram', 'youtube']);
            await expectNoHorizontalOverflow(page);
        });

        test('a link it cannot break down says why and stays put', async ({ page }) => {
            await page.locator(SMART_BOX).fill('https://example.com/some-page');
            await expect(page.getByText(CONTENT_LAB_ERROR_MESSAGES.UNSUPPORTED_URL)).toBeVisible();
            await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeDisabled();
        });

        test('an example fills the box', async ({ page }) => {
            await page.getByRole('button', { name: '@hostelkitchen' }).click();
            await expect(page.locator(SMART_BOX)).toHaveValue('@hostelkitchen');
        });

        test('a link sent to explore before hydration lands on its breakdown', async ({ page }) => {
            await mockContentLab(page, 'BREAKDOWN', ok(breakdownResponse('video')));
            await page.goto(`${CONTENT_LAB_EXPLORE_ROUTE}?q=${encodeURIComponent('https://www.youtube.com/shorts/abc123xyz')}`);
            await page.waitForURL(/\/content-lab\/search\/post\/youtube%3Aabc123xyz\?url=/);
        });
    });
}
