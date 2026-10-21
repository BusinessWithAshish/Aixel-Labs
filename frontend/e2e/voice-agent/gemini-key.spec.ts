import { createServer, type Server } from 'node:http';
import type { Page, Response } from '@playwright/test';
import { VoiceAgentCallType, VoiceCallChannel, VoiceCallDirection, VoiceGeminiKeyStatus } from '@aixellabs/backend/db/types';
import type { E2eDb } from '../support/db';
import { expect, test } from '../support/fixtures';
import { E2E_GEMINI_API_BASE, E2E_GEMINI_API_KEY, USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import {
    FAKE_MIC_LAUNCH_ARGS,
    FakePlaygroundEngine,
    openVoiceAgent,
    VOICE_AGENTS_URL,
    waitForHydration,
} from '../support/voice-agents';
import { CALL_LOGS_URL, FAKE_TELNYX_KEY, PHONE_NUMBERS_URL, sealForE2e } from './fake-telephony';

/**
 * Every customer runs their agents on their own Gemini API key. Google's key check (list models)
 * is a local fake on 7879 (`GEMINI_API_BASE`): it accepts keys starting `AIzaGood` and answers the
 * others the way Google does for an invalid key, an API that is turned off, and no quota.
 */
const GOOD_KEY = 'AIzaGoodE2eKey0123456789abcdefghijkWxYz';
const INVALID_KEY = 'AIzaBadE2eKey0123456789abcdefghijklmnop';
const DISABLED_KEY = 'AIzaDisabledE2eKey0123456789abcdefghijk';
const QUOTA_KEY = 'AIzaQuotaE2eKey0123456789abcdefghijklmn';
const NUMBER = '+13473700001';

function googleError(code: number, status: string, reason: string, message: string) {
    return { error: { code, message, status, details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] } };
}

/** Google's `GET /v1beta/models`, enough of it to check a key. */
class FakeGemini {
    readonly keys: string[] = [];
    readonly urls: string[] = [];
    private constructor(private readonly server: Server) {}

    static async start(): Promise<FakeGemini> {
        const fake: FakeGemini = new FakeGemini(
            createServer((req, res) => {
                const key = String(req.headers['x-goog-api-key'] ?? '');
                fake.keys.push(key);
                fake.urls.push(req.url ?? '');
                const reply = (status: number, body: unknown) => {
                    res.writeHead(status, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(body));
                };
                if (!req.url?.startsWith('/v1beta/models'))
                    return reply(404, googleError(404, 'NOT_FOUND', '', 'Not found'));
                if (key.startsWith('AIzaGood')) return reply(200, { models: [{ name: 'models/gemini-3.8-live' }] });
                if (key === DISABLED_KEY) {
                    return reply(
                        403,
                        googleError(
                            403,
                            'PERMISSION_DENIED',
                            'SERVICE_DISABLED',
                            'Generative Language API has not been used in project 1234 before or it is disabled.',
                        ),
                    );
                }
                if (key === QUOTA_KEY) {
                    return reply(429, googleError(429, 'RESOURCE_EXHAUSTED', 'RATE_LIMIT_EXCEEDED', 'Quota exceeded.'));
                }
                reply(
                    400,
                    googleError(
                        400,
                        'INVALID_ARGUMENT',
                        'API_KEY_INVALID',
                        'API key not valid. Please pass a valid API key.',
                    ),
                );
            }),
        );
        const { port } = new URL(E2E_GEMINI_API_BASE);
        await new Promise<void>((resolve) => fake.server.listen(Number(port), '127.0.0.1', resolve));
        return fake;
    }

    close(): Promise<void> {
        return new Promise((resolve) => this.server.close(() => resolve()));
    }
}

let gemini: FakeGemini;

test.use({
    storageState: USER_STORAGE_STATE,
    permissions: ['microphone'],
    launchOptions: { args: FAKE_MIC_LAUNCH_ARGS },
});

test.beforeAll(async () => {
    gemini = await FakeGemini.start();
});

