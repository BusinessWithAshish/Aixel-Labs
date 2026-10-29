import { ContentLabConnectionStatus } from '@aixellabs/backend/db/types';
import { E2E_GEMINI_API_KEY, USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import { FAKE_ACCESS_TOKEN, FAKE_INSTAGRAM_USER, FAKE_YOUTUBE_CHANNEL, FakeComposio } from '../voice-agent/fake-composio';
import { FakeGeminiKeyCheck, GOOD_KEY_PREFIX } from './fake-gemini';
import { enableContentLab, expect, expectNoSidewaysScroll, SETTINGS_URL, test, VIEWPORTS } from './support-boards';

/**
 * Content Lab settings: own accounts connected through Composio (a local fake, `fake-composio.ts`: the
 * Connect Link sends the browser straight back), a public-handle fallback, Content Lab's own Gemini key
 * (Google's key check is a local fake, `fake-gemini.ts`), and the defaults.
 */
const GOOD_KEY = `${GOOD_KEY_PREFIX}ContentLabKey0123456789abcdQrSt`;
const BAD_KEY = 'AIzaBadContentLabKey0123456789abcdefgh';

let composio: FakeComposio;
let gemini: FakeGeminiKeyCheck;

test.use({ storageState: USER_STORAGE_STATE });

test.beforeAll(async () => {
    [composio, gemini] = await Promise.all([FakeComposio.start(), FakeGeminiKeyCheck.start()]);
});

test.afterAll(async () => {
    await Promise.all([composio.stop(), gemini.close()]);
});

test.beforeEach(async ({ db, lab, context }) => {
    await db.resetUser(E2E_USER);
    await lab.reset(E2E_USER);
    // As seeded: the user has a working voice agent key. Content Lab must not use it.
    await db.setVoiceGeminiKey(E2E_USER, E2E_GEMINI_API_KEY);
    composio.requests.length = 0;
    composio.runs.length = 0;
    composio.sessions.clear();
    composio.refuseNext = false;
    gemini.keys.length = 0;
    await enableContentLab(context);
});

test.afterEach(() => {
    // Nothing may fall back to Composio's legacy direct execution or its non-session connect link.
    expect(composio.find('POST', /\/tools\/execute\/|\/connected_accounts\/link$/)).toHaveLength(0);
});

for (const viewport of VIEWPORTS) {
    test.describe(viewport.name, () => {
        test.use(viewport.use);

        test('connect YouTube: the account shows, fills the handle, reads only; then disconnect', async ({ page, lab }) => {
            await page.goto(SETTINGS_URL);
            const tile = page.getByTestId('account-youtube');
            await waitForHydration(page, '[data-testid="account-youtube"] button');
            await expectNoSidewaysScroll(page);

            await tile.getByRole('button', { name: 'Connect YouTube' }).click();
            await expect(page.getByText('YouTube connected as @mykitchenlab')).toBeVisible();
            await expect(page).toHaveURL(SETTINGS_URL);
            await expect(tile).toContainText('Connected');
            await expect(tile).toContainText(FAKE_YOUTUBE_CHANNEL.title);
            await expect(tile).toContainText('@mykitchenlab');
            await expect(tile).toContainText('48.2K followers');
            await expect(tile).toContainText('Read only');
            await expectNoSidewaysScroll(page);
            expect(await page.content()).not.toContain(FAKE_ACCESS_TOKEN);

            const profile = await lab.profiles.findOne({});
            expect(profile?.handles.youtube).toBe('mykitchenlab');
            expect(profile?.connections).toHaveLength(1);
            const [connection] = profile!.connections!;
            expect(connection).toMatchObject({
                platform: 'youtube',
                status: ContentLabConnectionStatus.ACTIVE,
                access: ['read'],
                account: { id: FAKE_YOUTUBE_CHANNEL.id, handle: 'mykitchenlab', followers: FAKE_YOUTUBE_CHANNEL.subscribers },
            });
            // Its own session, pinned to the account, allowing only the read tool.
            const session = composio.sessions.get(connection.composioSessionId!);
            expect(session?.account).toBe(connection.connectedAccountId);
            expect([...session!.tools]).toEqual(['YOUTUBE_LIST_CHANNELS']);
            expect(composio.toolRuns('YOUTUBE_LIST_CHANNELS')).toEqual([
                expect.objectContaining({ connected_account_id: connection.connectedAccountId, arguments: { mine: true, part: 'snippet,statistics' } }),
            ]);

            await tile.getByRole('button', { name: 'Disconnect' }).click();
            await expect(page.getByText('YouTube disconnected')).toBeVisible();
            await expect(tile.getByRole('button', { name: 'Connect YouTube' })).toBeVisible();
            const after = await lab.profiles.findOne({});
            expect(after?.connections).toEqual([]);
            expect(after?.handles.youtube).toBeUndefined();
            expect(composio.accounts.has(connection.connectedAccountId)).toBe(false);
        });

        test('reconnecting Instagram replaces the earlier connection', async ({ page, lab }) => {
            await page.goto(SETTINGS_URL);
            const tile = page.getByTestId('account-instagram');
            await waitForHydration(page, '[data-testid="account-instagram"] button');
            await tile.getByRole('button', { name: 'Connect Instagram' }).click();
            await expect(tile).toContainText(`@${FAKE_INSTAGRAM_USER.username}`);
            const first = (await lab.profiles.findOne({}))!.connections![0];

            await tile.getByRole('button', { name: 'Reconnect' }).click();
            await expect(page.getByText(`Instagram connected as @${FAKE_INSTAGRAM_USER.username}`)).toHaveCount(1);
            await expect(page).toHaveURL(SETTINGS_URL);
            await expect.poll(async () => (await lab.profiles.findOne({}))?.connections?.map((c) => c.connectedAccountId)).not.toContain(first.connectedAccountId);
            const profile = await lab.profiles.findOne({});
            expect(profile?.connections).toHaveLength(1);
            expect(profile?.handles.instagram).toBe(FAKE_INSTAGRAM_USER.username);
            expect(composio.accounts.has(first.connectedAccountId)).toBe(false);
            await expectNoSidewaysScroll(page);
        });

        test('a sign-in that does not finish says so and offers to connect again', async ({ page, lab }) => {
            composio.refuseNext = true;
            await page.goto(SETTINGS_URL);
            const tile = page.getByTestId('account-instagram');
            await waitForHydration(page, '[data-testid="account-instagram"] button');
            await tile.getByRole('button', { name: 'Connect Instagram' }).click();
            await expect(page.getByText(/Instagram was not connected/)).toBeVisible();
            await expect(tile).toContainText('Needs connecting again');
            await expect(tile.getByRole('button', { name: 'Reconnect Instagram' })).toBeVisible();
            const profile = await lab.profiles.findOne({});
            expect(profile?.connections?.[0]?.status).toBe(ContentLabConnectionStatus.FAILED);
            expect(profile?.handles.instagram).toBeUndefined();
        });

        test('public handles and defaults save and come back after a reload', async ({ page, lab }) => {
            await page.goto(SETTINGS_URL);
            await waitForHydration(page, 'form[aria-label="Your accounts"] button[type="submit"]');
            await expect(page.getByLabel('Country')).toHaveText('India');
            await expect(page.getByLabel('Language')).toHaveText('English');
            await expect(page.getByText('Beta', { exact: true })).toHaveCount(1);

            await page.getByTestId('account-youtube').getByRole('button', { name: 'or enter a public handle' }).click();
            await page.getByLabel('Or your public YouTube handle').fill('@MyKitchenLab');
            await page.getByLabel('X', { exact: true }).fill('@mkl');
            await page.getByRole('button', { name: 'Save handles' }).click();
            await expect(page.getByText('Settings saved')).toBeVisible();

            await page.getByLabel('Country').click();
            await page.getByRole('option', { name: 'United States' }).click();
            await page.getByLabel('Language').click();
            await page.getByRole('option', { name: 'Hinglish' }).click();
            await page.getByRole('button', { name: 'Save defaults' }).click();
            await expect(page.getByText('Settings saved').first()).toBeVisible();

            await expect
                .poll(async () => lab.profiles.findOne({}, { projection: { _id: 0, handles: 1, betaHandles: 1, country: 1, language: 1 } }))
                .toEqual({ handles: { youtube: 'mykitchenlab' }, betaHandles: { x: 'mkl' }, country: 'US', language: 'Hinglish' });

            await page.reload();
            await waitForHydration(page, 'form[aria-label="Your accounts"] button[type="submit"]');
            await expect(page.getByLabel('Or your public YouTube handle')).toHaveValue('mykitchenlab');
            await expect(page.getByLabel('X', { exact: true })).toHaveValue('mkl');
            await expect(page.getByLabel('LinkedIn')).toHaveValue('');
            await expect(page.getByLabel('Country')).toHaveText('United States');
            await expect(page.getByLabel('Language')).toHaveText('Hinglish');
            await expectNoSidewaysScroll(page);
        });

        test("Content Lab's own Gemini key: checked with Google, separate from the voice key", async ({ page, lab, db }) => {
            await page.goto(SETTINGS_URL);
            const status = page.getByTestId('ai-key-status');
            // The voice agent key does not count here.
            await expect(status).toContainText('No key yet');
            await waitForHydration(page, 'form[aria-label="Gemini API key"] button[type="submit"]');

            await page.getByRole('textbox', { name: 'Gemini API key' }).fill(BAD_KEY);
            await page.getByRole('button', { name: 'Save key' }).click();
            await expect(page.getByText('Google says this is not a valid API key', { exact: false })).toBeVisible();
            await expect(status).toContainText('No key yet');
            expect((await lab.profiles.findOne({}))?.aiKeys).toBeUndefined();

            await page.getByRole('textbox', { name: 'Gemini API key' }).fill(GOOD_KEY);
            await page.getByRole('button', { name: 'Save key' }).click();
            await expect(status).toContainText(`Working · ends in ${GOOD_KEY.slice(-4)}`);
            expect(gemini.keys).toEqual([BAD_KEY, GOOD_KEY]);
            const saved = (await lab.profiles.findOne({}))?.aiKeys?.gemini;
            expect(saved).toMatchObject({ last4: GOOD_KEY.slice(-4), status: 'OK' });
            expect(saved?.keySealed).not.toContain(GOOD_KEY);
            // The voice agent's key is untouched.
            expect((await db.getVoiceAccount(E2E_USER))?.keys).toHaveLength(1);
            expect(await page.content()).not.toContain(GOOD_KEY);

            await page.reload();
            await expect(status).toContainText(`Working · ends in ${GOOD_KEY.slice(-4)}`);
            await waitForHydration(page, 'form[aria-label="Gemini API key"] button[type="submit"]');
            await page.getByRole('button', { name: 'Check again' }).click();
            await expect(page.getByText('Checked with Google')).toBeVisible();
            await page.getByRole('button', { name: 'Remove key' }).click();
            await expect(status).toContainText('No key yet');
            expect((await lab.profiles.findOne({}))?.aiKeys?.gemini).toBeUndefined();
            await expectNoSidewaysScroll(page);
        });
    });
}
