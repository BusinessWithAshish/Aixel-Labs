import type { CONTENT_LAB_CREATOR_RESPONSE, CONTENT_LAB_SUGGESTION } from '@aixellabs/backend/content-lab/types';
import { USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import {
    enableContentLab,
    expect,
    expectNoSidewaysScroll,
    fakeCreator,
    fakePost,
    mockContentLabApi,
    test,
    VIEWPORTS,
    WATCHING_URL,
} from './support-boards';

test.use({ storageState: USER_STORAGE_STATE });

const SEARCH_BOX = 'Creator name or handle';
const ADD_FORM = 'form[aria-label="Watch a creator"] button[type="submit"]';

const suggestion = (handle: string, name: string, fields: Partial<CONTENT_LAB_SUGGESTION> = {}): CONTENT_LAB_SUGGESTION => ({
    platform: 'youtube',
    handle: `@${handle}`,
    name,
    avatarUrl: null,
    followers: 120_000,
    verified: false,
    url: `https://www.youtube.com/@${handle}`,
    ...fields,
});

/** An Instagram creator whose recent posts are reels. */
function fakeReelCreator(handle: string): CONTENT_LAB_CREATOR_RESPONSE {
    return {
        creator: { platform: 'instagram', id: handle, handle, name: 'Hostel Kitchen', url: null, followers: 64_000, avatarUrl: null, bio: 'Hostel food under ₹50' },
        usualViews: 30_000,
        posts: [6.4, 1, 0.8, 1.2].map((multiple, index) =>
            fakePost({ id: `instagram:${handle}-${index}`, platform: 'instagram', title: `reel ${index}`, multiple, publishedAt: `2026-10-${20 - index}T10:00:00.000Z` }),
        ),
    };
}

test.beforeEach(async ({ db, lab, context }) => {
    await db.resetUser(E2E_USER);
    await lab.reset(E2E_USER);
    await enableContentLab(context);
});

for (const viewport of VIEWPORTS) {
    test.describe(viewport.name, () => {
        test.use(viewport.use);

        test('type-ahead finds creators as you type; arrow keys and Enter add one with their posts in plain words', async ({ page, lab }) => {
            const calls = await mockContentLabApi(page, {
                suggest: () => ({
                    query: 'riya',
                    platform: 'youtube',
                    creators: [suggestion('fitwithriya', 'Fit with Riya', { verified: true }), suggestion('riyacooks', 'Riya Cooks', { followers: 8_400 })],
                }),
                creator: ({ handle }) => fakeCreator(handle.replace(/^@/, ''), [5.2, 1.1, 3, null, 0.9]),
            });
            await page.goto(WATCHING_URL);
            await expect(page.getByText('No creators watched yet')).toBeVisible();
            await expectNoSidewaysScroll(page);
            await waitForHydration(page, ADD_FORM);

            await page.getByRole('combobox', { name: SEARCH_BOX }).pressSequentially('riya', { delay: 40 });
            const rows = page.getByTestId('creator-suggestion');
            await expect(rows).toHaveCount(2);
            await expect(rows.first()).toContainText('Fit with Riya');
            await expect(rows.first()).toContainText('@fitwithriya');
            await expect(rows.first()).toContainText('120K followers');
            await expect(rows.first().getByLabel('Verified')).toBeVisible();
            await expect(rows.nth(1)).toContainText('8.4K followers');
            await expect(page.getByRole('option', { name: /Watch @riya/ })).toBeVisible();
            await expectNoSidewaysScroll(page);
            // One request for the settled text (typing faster than the wait), with what was typed.
            expect(calls.SUGGEST.map((request) => request.postDataJSON())).toEqual([{ platform: 'youtube', query: 'riya', country: 'IN' }]);

            await page.getByRole('combobox', { name: SEARCH_BOX }).press('ArrowDown');
            await page.getByRole('combobox', { name: SEARCH_BOX }).press('Enter');

            const card = page.getByTestId('watch-card');
            await expect(card).toHaveCount(1);
            expect(calls.CREATOR[0].postDataJSON()).toMatchObject({ platform: 'youtube', handle: '@riyacooks' });
            await expect(card).toContainText('Name of riyacooks');
            await expect(card).toContainText('@riyacooks');
            await expect(card).toContainText('120K followers');
            await expect(card).toContainText('Bio of riyacooks');
            await expect(card).toContainText('85K');
            await expect(card).toContainText('less than a minute ago');
            await expect(card.getByTestId('recent-post')).toHaveCount(4);
            await expect(card.getByTestId('standout')).toHaveText([/post 0.*Got 5\.2 times their usual views/, /post 2.*Got 3 times their usual views/]);
            await expect(page.getByRole('combobox', { name: SEARCH_BOX })).toHaveValue('');
            await expectNoSidewaysScroll(page);

            const [saved] = await lab.watchlist.find({}).toArray();
            expect(saved).toMatchObject({
                platform: 'youtube',
                handle: 'riyacooks',
                followers: 120_000,
                usualViews: 85_000,
                bio: 'Bio of riyacooks',
                profileUrl: 'https://www.youtube.com/@riyacooks',
            });
            expect(saved.recent?.map((post) => post.multiple)).toEqual([5.2, 1.1, 3, null, 0.9]);
            expect(saved.standouts.map((s) => s.multiple)).toEqual([5.2, 3]);
            expect(saved.lastCheckedAt).toBeInstanceOf(Date);

            await page.getByRole('button', { name: 'Stop watching @riyacooks' }).click();
            await expect(page.getByText('No creators watched yet')).toBeVisible();
            expect(await lab.watchlist.countDocuments({})).toBe(0);
        });

        test('Instagram from the platform list; a handle with no match is added as typed, with tall reel thumbnails', async ({ page, lab }) => {
            const calls = await mockContentLabApi(page, {
                suggest: () => ({ query: 'hostelkitchen', platform: 'instagram', creators: [] }),
                creator: ({ handle }) => fakeReelCreator(handle.replace(/^@/, '').toLowerCase()),
            });
            await page.goto(WATCHING_URL);
            await waitForHydration(page, ADD_FORM);

            await page.getByLabel('Platform').click();
            const instagram = page.getByRole('option', { name: 'Instagram' });
            await expect(instagram.locator('img')).toHaveAttribute('src', /instagram/);
            await instagram.click();
            await expect(page.getByLabel('Platform')).toHaveText('Instagram');

            await page.getByRole('combobox', { name: SEARCH_BOX }).fill('@HostelKitchen');
            await expect(page.getByText('No Instagram creators match that.')).toBeVisible();
            await page.getByRole('combobox', { name: SEARCH_BOX }).press('Enter');

            const card = page.getByTestId('watch-card');
            await expect(card).toHaveCount(1);
            expect(calls.CREATOR[0].postDataJSON()).toMatchObject({ platform: 'instagram', handle: '@HostelKitchen' });
            await expect(card).toContainText('Hostel food under ₹50');
            await expect(card.getByTestId('standout')).toHaveText([/reel 0.*Got 6\.4 times their usual views/]);
            const thumb = await card.getByTestId('recent-post').first().locator('[role="img"], img').first().boundingBox();
            expect(thumb!.height).toBeGreaterThan(thumb!.width);
            await expectNoSidewaysScroll(page);
            expect((await lab.watchlist.findOne({}))?.platform).toBe('instagram');
        });

        test('when suggestions fail, the Watch button still adds the handle as typed', async ({ page }) => {
            await mockContentLabApi(page, { creator: ({ handle }) => fakeCreator(handle.replace(/^@/, ''), [2.5]) });
            await page.goto(WATCHING_URL);
            await waitForHydration(page, ADD_FORM);
            await page.getByRole('combobox', { name: SEARCH_BOX }).fill('desidiet');
            await expect(page.getByRole('option', { name: /Watch @desidiet/ })).toBeVisible();
            await page.getByRole('button', { name: 'Watch', exact: true }).click();
            await expect(page.getByTestId('watch-card')).toContainText('@desidiet');
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
            await expect(page.getByText('Nothing far above their usual yet')).toHaveCount(2);
            await expect(page.getByText('Refresh to load their recent posts.')).toHaveCount(2);
            await expect(page.getByText('Watching 2 creators')).toBeVisible();
            await waitForHydration(page, 'section[aria-label="Watched creators"] button');

            await page.getByRole('button', { name: 'Refresh all' }).click();
            await expect(page.getByRole('status').filter({ hasText: 'Refreshing 1 of 2' })).toBeVisible();
            await expect(page.getByTestId('standout')).toHaveCount(3);
            await expect(page.getByRole('button', { name: 'Refresh all' })).toBeEnabled();
            await expectNoSidewaysScroll(page);

            // Newest watch first, one at a time.
            expect(calls.CREATOR.map((request) => request.postDataJSON())).toEqual([
                expect.objectContaining({ platform: 'instagram', handle: 'hostelkitchen' }),
                expect.objectContaining({ platform: 'youtube', handle: 'desidiet' }),
            ]);
            const saved = await lab.watchlist.find({}).sort({ handle: 1 }).toArray();
            expect(saved.map((watch) => [watch.handle, watch.standouts.length, watch.recent?.length, watch.lastCheckedAt instanceof Date])).toEqual([
                ['desidiet', 1, 1, true],
                ['hostelkitchen', 2, 2, true],
            ]);
        });
    });
}
