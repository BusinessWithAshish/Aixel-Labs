import { CONTENT_LAB_ERROR_MESSAGES } from '@aixellabs/backend/content-lab/constants';
import { CONTENT_LAB_SUB_MODULES } from '@aixellabs/backend/db/types';
import { CONTENT_LAB_CHECK_ROUTE, CONTENT_LAB_EXPLORE_ROUTE, SubModuleUrls } from '@/config/app-config';
import { CONTENT_LAB_VS_STUDIO } from '@/app/(protected)/content-lab/_constants';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import {
    breakdownResponse,
    creatorResponse,
    enableContentLab,
    expectNoHorizontalOverflow,
    exploreResponse,
    keywordResponse,
    mockContentLab,
    ok,
    SMART_BOX,
    toggleSource,
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

        test('shows the search bar with its sources, the check-an-idea link and what you get vs Studio, without sideways scroll', async ({ page }) => {
            await expect(page.getByRole('heading', { name: "Find what's already working. Then make your version." })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Sources: YouTube and Instagram' })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeVisible();
            await expect(page.getByRole('link', { name: /Have an idea already\?\s*Check it before you post/ })).toHaveAttribute('href', CONTENT_LAB_CHECK_ROUTE);
            const vsStudio = page.getByRole('region', { name: "What you get here that Studio and Insights don't show" });
            await expect(vsStudio).toBeVisible();
            // A table from tablets up, a list on phones: whichever is showing has every point.
            for (const row of CONTENT_LAB_VS_STUDIO) await expect(vsStudio.getByText(row.lab).locator('visible=true')).toHaveCount(1);
            await expectNoHorizontalOverflow(page);
        });

        test('a link example fills the box and previews what it would do', async ({ page }) => {
            await page.getByRole('button', { name: 'youtu.be/abc123xyz' }).click();
            await expect(page.locator(SMART_BOX)).toHaveValue('https://youtu.be/abc123xyz');
            await expect(page.getByTestId('smart-box-list').getByRole('option', { name: /Break down this video/ })).toBeVisible();
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

        test('sources picked before searching run the search there and are remembered; the last one cannot be unticked', async ({ page }) => {
            const explore = await mockContentLab(page, 'EXPLORE', ok(exploreResponse({ platforms: ['instagram'] })));
            await toggleSource(page, 'YouTube');
            await expect(page.getByRole('button', { name: 'Sources: Instagram' })).toBeVisible();
            await page.getByRole('button', { name: 'Sources: Instagram' }).click();
            await expect(page.getByRole('menuitemcheckbox', { name: /^Instagram/ })).toBeDisabled();
            await page.keyboard.press('Escape');
            await page.locator(SMART_BOX).fill('protein breakfast');
            await page.getByRole('button', { name: 'Go', exact: true }).click();

            await page.waitForURL(`**${CONTENT_LAB_EXPLORE_ROUTE}?q=protein+breakfast&platform=instagram`);
            await expect.poll(() => explore.requests.at(-1)?.platforms).toEqual(['instagram']);

            await page.goto(SEARCH_URL);
            await waitForSmartBox(page);
            await expect(page.getByRole('button', { name: 'Sources: Instagram' })).toBeVisible();
        });

        test('typing a topic lists its score, what people also search and matching creators', async ({ page }) => {
            const keyword = await mockContentLab(page, 'KEYWORD', (body) =>
                ok(body.trend ? keywordResponse() : keywordResponse({ trend: null, score: 70, summary: 'Lots of people search this on YouTube.' })),
            );
            await mockContentLab(page, 'SUGGEST', (body) =>
                ok({
                    query: body.query,
                    platform: body.platform,
                    creators:
                        body.platform === 'youtube'
                            ? [{ platform: 'youtube', handle: '@fitwithriya', name: 'Fit with Riya', avatarUrl: null, followers: 410_000, verified: true, url: null }]
                            : [],
                }),
            );
            const explore = await mockContentLab(page, 'EXPLORE', ok(exploreResponse()));
            await page.locator(SMART_BOX).fill('protein breakfast');

            const list = page.getByTestId('smart-box-list');
            await expect(list.getByTestId('keyword-score')).toContainText('81');
            await expect(list.getByTestId('keyword-score')).toContainText('Strong topic');
            await expect(list).toContainText('Lots of people search this on YouTube, and interest is up 23% in the last 4 weeks.');
            await expect(list.getByRole('option', { name: 'protein breakfast for weight loss' })).toBeVisible();
            await expect(list.getByTestId('smart-box-creator')).toContainText('Fit with Riya');
            await expectNoHorizontalOverflow(page);

            await list.getByRole('option', { name: 'protein breakfast for weight loss' }).click();
            await page.waitForURL(`**${CONTENT_LAB_EXPLORE_ROUTE}?q=protein+breakfast+for+weight+loss`);
            await expect.poll(() => explore.requests.at(-1)?.query).toBe('protein breakfast for weight loss');
            expect(keyword.requests.some((body) => body.trend === false)).toBe(true);
        });

        test('picking a creator from the list shows their standouts on that platform', async ({ page }) => {
            await mockContentLab(page, 'SUGGEST', (body) =>
                ok({
                    query: body.query,
                    platform: body.platform,
                    creators:
                        body.platform === 'instagram'
                            ? [{ platform: 'instagram', handle: '@hostelkitchen', name: 'Hostel Kitchen', avatarUrl: null, followers: 220_000, verified: false, url: null }]
                            : [],
                }),
            );
            const creator = await mockContentLab(page, 'CREATOR', (body) => ok(creatorResponse(body.platform as 'youtube' | 'instagram')));
            await page.locator(SMART_BOX).fill('@hostelkitchen');
            await page.getByTestId('smart-box-creator').filter({ hasText: 'Hostel Kitchen' }).click();

            await page.waitForURL(`**${CONTENT_LAB_EXPLORE_ROUTE}?creator=hostelkitchen&platform=instagram`);
            await expect(page.getByRole('heading', { name: 'Standouts from @hostelkitchen' })).toBeVisible();
            await expect.poll(() => creator.requests.map((r) => r.platform)).toContain('instagram');
            expect(creator.requests.every((r) => r.platform === 'instagram')).toBe(true);
        });

        test('a pasted link previews what it is before opening', async ({ page }) => {
            await page.locator(SMART_BOX).fill('https://www.youtube.com/shorts/abc123xyz');
            await expect(page.getByTestId('smart-box-list').getByRole('option', { name: /Break down this Short/ })).toBeVisible();
        });

        test('searches run come back as recent searches, in the box and as chips; each can be removed', async ({ page }) => {
            await mockContentLab(page, 'EXPLORE', ok(exploreResponse()));
            await mockContentLab(page, 'CREATOR', (body) => ok(creatorResponse(body.platform as 'youtube' | 'instagram')));
            await page.goto(`${CONTENT_LAB_EXPLORE_ROUTE}?q=${encodeURIComponent('skincare for men')}`);
            await expect(page.getByRole('heading', { name: `What's working in "skincare for men"` })).toBeVisible();
            await page.goto(`${CONTENT_LAB_EXPLORE_ROUTE}?creator=hostelkitchen`);
            await expect(page.getByRole('heading', { name: 'Standouts from @hostelkitchen' })).toBeVisible();

            await page.goto(SEARCH_URL);
            await waitForSmartBox(page);
            const chips = page.getByRole('region', { name: 'Recent searches' });
            await expect(chips.getByRole('link')).toHaveText(['@hostelkitchen', 'skincare for men']);

            await page.locator(SMART_BOX).focus();
            const rows = page.getByTestId('recent-search');
            await expect(rows).toHaveCount(2);
            await expect(rows.first()).toContainText('@hostelkitchen');
            await page.keyboard.press('Escape');

            await chips.getByRole('button', { name: 'Remove @hostelkitchen from recent searches' }).click();
            await expect(chips.getByRole('link')).toHaveText(['skincare for men']);
            await chips.getByRole('link', { name: 'skincare for men' }).click();
            await page.waitForURL(`**${CONTENT_LAB_EXPLORE_ROUTE}?q=skincare+for+men`);
            await page.goto(SEARCH_URL);
            await waitForSmartBox(page);
            await page.getByRole('region', { name: 'Recent searches' }).getByRole('button', { name: 'Clear' }).click();
            await expect(page.getByRole('region', { name: 'Recent searches' })).toHaveCount(0);
            await expectNoHorizontalOverflow(page);
        });

        test('a link sent to explore before hydration lands on its breakdown', async ({ page }) => {
            await mockContentLab(page, 'BREAKDOWN', ok(breakdownResponse('video')));
            await page.goto(`${CONTENT_LAB_EXPLORE_ROUTE}?q=${encodeURIComponent('https://www.youtube.com/shorts/abc123xyz')}`);
            await page.waitForURL(/\/content-lab\/search\/post\/youtube%3Aabc123xyz\?url=/);
        });
    });
}
