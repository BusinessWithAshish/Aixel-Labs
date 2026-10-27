import { USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import {
    enableContentLab,
    expect,
    expectNoSidewaysScroll,
    fakeCreator,
    mockContentLabApi,
    test,
    VIEWPORTS,
    WATCHING_URL,
} from './support-boards';

test.use({ storageState: USER_STORAGE_STATE });

test.beforeEach(async ({ db, lab, context }) => {
    await db.resetUser(E2E_USER);
    await lab.reset(E2E_USER);
    await enableContentLab(context);
});

for (const viewport of VIEWPORTS) {
    test.describe(viewport.name, () => {
        test.use(viewport.use);

        test('add a creator, then stop watching: back to the empty state', async ({ page, lab }) => {
            const calls = await mockContentLabApi(page, { creator: ({ handle }) => fakeCreator(handle, [5.2, 1.1, 3, null]) });
            await page.goto(WATCHING_URL);
            await expect(page.getByText('No creators watched yet')).toBeVisible();
            await expectNoSidewaysScroll(page);

            await waitForHydration(page, 'form[aria-label="Watch a creator"] button[type="submit"]');
            await page.getByLabel('Creator handle').fill('@FitWithRiya');
            await page.getByRole('button', { name: 'Watch' }).click();

            const card = page.getByTestId('watch-card');
            await expect(card).toHaveCount(1);
            await expect(card).toContainText('Name of @FitWithRiya');
            await expect(card).toContainText('@fitwithriya');
            await expect(card).toContainText('120K');
            await expect(card).toContainText('85K');
            await expect(card.getByTestId('standout-chip')).toHaveText([/post 0\s*5\.2x/, /post 2\s*3x/]);
            await expectNoSidewaysScroll(page);
            expect(calls.CREATOR[0].postDataJSON()).toMatchObject({ platform: 'youtube', handle: '@FitWithRiya' });

            const [saved] = await lab.watchlist.find({}).toArray();
            expect(saved).toMatchObject({ platform: 'youtube', handle: 'fitwithriya', followers: 120_000, usualViews: 85_000 });
            expect(saved.standouts.map((s) => s.multiple)).toEqual([5.2, 3]);
            expect(saved.lastCheckedAt).toBeInstanceOf(Date);

            await page.getByRole('button', { name: 'Stop watching @fitwithriya' }).click();
            await expect(page.getByText('No creators watched yet')).toBeVisible();
            expect(await lab.watchlist.countDocuments({})).toBe(0);
        });

        test('Refresh all checks each creator in turn and saves their standouts', async ({ page, lab }) => {
            await lab.insertWatch(E2E_USER, { platform: 'youtube', handle: 'desidiet', createdAt: new Date(Date.now() - 2_000) });
            await lab.insertWatch(E2E_USER, { platform: 'instagram', handle: 'hostelkitchen' });
            const calls = await mockContentLabApi(page, {
                creator: ({ handle }) => fakeCreator(handle, handle === 'desidiet' ? [2.5] : [9.4, 4]),
                delayMs: 300,
            });
            await page.goto(WATCHING_URL);
            await expect(page.getByTestId('watch-card')).toHaveCount(2);
            await expect(page.getByText('Nothing far above usual yet')).toHaveCount(2);
            await waitForHydration(page, 'section[aria-label="Watched creators"] button');

            await page.getByRole('button', { name: 'Refresh all' }).click();
            await expect(page.getByRole('status').filter({ hasText: 'Refreshing 1 of 2' })).toBeVisible();
            await expect(page.getByRole('status').filter({ hasText: 'Refreshing 2 of 2' })).toBeVisible();
            await expect(page.getByTestId('standout-chip')).toHaveCount(3);
            await expect(page.getByRole('button', { name: 'Refresh all' })).toBeEnabled();
            await expectNoSidewaysScroll(page);

            // Newest watch first, one at a time.
            expect(calls.CREATOR.map((request) => request.postDataJSON())).toEqual([
                expect.objectContaining({ platform: 'instagram', handle: 'hostelkitchen' }),
                expect.objectContaining({ platform: 'youtube', handle: 'desidiet' }),
            ]);
            const saved = await lab.watchlist.find({}).sort({ handle: 1 }).toArray();
            expect(saved.map((watch) => [watch.handle, watch.standouts.length, watch.lastCheckedAt instanceof Date])).toEqual([
                ['desidiet', 1, true],
                ['hostelkitchen', 2, true],
            ]);
        });
    });
}