test.afterAll(async ({ db }) => {
    await gemini.close();
    await db.setVoiceGeminiKey(E2E_USER, E2E_GEMINI_API_KEY); // the seeded key, for the specs after this one
});

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
    await db.setVoiceGeminiKey(E2E_USER, null);
});

async function openAgents(page: Page): Promise<void> {
    await page.goto(VOICE_AGENTS_URL);
    await waitForHydration(page, '[data-testid="gemini-key-card"] button');
}

async function openPhoneNumbers(page: Page): Promise<void> {
    await page.goto(PHONE_NUMBERS_URL);
    await waitForHydration(page, '#header');
}

/** An inbound and an outbound agent, and a Telnyx number with neither set. */
async function seedAgentsAndNumber(db: E2eDb) {
    const inbound = await db.insertVoiceAgent(E2E_USER, { name: 'Front desk', callType: VoiceAgentCallType.INBOUND });
    const outbound = await db.insertVoiceAgent(E2E_USER, { name: 'Sales outreach', callType: VoiceAgentCallType.OUTBOUND });
    await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: NUMBER,
        providerNumberId: 'pn-gemini-e2e',
        apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
    });
    return { inbound, outbound };
}

const card = (page: Page) => page.getByTestId('gemini-key-card');
const numberRow = (page: Page) => page.getByTestId('voice-number-row').filter({ hasText: NUMBER });

