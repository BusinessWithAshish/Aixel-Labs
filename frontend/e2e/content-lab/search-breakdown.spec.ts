import { CONTENT_LAB_ERROR_MESSAGES } from '@aixellabs/backend/content-lab/constants';
import { CONTENT_LAB_CHECK_ROUTE, contentLabPostRoute } from '@/config/app-config';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import { breakdownResponse, creatorResponse, enableContentLab, expectNoHorizontalOverflow, fail, mockContentLab, ok, VIEWPORTS } from './support-search';

const VIDEO_URL = 'https://www.youtube.com/watch?v=vidAAAAAA1';
const postUrl = (postId: string, url?: string) => `${contentLabPostRoute(postId)}${url ? `?url=${encodeURIComponent(url)}` : ''}`;

for (const { name, use } of VIEWPORTS) {
    test.describe(`Breakdown · ${name}`, () => {
        test.use({ storageState: USER_STORAGE_STATE, ...use });
        test.beforeEach(async ({ db, context }) => {
            await db.resetUser(E2E_USER);
            await enableContentLab(context);
        });

        test('a long video shows the hook, the timed structure, rewatch moments and the CTA', async ({ page }) => {
            const breakdown = await mockContentLab(page, 'BREAKDOWN', ok(breakdownResponse('video')));
            await page.goto(postUrl('youtube:vidAAAAAA1', VIDEO_URL));

            await expect(page.getByRole('heading', { name: 'I tried 30 days of protein breakfasts' })).toBeVisible();
            await expect(page.getByText('Hook · first 6 seconds')).toBeVisible();
            await expect(page.getByText('Type: shock number + promise of proof')).toBeVisible();
            await expect(page.getByText('Structure · 11:42')).toBeVisible();
            await expect(page.getByText('Viewers rewatched 2:14, 5:30 most')).toBeVisible();
            await expect(page.getByText('CTA · at 92%')).toBeVisible();
            await expect(page.getByText('Thumbnail', { exact: true })).toBeVisible();
            await expect(page.getByText('A concrete number up front sets the stakes.')).toBeVisible();
            await expect(page.getByText('14 times their usual views', { exact: true })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Write my version' })).toBeVisible();
            expect(breakdown.requests[0]).toMatchObject({ url: VIDEO_URL, country: 'IN' });
            await expectNoHorizontalOverflow(page);
        });

        test('a reel shows the first seconds and its pacing', async ({ page }) => {
            await mockContentLab(page, 'BREAKDOWN', ok(breakdownResponse('reel')));
            await page.goto(postUrl('instagram:reelBBBBB2', 'https://www.instagram.com/reel/reelBBBBB2/'));
            await expect(page.getByText('Hook · first 1.5 seconds')).toBeVisible();
            await expect(page.getByText('Pacing · 0:34 · 3 beats')).toBeVisible();
            await expect(page.getByText('Cover frame', { exact: true })).toBeVisible();
            await expect(page.getByText('Instagram · Reel').first()).toBeVisible();
            await expect(page.getByText('Structure ·')).toHaveCount(0);
            await expectNoHorizontalOverflow(page);
        });

        test('a Short gets the short-video layout too', async ({ page }) => {
            await mockContentLab(page, 'BREAKDOWN', ok(breakdownResponse('short')));
            await page.goto(postUrl('youtube:vidCCCCCC3', 'https://www.youtube.com/shorts/vidCCCCCC3'));
            await expect(page.getByText(/^Pacing · /)).toBeVisible();
            await expect(page.getByText('Instagram · Short').first()).toBeVisible();
        });

        test('a carousel shows the cover, the slide flow and the caption CTA', async ({ page }) => {
            await mockContentLab(page, 'BREAKDOWN', ok(breakdownResponse('carousel')));
            await page.goto(postUrl('instagram:carDDDDDD4'));
            await expect(page.getByText('Slide 1 · the cover')).toBeVisible();
            await expect(page.getByText('Slide flow · 8 slides')).toBeVisible();
            await expect(page.getByText('Caption CTA')).toBeVisible();
            await expect(page.getByText('Viewers rewatched')).toHaveCount(0);
            // No views on photo posts: likes against usual likes.
            await expect(page.getByText('60K', { exact: true }).first()).toBeVisible();
            await expectNoHorizontalOverflow(page);
        });

        test('rebuilds the post URL from the id when the link has none', async ({ page }) => {
            const breakdown = await mockContentLab(page, 'BREAKDOWN', ok(breakdownResponse('video')));
            await page.goto(postUrl('youtube:vidAAAAAA1'));
            await expect(page.getByText('Hook · first 6 seconds')).toBeVisible();
            expect(breakdown.requests[0]?.url).toBe(VIDEO_URL);
        });

        test('an id it cannot read says which links work', async ({ page }) => {
            await page.goto(postUrl('link'));
            await expect(page.getByText(CONTENT_LAB_ERROR_MESSAGES.UNSUPPORTED_URL)).toBeVisible();
        });

        test('a failed breakdown shows the error and tries again', async ({ page }) => {
            let calls = 0;
            await mockContentLab(page, 'BREAKDOWN', () => (++calls === 1 ? fail(CONTENT_LAB_ERROR_MESSAGES.NOT_FOUND, 502) : ok(breakdownResponse('video'))));
            await page.goto(postUrl('youtube:vidAAAAAA1', VIDEO_URL));
            await expect(page.getByRole('alert').filter({ hasText: 'This post could not be broken down' })).toContainText(CONTENT_LAB_ERROR_MESSAGES.NOT_FOUND);
            await page.getByRole('button', { name: 'Try again' }).click();
            await expect(page.getByText('Hook · first 6 seconds')).toBeVisible();
        });

        test('watch, check an idea and write my version', async ({ page }) => {
            await mockContentLab(page, 'BREAKDOWN', ok(breakdownResponse('video')));
            await mockContentLab(page, 'CREATOR', ok(creatorResponse('youtube')));
            await page.goto(postUrl('youtube:vidAAAAAA1', VIDEO_URL));

            await page.getByRole('button', { name: 'Watch @fitwithriya' }).click();
            await expect(page.getByText('Watching @fitwithriya')).toBeVisible();
            await expect(page.getByRole('link', { name: 'Check an idea' })).toHaveAttribute('href', `${CONTENT_LAB_CHECK_ROUTE}?platform=youtube`);

            await page.getByRole('button', { name: 'Write my version' }).click();
            await page.waitForURL(/\/content-lab\/boards\/[a-f0-9]{24}$/);
        });
    });
}
