import { CONTENT_LAB_EXPLORE_ROUTE } from '@/config/app-config';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import {
    breakdownResponse,
    creatorResponse,
    enableContentLab,
    expectNoHorizontalOverflow,
    exploreResponse,
    fail,
    mockContentLab,
    ok,
    SMART_BOX,
    trackAborted,
    VIEWPORTS,
    waitForSmartBox,
} from './support-search';

const TOPIC_URL = `${CONTENT_LAB_EXPLORE_ROUTE}?q=${encodeURIComponent('protein breakfast')}`;

for (const { name, use } of VIEWPORTS) {
    test.describe(`Explore · ${name}`, () => {
        test.use({ storageState: USER_STORAGE_STATE, ...use });
        test.beforeEach(async ({ db, context }) => {
            await db.resetUser(E2E_USER);
            await enableContentLab(context);
        });

        test('shows takeaways, the niche snapshot and ranked cards; a failed platform says so', async ({ page }) => {
            await mockContentLab(page, 'EXPLORE', ok(exploreResponse({ errors: { instagram: 'Instagram blocked the search for now' } })));
            await page.goto(TOPIC_URL);

            await expect(page.getByRole('heading', { name: 'In one glance' })).toBeVisible();
            await expect(page.getByText('5 of 6', { exact: true })).toBeVisible();
            const snapshot = page.getByRole('region', { name: 'Niche snapshot' });
            await expect(snapshot).toContainText('48');
            await expect(snapshot).toContainText('Videos on YouTube, Reels on Instagram');
            await expect(page.getByRole('alert').filter({ hasText: 'Instagram results did not load' })).toContainText('Instagram blocked the search for now');

            const cards = page.getByTestId('content-lab-post-card');
            await expect(cards).toHaveCount(3);
            const first = cards.first();
            await expect(first).toContainText('YouTube · Video');
            await expect(first).toContainText('14x');
            await expect(first).toContainText('their usual views');
            await expect(first).toContainText('@fitwithriya · 1.2M views (usually 85K)');
            await expect(first).toContainText('Why: Number + 30-day test');
            await expect(first.getByRole('button', { name: 'Watch creator' })).toBeVisible();
            await expect(first.getByRole('button', { name: 'Use on a board' })).toBeVisible();
            await expectNoHorizontalOverflow(page);
        });

        test('platform and country re-run the search and stay in the URL', async ({ page }) => {
            const explore = await mockContentLab(page, 'EXPLORE', ok(exploreResponse()));
            await page.goto(TOPIC_URL);
            await expect(page.getByTestId('content-lab-post-card')).toHaveCount(3);
            await waitForSmartBox(page);

            await page.getByRole('radio', { name: 'YouTube', exact: true }).click();
            await expect.poll(() => explore.requests.at(-1)?.platforms).toEqual(['youtube']);
            await expect(page).toHaveURL(/platform=youtube/);

            await page.getByRole('combobox', { name: 'Country' }).click();
            await page.getByRole('option', { name: 'United States' }).click();
            await expect.poll(() => explore.requests.at(-1)?.country).toBe('US');
            await expect(page).toHaveURL(/country=US/);
            await expectNoHorizontalOverflow(page);
        });

        test('a newer search cancels the one in flight', async ({ page }) => {
            const aborted = trackAborted(page, 'EXPLORE');
            const explore = await mockContentLab(page, 'EXPLORE', (body) =>
                (body.platforms as string[]).length === 2 ? 'hang' : ok(exploreResponse({ posts: exploreResponse().posts.slice(0, 1) })),
            );
            await page.goto(TOPIC_URL);
            await expect(page.getByText('Finding posts that beat their usual…')).toBeVisible();
            await waitForSmartBox(page);

            await page.getByRole('radio', { name: 'YouTube', exact: true }).click();
            await expect(page.getByTestId('content-lab-post-card')).toHaveCount(1);
            expect(explore.requests.at(-1)?.platforms).toEqual(['youtube']);
            // Dev mode's strict effects may abort one more; every hung request must have been aborted.
            await expect.poll(() => aborted.length).toBeGreaterThanOrEqual(1);
        });

        test('no posts shows the empty state', async ({ page }) => {
            await mockContentLab(page, 'EXPLORE', ok(exploreResponse({ posts: [], takeaways: [] })));
            await page.goto(TOPIC_URL);
            await expect(page.getByText('No posts found for "protein breakfast"')).toBeVisible();
            await expectNoHorizontalOverflow(page);
        });

        test('a failed search shows the error and tries again', async ({ page }) => {
            let calls = 0;
            await mockContentLab(page, 'EXPLORE', () => (++calls === 1 ? fail('Service is temporarily unavailable') : ok(exploreResponse())));
            await page.goto(TOPIC_URL);
            await expect(page.getByRole('alert').filter({ hasText: 'Results did not load' })).toContainText('Service is temporarily unavailable');
            await page.getByRole('button', { name: 'Try again' }).click();
            await expect(page.getByTestId('content-lab-post-card')).toHaveCount(3);
        });

        test('a new search from the box replaces the results', async ({ page }) => {
            const explore = await mockContentLab(page, 'EXPLORE', (body) =>
                ok(exploreResponse({ query: String(body.query), posts: body.query === 'paneer recipes' ? [] : exploreResponse().posts })),
            );
            await page.goto(TOPIC_URL);
            await waitForSmartBox(page);
            await page.locator(SMART_BOX).fill('paneer recipes');
            await page.locator(SMART_BOX).press('Enter');
            await expect(page.getByRole('heading', { name: `What's working in "paneer recipes"` })).toBeVisible();
            await expect(page.getByText('No posts found for "paneer recipes"')).toBeVisible();
            expect(explore.requests.at(-1)?.query).toBe('paneer recipes');
        });

        test('a card opens its breakdown', async ({ page }) => {
            await mockContentLab(page, 'EXPLORE', ok(exploreResponse()));
            await mockContentLab(page, 'BREAKDOWN', ok(breakdownResponse('video')));
            await page.goto(TOPIC_URL);
            await page.getByTestId('content-lab-post-card').first().getByRole('link').click();
            await page.waitForURL(/\/content-lab\/search\/post\/youtube%3AvidAAAAAA1\?url=/);
            await expect(page.getByText('Hook · first 6 seconds')).toBeVisible();
        });

        test('watch creator looks the creator up and adds them to Watching', async ({ page }) => {
            await mockContentLab(page, 'EXPLORE', ok(exploreResponse()));
            const creator = await mockContentLab(page, 'CREATOR', (body) => ok(creatorResponse(body.platform as 'youtube' | 'instagram')));
            await page.goto(TOPIC_URL);
            await page.getByTestId('content-lab-post-card').first().getByRole('button', { name: 'Watch creator' }).click();
            await expect(page.getByText('Watching @fitwithriya')).toBeVisible();
            expect(creator.requests[0]).toMatchObject({ platform: 'youtube', handle: 'fitwithriya', country: 'IN' });
        });

        test('use on a board starts a board seeded with the post', async ({ page }) => {
            await mockContentLab(page, 'EXPLORE', ok(exploreResponse()));
            await page.goto(TOPIC_URL);
            await page.getByTestId('content-lab-post-card').first().getByRole('button', { name: 'Use on a board' }).click();
            await page.waitForURL(/\/content-lab\/boards\/[a-f0-9]{24}$/);
        });
    });
}
