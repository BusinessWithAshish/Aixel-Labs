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
    EXPLORE_POSTS,
    fail,
    keywordResponse,
    makePost,
    mockContentLab,
    ok,
    SMART_BOX,
    toggleSource,
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

        test('shows what the winners share, a plain summary and cards per platform; a failed platform says so', async ({ page }) => {
            await mockContentLab(page, 'EXPLORE', ok(exploreResponse({ errors: { instagram: 'Instagram blocked the search for now' } })));
            await page.goto(TOPIC_URL);

            const glance = page.getByRole('region', { name: 'What the top posts have in common' });
            await expect(glance).toBeVisible();
            await expect(glance.getByText('5 of 6', { exact: true })).toBeVisible();
            const stats = glance.getByTestId('explore-stats');
            await expect(stats).toContainText('Took off9 of 48twice their usual or more');
            await expect(stats).toContainText('Biggest jump14x usual@fitwithriya');
            await expect(stats).toContainText('Most views2.1M@hostelkitchen');
            await expect(stats).toContainText('Works bestVideosReels');
            await expect(page.getByRole('alert').filter({ hasText: 'Instagram results did not load' })).toContainText('Instagram blocked the search for now');

            const cards = page.getByTestId('content-lab-post-card');
            await expect(cards).toHaveCount(3);
            // Phones show one platform at a time (the other lane is hidden), so count by attribute, not by visible region.
            await expect(cards.and(page.locator('[data-platform="youtube"]'))).toHaveCount(2);
            await expect(cards.and(page.locator('[data-platform="instagram"]'))).toHaveCount(1);
            const first = cards.first();
            await expect(first).toHaveAttribute('data-platform', 'youtube');
            await expect(first).toContainText('14x usual');
            await expect(first).toContainText('14 times their usual views');
            await expect(first).toContainText('@fitwithriya · 1.2M views');
            await expect(first).toContainText('11:42');
            await expect(first).toContainText('Why: Number + 30-day test');
            await expect(first.getByRole('button', { name: 'Watch creator' })).toBeVisible();
            await expect(first.getByRole('button', { name: 'Use on a board' })).toBeVisible();
            await expectNoHorizontalOverflow(page);
        });

        test('sources and country re-run the search and stay in the URL; the search bar stays in view', async ({ page }) => {
            const explore = await mockContentLab(page, 'EXPLORE', ok(exploreResponse()));
            await page.goto(TOPIC_URL);
            await expect(page.getByTestId('content-lab-post-card')).toHaveCount(3);
            await waitForSmartBox(page);

            await toggleSource(page, 'Instagram');
            await expect.poll(() => explore.requests.at(-1)?.platforms).toEqual(['youtube']);
            await expect(page).toHaveURL(/platform=youtube/);
            await expect(page.getByRole('button', { name: 'Sources: YouTube' })).toBeVisible();

            await page.getByRole('combobox', { name: 'Country' }).click();
            await page.getByRole('option', { name: 'United States' }).click();
            await expect.poll(() => explore.requests.at(-1)?.country).toBe('US');
            await expect(page).toHaveURL(/country=US/);
            await expectNoHorizontalOverflow(page);

            await page.locator('#page-children-container').evaluate((el) => el.scrollTo(0, el.scrollHeight));
            await expect(page.locator(SMART_BOX)).toBeInViewport();
            await expect(page.locator(SMART_BOX)).toHaveValue('protein breakfast');
        });

        test('a newer search cancels the one in flight', async ({ page }) => {
            const aborted = trackAborted(page, 'EXPLORE');
            const explore = await mockContentLab(page, 'EXPLORE', (body) =>
                (body.platforms as string[]).length === 2 ? 'hang' : ok(exploreResponse({ posts: exploreResponse().posts.slice(0, 1) })),
            );
            await page.goto(TOPIC_URL);
            await expect(page.getByText('Finding posts that are doing better than usual…')).toBeVisible();
            await waitForSmartBox(page);

            await toggleSource(page, 'Instagram');
            await expect(page.getByTestId('content-lab-post-card')).toHaveCount(1);
            expect(explore.requests.at(-1)?.platforms).toEqual(['youtube']);
            // Dev mode's strict effects may abort one more; every hung request must have been aborted.
            await expect.poll(() => aborted.length).toBeGreaterThanOrEqual(1);
        });

        test('scrolling to the end loads the next page once, without repeats, until there is no more', async ({ page }) => {
            const page2 = [
                EXPLORE_POSTS[0],
                makePost({ id: 'youtube:vidEEEEEE5', title: 'High protein poha, 3 ways' }),
                makePost({ id: 'instagram:reelFFFFF6', platform: 'instagram', format: 'reel', title: 'Paneer toast in 5 minutes' }),
            ];
            const explore = await mockContentLab(page, 'EXPLORE', (body) =>
                ok(body.cursor === 'page-2' ? exploreResponse({ posts: page2, takeaways: [], nextCursor: null }) : exploreResponse({ nextCursor: 'page-2' })),
            );
            await page.goto(TOPIC_URL);
            await expect(page.getByTestId('content-lab-post-card')).toHaveCount(3);

            // Scroll the page to its end, as a reader would; the list's end swaps elements as it loads, so no locator to scroll to.
            await page.evaluate(() => document.getElementById('page-children-container')?.scrollTo(0, 1e6));
            await expect(page.getByTestId('content-lab-post-card')).toHaveCount(5);
            await expect(page.getByText("That's everything we found for this search.")).toBeVisible();
            const paged = explore.requests.filter((body) => body.cursor === 'page-2');
            expect(paged).toHaveLength(1);
            expect(paged[0]).toMatchObject({ query: 'protein breakfast', country: 'IN' });
            await expectNoHorizontalOverflow(page);
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

        test('says how strong the topic is while the posts load; a related search runs that search', async ({ page }) => {
            await mockContentLab(page, 'EXPLORE', 'hang');
            const keyword = await mockContentLab(page, 'KEYWORD', ok(keywordResponse()));
            await page.goto(TOPIC_URL);

            const card = page.getByTestId('keyword-card');
            await expect(card.getByTestId('keyword-card-score')).toHaveText('81');
            await expect(card).toContainText('Strong topic');
            await expect(card).toContainText('Lots of people search this on YouTube, and interest is up 23% in the last 4 weeks.');
            await expect(card).toContainText('Rising +23%');
            await expect(page.getByText('Finding posts that are doing better than usual…')).toBeVisible();
            // The search box above asks nothing until it is used: the card's request is the only one.
            expect(keyword.requests.map((body) => body.trend)).not.toContain(false);
            expect(keyword.requests.at(-1)).toMatchObject({ query: 'protein breakfast', country: 'IN', trend: true });

            await mockContentLab(page, 'EXPLORE', ok(exploreResponse({ query: 'high protein poha' })));
            await card.getByRole('link', { name: 'high protein poha' }).click();
            await page.waitForURL(`**${CONTENT_LAB_EXPLORE_ROUTE}?q=high+protein+poha`);
            await expect(page.getByRole('heading', { name: `What's working in "high protein poha"` })).toBeVisible();
            await expectNoHorizontalOverflow(page);
        });

        test('a card restating the jump does not repeat it as the reason', async ({ page }) => {
            const posts = [makePost({ id: 'youtube:vidGGGGGG7', reasons: ['14 times their usual views', 'Number in the title'] })];
            await mockContentLab(page, 'EXPLORE', ok(exploreResponse({ posts })));
            await page.goto(TOPIC_URL);
            const card = page.getByTestId('content-lab-post-card').first();
            await expect(card).toContainText('Why: Number in the title');
            await expect(card).not.toContainText('Why: 14 times');
        });

        test('use on a board starts a board seeded with the post', async ({ page }) => {
            await mockContentLab(page, 'EXPLORE', ok(exploreResponse()));
            await page.goto(TOPIC_URL);
            await page.getByTestId('content-lab-post-card').first().getByRole('button', { name: 'Use on a board' }).click();
            await page.waitForURL(/\/content-lab\/boards\/[a-f0-9]{24}$/);
        });
    });
}