test('without a key: the card says so, and the playground, answering, making calls and test calls explain it', async ({
    page,
    db,
}) => {
    const { inbound } = await seedAgentsAndNumber(db);

    await openAgents(page);
    await expect(card(page).getByTestId('gemini-key-status')).toHaveText('Not set');
    await expect(card(page)).toContainText('Until you add one, your agents cannot take or place calls.');
    await expect(card(page).getByRole('button', { name: 'Add key' })).toBeVisible();

    await openVoiceAgent(page, inbound);
    const playground = page.getByTestId('voice-playground');
    await expect(playground.getByTestId('gemini-key-notice')).toContainText(
        'Add your Gemini API key to talk to your agents.',
    );
    await expect(playground.getByRole('button', { name: 'Start call' })).toBeDisabled();
    await expect(playground.getByRole('link', { name: 'Add your key' })).toHaveAttribute(
        'href',
        `${VOICE_AGENTS_URL}#gemini-key`,
    );

    await openPhoneNumbers(page);
    await expect(page.getByTestId('gemini-key-notice')).toContainText('Add your Gemini API key to answer or make calls.');
    await expect(numberRow(page).getByRole('radio', { name: 'Answer calls' })).toBeDisabled();
    await expect(numberRow(page).getByRole('radio', { name: 'Make calls' })).toBeDisabled();
    await expect(numberRow(page).getByTestId('gemini-key-hint')).toHaveCount(1);
    await numberRow(page).getByRole('button', { name: 'Test call' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test call' });
    await expect(dialog.getByTestId('gemini-key-notice')).toContainText('Add your Gemini API key to place calls.');
    await expect(dialog.getByRole('button', { name: 'Call me now' })).toHaveCount(0);

    // The link takes them to the card.
    await page.keyboard.press('Escape');
    await page.getByTestId('gemini-key-notice').getByRole('link', { name: 'Add your key' }).click();
    await expect(page).toHaveURL(new RegExp(`${VOICE_AGENTS_URL}#gemini-key$`));
    await expect(card(page)).toBeInViewport();
});

test('the server refuses too: a key removed after the page loaded blocks answering calls and the playground', async ({
    page,
    db,
}) => {
    const { inbound } = await seedAgentsAndNumber(db);
    await db.setVoiceGeminiKey(E2E_USER, GOOD_KEY);

    await openPhoneNumbers(page);
    await expect(page.getByTestId('gemini-key-notice')).toHaveCount(0);
    await db.setVoiceGeminiKey(E2E_USER, null);
    await numberRow(page).getByRole('radio', { name: 'Answer calls' }).click();
    await expect(page.getByText('Add your Gemini API key first (Voice agents page, Gemini API key).')).toBeVisible();
    await expect(numberRow(page).getByTestId('number-job')).toHaveText('Not used yet');
    expect((await db.getVoiceNumbers(E2E_USER))[0].inboundAgentId).toBeNull();

    await db.setVoiceGeminiKey(E2E_USER, GOOD_KEY);
    const engine = await FakePlaygroundEngine.install(page);
    await openVoiceAgent(page, inbound);
    await db.setVoiceGeminiKey(E2E_USER, null);
    await page.getByRole('button', { name: 'Start call' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Add your Gemini API key first' })).toBeVisible();
    expect(engine.connected).toBe(false);
});

test('saving: Google’s refusals in plain words, then a good key is saved sealed and never reaches the browser', async ({
    page,
    db,
}) => {
    const { inbound } = await seedAgentsAndNumber(db);
    const payloads: Promise<string>[] = [];
    page.on('response', (response: Response) => {
        const type = response.headers()['content-type'] ?? '';
        if (type.includes('text/x-component') || type.includes('text/html')) payloads.push(response.text().catch(() => ''));
    });

    await openAgents(page);
    await card(page).getByRole('button', { name: 'Add key' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add your Gemini API key' });
    await expect(dialog.getByRole('link', { name: /aistudio\.google\.com\/apikey/ })).toHaveAttribute(
        'href',
        'https://aistudio.google.com/apikey',
    );
    await expect(dialog.getByRole('radio', { name: /^Paid tier/ })).toBeChecked();
    await expect(dialog).toContainText('Free tier');
    await expect(dialog).toContainText('Google may use what is said on your calls');

    const input = dialog.getByLabel('API key');
    const save = dialog.getByRole('button', { name: 'Check and save' });
    for (const [key, words] of [
        [INVALID_KEY, 'Google says this is not a valid API key.'],
        [DISABLED_KEY, 'The Gemini API is turned off for the Google Cloud project this key belongs to.'],
        [QUOTA_KEY, 'Google says this key is out of quota right now.'],
    ] as const) {
        await input.fill(key);
        await save.click();
        await expect(dialog.getByRole('alert')).toContainText(words);
    }
    await input.fill('not a key');
    await save.click();
    await expect(dialog.getByRole('alert')).toContainText('That does not look like a Gemini API key.');
    expect((await db.getVoiceSettings(E2E_USER))?.gemini).toBeNull();

    await input.fill(GOOD_KEY);
    await dialog.getByRole('radio', { name: /^Free tier/ }).click();
    await save.click();
    await expect(page.getByText('Gemini API key saved. Your agents now run on it.')).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(card(page).getByTestId('gemini-key-status')).toHaveText('Working');
    await expect(card(page).getByTestId('gemini-key-summary')).toContainText(`Key ending in ${GOOD_KEY.slice(-4)}`);
    expect(gemini.keys).toEqual([INVALID_KEY, DISABLED_KEY, QUOTA_KEY, GOOD_KEY]);

    const stored = (await db.getVoiceSettings(E2E_USER))?.gemini;
    expect(stored).toMatchObject({
        last4: GOOD_KEY.slice(-4),
        status: VoiceGeminiKeyStatus.OK,
        statusMessage: null,
        tier: 'free',
    });
    expect(stored?.keySealed).toMatch(/^v1\./);
    expect(stored?.keySealed).not.toContain(GOOD_KEY);

    // Every place an agent shows says which key it runs on.
    const line = `Runs on your Gemini key ending ${GOOD_KEY.slice(-4)} · free tier`;
    await expect(page.getByTestId('voice-agent-card').first().getByTestId('gemini-key-line')).toHaveText(line);

    // The tier can be changed in place.
    await card(page).getByTestId('gemini-key-tier').click();
    await page.getByRole('option', { name: 'Paid tier' }).click();
    await expect(page.getByText('Saved: paid tier')).toBeVisible();
    await expect.poll(async () => (await db.getVoiceSettings(E2E_USER))?.gemini?.tier).toBe('paid');
    await expect(page.getByTestId('voice-agent-card').first().getByTestId('gemini-key-line')).toContainText('· paid tier');

    // Calls can start now.
    await openVoiceAgent(page, inbound);
    await expect(page.getByRole('button', { name: 'Start call' })).toBeEnabled();
    await expect(page.getByTestId('gemini-key-notice')).toHaveCount(0);
    await expect(page.getByTestId('gemini-key-line')).toHaveCount(2); // the editor and the playground
    await expect(page.getByTestId('gemini-key-line').first()).toHaveText(line.replace('free', 'paid'));
    await openPhoneNumbers(page);
    await expect(numberRow(page).getByRole('radio', { name: 'Answer calls' })).toBeEnabled();
    await expect(page.getByTestId('gemini-key-notice')).toHaveCount(0);

    // Neither the key nor its sealed form is in any page or action payload.
    await openAgents(page);
    const bodies = [await page.content(), ...(await Promise.all(payloads))].join('\n');
    expect(payloads.length).toBeGreaterThan(3);
    expect(bodies).not.toContain(GOOD_KEY);
    expect(bodies).not.toContain(stored?.keySealed as string);
    expect(bodies).not.toContain('keySealed');
    // The card's view is there (escaped inside the HTML's flight data), only the last 4.
    expect(bodies).toMatch(new RegExp(`last4\\\\?":\\\\?"${GOOD_KEY.slice(-4)}`));
});

test('a key Google refused on a call: the card, the playground and the call log say so; check again; remove', async ({
    page,
    db,
}) => {
    const { inbound } = await seedAgentsAndNumber(db);
    // What the engine leaves when Google refuses the key on a call.
    await db.setVoiceGeminiKey(E2E_USER, GOOD_KEY, {
        status: VoiceGeminiKeyStatus.INVALID,
        statusMessage: 'it is not a valid API key (Google: 1007 None. API key not valid.)',
    });
    const [callId] = await db.insertVoiceCalls(E2E_USER, [
        {
            agentId: (await db.getVoiceAgentDoc(inbound))._id,
            numberId: null,
            channel: VoiceCallChannel.PHONE,
            direction: VoiceCallDirection.INBOUND,
            from: '+15557770001',
            to: NUMBER,
            voice: 'sulafat',
            startedAt: new Date(),
            endedAt: new Date(),
            durationSec: 0,
            endedBy: 'gemini_key_error',
            flags: [{ flag: 'gemini_key_error', quote: 'Google refused the Gemini API key: it is not a valid API key' }],
            turns: [],
            gapsMs: [],
        },
    ]);

    await page.goto(CALL_LOGS_URL);
    await waitForHydration(page, '#header');
    await expect(page.getByText('Gemini key problem').first()).toBeVisible();
    await page.goto(`${CALL_LOGS_URL}/${callId}`);
    await expect(page.getByRole('link', { name: 'Check your key' })).toHaveAttribute(
        'href',
        `${VOICE_AGENTS_URL}#gemini-key`,
    );
    await expect(page.getByText('Google refused the Gemini API key: it is not a valid API key')).toBeVisible();

    await openVoiceAgent(page, inbound);
    await expect(page.getByTestId('gemini-key-notice')).toContainText(
        'Google refused your Gemini API key: it is not a valid API key',
    );
    await expect(page.getByRole('button', { name: 'Start call' })).toBeEnabled(); // quota and billing can come back

    await openAgents(page);
    await expect(card(page).getByTestId('gemini-key-status')).toHaveText('Not valid');
    await expect(card(page).getByRole('alert')).toContainText('Google refused this key: it is not a valid API key');
    await expect(page.getByTestId('voice-agent-card').first().getByTestId('gemini-key-line')).toContainText(
        'which Google refused',
    );
    await card(page).getByRole('button', { name: 'Check now' }).click();
    await expect(page.getByText('Google accepts the key')).toBeVisible();
    await expect(card(page).getByTestId('gemini-key-status')).toHaveText('Working');
    expect((await db.getVoiceSettings(E2E_USER))?.gemini?.status).toBe(VoiceGeminiKeyStatus.OK);

    await card(page).getByRole('button', { name: 'Remove' }).click();
    const confirm = page.getByRole('dialog', { name: 'Remove your Gemini API key?' });
    await expect(confirm).toContainText('Your agents stop answering calls, placing calls and talking in the playground');
    await confirm.getByRole('button', { name: 'Remove key' }).click();
    await expect(page.getByText('Gemini API key removed')).toBeVisible();
    await expect(card(page).getByTestId('gemini-key-status')).toHaveText('Not set');
    expect((await db.getVoiceSettings(E2E_USER))?.gemini).toBeNull();
});

test('the open page asks Google about the key again every 10 minutes, with the free list-models call', async ({
    page,
    db,
}) => {
    await db.setVoiceGeminiKey(E2E_USER, GOOD_KEY, {
        status: VoiceGeminiKeyStatus.QUOTA,
        statusMessage: 'Google says this key is out of quota right now.',
    });
    await page.clock.install();
    await openAgents(page);
    await expect(card(page).getByTestId('gemini-key-status')).toHaveText('Out of quota');
    await expect(card(page)).toContainText('Asking is free: it does not use your Gemini quota.');
    const before = gemini.urls.length;

    await page.clock.fastForward('09:00');
    expect(gemini.urls.length).toBe(before);
    await page.clock.fastForward('01:30');
    await expect(card(page).getByTestId('gemini-key-status')).toHaveText('Working');
    expect(gemini.keys.slice(before)).toEqual([GOOD_KEY]);
    expect(gemini.urls.slice(before)).toEqual(['/v1beta/models?pageSize=1']);
    expect((await db.getVoiceSettings(E2E_USER))?.gemini?.status).toBe(VoiceGeminiKeyStatus.OK);
});

test('the playground shows the engine’s key refusal in plain words with a link to the key', async ({ page, db }) => {
    await db.setVoiceGeminiKey(E2E_USER, GOOD_KEY);
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya' });
    const engine = await FakePlaygroundEngine.install(page);
    await openVoiceAgent(page, agentId);

    await page.getByRole('button', { name: 'Start call' }).click();
    await expect(page.getByTestId('playground-status')).toHaveText('Live');
    await expect.poll(() => engine.connected).toBe(true);
    engine.sendEvent({ type: 'error', code: 'gemini_key_invalid', message: 'it is not a valid API key' });
    await expect(page.getByTestId('playground-status')).toHaveText('Failed');
    const alert = page
        .getByRole('alert')
        .filter({ hasText: 'Google refused your Gemini API key: it is not a valid API key' });
    await expect(alert.getByRole('link', { name: 'Check your key' })).toHaveAttribute(
        'href',
        `${VOICE_AGENTS_URL}#gemini-key`,
    );
});

test('the key card fits a phone screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // The page scrolls inside #page-children-container: nothing may make it, the document or the dialog scroll sideways.
    const sideways = () =>
        page.evaluate(() =>
            [
                document.documentElement,
                document.getElementById('page-children-container'),
                ...document.querySelectorAll('[role="dialog"]'),
            ]
                .filter((el): el is HTMLElement => !!el)
                .map((el) => el.scrollWidth - el.clientWidth),
        );
    await openAgents(page);
    await expect(card(page)).toBeVisible();
    expect(Math.max(...(await sideways()))).toBeLessThanOrEqual(1);
    await card(page).getByRole('button', { name: 'Add key' }).click();
    await expect(page.getByRole('dialog', { name: 'Add your Gemini API key' }).getByLabel('API key')).toBeVisible();
    expect(Math.max(...(await sideways()))).toBeLessThanOrEqual(1);
});
