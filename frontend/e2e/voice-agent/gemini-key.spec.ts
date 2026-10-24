import { createServer, type Server } from 'node:http';
import type { Page, Request } from '@playwright/test';
import {
    VoiceAgentCallType,
    VoiceCallChannel,
    VoiceCallDirection,
    VoiceKeyStatus,
    VoiceStackKind,
} from '@aixellabs/backend/db/types';
import type { E2eDb } from '../support/db';
import { expect, test } from '../support/fixtures';
import { E2E_GEMINI_API_BASE, E2E_GEMINI_API_KEY, USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import { GEMINI_KEY_URL, VOICE_SETTINGS_URL } from '@/helpers/voice-routes';
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
const SECOND_KEY = 'AIzaGoodSecondE2eKey0123456789abcdQrSt';
const CARTESIA_KEY = 'sk_car_GoodE2eCartesiaKey0123456789';
const NUMBER = '+13473700001';

/** Google's model list for a good key: what the agent's stack may pick from it (not gemini-2.5-flash). */
const GEMINI_MODELS = [
    ['gemini-3.8-live', 'bidiGenerateContent'],
    ['gemini-3.5-transcribe-live', 'bidiGenerateContent'],
    ['gemini-3.5-flash-lite', 'generateContent'],
    ['gemini-3.8-flash-tts', 'generateContent'],
].map(([id, method]) => ({ name: `models/${id}`, supportedGenerationMethods: [method] }));

/** Enough of the Vercel AI Gateway's /v1/models: priced, and some the stack leaves out (gateway-only, Responses-only, websocket STT, another provider, one the key does not list). */
const gateway = (id: string, name: string, type: string, pricing: Record<string, string>, tags: string[] = []) => ({
    id,
    name,
    owned_by: id.split('/')[0],
    type,
    tags,
    pricing,
});
const GATEWAY_MODELS = [
    gateway('google/gemini-3.8-live', 'Gemini 3.8 Live', 'realtime', {
        input: '0.00000075',
        output: '0.0000045',
        audio_input_token_cost: '0.000003',
        audio_output_token_cost: '0.000012',
    }),
    gateway('openai/gpt-realtime-mini', 'GPT-Realtime mini', 'realtime', {
        input: '0.0000006',
        output: '0.0000024',
        audio_input_token_cost: '0.00001',
        audio_output_token_cost: '0.00002',
    }),
    gateway(
        'google/gemini-3.5-transcribe-live',
        'Gemini 3.5 Transcribe Live',
        'transcription',
        { transcription_duration_cost_per_second: '0.00015' },
        ['websocket-transcription'],
    ),
    gateway('openai/gpt-4o-mini-transcribe', 'GPT-4o mini Transcribe', 'transcription', {
        audio_input_token_cost: '0.00000125',
    }),
    gateway(
        'openai/gpt-realtime-whisper',
        'GPT Realtime Whisper',
        'transcription',
        { transcription_duration_cost_per_second: '0.0003' },
        ['websocket-transcription'],
    ),
    gateway(
        'google/gemini-3.5-flash-lite',
        'Gemini 3.5 Flash Lite',
        'language',
        { input: '0.0000003', output: '0.0000025' },
        ['tool-use'],
    ),
    gateway(
        'google/gemini-3.5-flash-lite-batch',
        'Gemini 3.5 Flash Lite Batch',
        'language',
        { input: '0.00000015', output: '0.00000125' },
        ['tool-use'],
    ),
    gateway('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 'language', { input: '0.0000003', output: '0.0000025' }, [
        'tool-use',
    ]),
    gateway('openai/gpt-5.4-nano', 'GPT 5.4 Nano', 'language', { input: '0.0000002', output: '0.00000125' }, ['tool-use']),
    gateway('openai/gpt-5.5-pro', 'GPT-5.5 Pro', 'language', { input: '0.00003', output: '0.00018' }, ['tool-use']),
    gateway('google/gemini-3.8-flash-tts', 'Gemini 3.8 Flash TTS', 'speech', { audio_output_token_cost: '0.000009' }),
    gateway('openai/tts-1', 'TTS-1', 'speech', { speech_input_character_cost: '0.000015' }),
    gateway('spacexai/grok-tts', 'Grok TTS', 'speech', { speech_input_character_cost: '0.000015' }),
];

/** Deepgram's public model list: its Aura voices, each one model's, with a sample. */
const DEEPGRAM_MODELS = {
    tts: [
        ['aura-2-thalia-en', 'aura-2', 'Thalia', ['feminine', 'clear']],
        ['aura-2-orion-en', 'aura-2', 'Orion', ['masculine', 'calm']],
        ['aura-asteria-en', 'aura', 'Asteria', ['feminine']],
    ].map(([id, architecture, name, tags]) => ({
        canonical_name: id,
        architecture,
        metadata: { display_name: name, accent: 'American', sample: `https://example.com/${id}.wav`, tags },
    })),
};

function googleError(code: number, status: string, reason: string, message: string) {
    return { error: { code, message, status, details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] } };
}

/** Google's `GET /v1beta/models`, enough of it to check a key. */
class FakeGemini {
    readonly keys: string[] = [];
    readonly urls: string[] = [];
    /** `{path} {key}` of each request to another provider. */
    readonly providerCalls: string[] = [];
    private constructor(private readonly server: Server) {}

    static async start(): Promise<FakeGemini> {
        const fake: FakeGemini = new FakeGemini(
            createServer((req, res) => {
                const reply = (status: number, body: unknown) => {
                    res.writeHead(status, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(body));
                };
                if (req.url?.startsWith('/providers/gateway/')) return reply(200, { data: GATEWAY_MODELS });
                if (req.url === '/providers/deepgram/v1/models') return reply(200, DEEPGRAM_MODELS);
                // The other providers (VOICE_PROVIDER_API_BASE): a key with "Good" in it works.
                if (req.url?.startsWith('/providers/')) {
                    const auth = String(req.headers.authorization ?? req.headers['xi-api-key'] ?? '');
                    fake.providerCalls.push(`${req.url} ${auth.replace(/^(Bearer|Token) /, '')}`);
                    return auth.includes('Good') ? reply(200, {}) : reply(401, { error: 'invalid key' });
                }
                const key = String(req.headers['x-goog-api-key'] ?? '');
                fake.keys.push(key);
                fake.urls.push(req.url ?? '');
                if (!req.url?.startsWith('/v1beta/models'))
                    return reply(404, googleError(404, 'NOT_FOUND', '', 'Not found'));
                if (key.startsWith('AIzaGood')) return reply(200, { models: GEMINI_MODELS });
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
    await waitForHydration(page, '#header');
}

/** Voice settings, where the key is added, checked and removed. */
async function openSettings(page: Page): Promise<void> {
    await page.goto(VOICE_SETTINGS_URL);
    await waitForHydration(page, '[data-testid="voice-keys-card"] button');
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

const card = (page: Page) => page.getByTestId('voice-keys-card');
/** The status badge of the user's (first) key. */
const keyStatus = (page: Page) => card(page).getByTestId('voice-key-status').first();
const storedKeys = async (db: E2eDb) => (await db.getVoiceAccount(E2E_USER))?.keys ?? [];
const numberRow = (page: Page, phoneNumber = NUMBER) =>
    page.getByTestId('voice-number-row').filter({ hasText: phoneNumber });

test('without a key: the card says so, and the playground, answering, making calls and test calls explain it', async ({
    page,
    db,
}) => {
    const { inbound } = await seedAgentsAndNumber(db);
    // A second number that already answers with an agent: its row says the key is missing.
    const answering = '+13473700002';
    await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: answering,
        providerNumberId: 'pn-gemini-e2e-2',
        apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
        inboundAgentId: (await db.getVoiceAgentDoc(inbound))._id,
    });

    await openAgents(page);
    await expect(page.getByTestId('gemini-key-notice')).toContainText(
        'Your agents need your Gemini API key to take or make calls.',
    );
    await expect(page.getByTestId('gemini-key-notice').getByRole('link', { name: 'Add it in Settings' })).toHaveAttribute(
        'href',
        GEMINI_KEY_URL,
    );

    // The agent's stack says its step has no key, with the way to Settings.
    await openVoiceAgent(page, inbound);
    await expect(page.getByTestId('agent-stack').getByRole('radio', { name: /^One voice model/ })).toBeChecked();
    await expect(page.getByTestId('stack-realtime-no-key')).toContainText('No Gemini key yet');
    await expect(page.getByTestId('stack-realtime-no-key').getByRole('link')).toHaveAttribute('href', GEMINI_KEY_URL);

    await openSettings(page);
    await expect(page.getByTestId('voice-stack-card')).toHaveCount(0);
    await expect(card(page).getByTestId('voice-key')).toHaveCount(0);
    await expect(card(page)).toContainText('Your agents cannot take or make calls until you add your own Gemini key.');
    await expect(card(page).getByRole('button', { name: 'Add key' })).toBeVisible();

    await openVoiceAgent(page, inbound);
    const playground = page.getByTestId('voice-playground');
    await expect(playground.getByTestId('call-blockers')).toContainText('No Gemini API key: voice model needs one.');
    await expect(playground.getByRole('button', { name: 'Start call' })).toBeDisabled();
    await expect(playground.getByRole('link', { name: 'Add a Gemini API key in Settings →' })).toHaveAttribute(
        'href',
        GEMINI_KEY_URL,
    );

    await openPhoneNumbers(page);
    await expect(page.getByTestId('gemini-key-notice')).toContainText(
        'Your agents need your Gemini API key to answer or make calls.',
    );
    await expect(numberRow(page, answering).getByTestId('gemini-key-hint')).toHaveCount(1);
    await expect(numberRow(page, answering).getByTestId('gemini-key-hint').getByRole('link')).toHaveAttribute(
        'href',
        GEMINI_KEY_URL,
    );
    await numberRow(page).getByRole('button', { name: 'Test call' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test call' });
    await expect(dialog.getByTestId('gemini-key-notice')).toContainText(
        'Your agents need your Gemini API key to place calls.',
    );
    await expect(dialog.getByRole('button', { name: 'Call me now' })).toHaveCount(0);

    // The link takes them to the key in voice settings.
    await page.keyboard.press('Escape');
    await page.getByTestId('gemini-key-notice').getByRole('link', { name: 'Add it in Settings' }).click();
    await expect(page).toHaveURL(new RegExp(`${GEMINI_KEY_URL}$`));
    await expect(card(page)).toBeInViewport();
});

test('the server refuses too: a key removed after the page loaded blocks test calls and the playground', async ({
    page,
    db,
}) => {
    const { inbound } = await seedAgentsAndNumber(db);
    await db.setVoiceGeminiKey(E2E_USER, GOOD_KEY);

    await openPhoneNumbers(page);
    await expect(page.getByTestId('gemini-key-notice')).toHaveCount(0);
    await db.setVoiceGeminiKey(E2E_USER, null);
    await numberRow(page).getByRole('button', { name: 'Test call' }).click();
    const testCall = page.getByRole('dialog', { name: 'Test call' });
    await testCall.getByLabel('Your phone number').fill('+14155550123');
    await testCall.getByRole('button', { name: 'Call me now' }).click();
    await expect(testCall.getByRole('alert').last()).toContainText(
        'No Gemini API key: voice model needs one. Add a Gemini API key in Settings.',
    );
    await page.keyboard.press('Escape');

    await db.setVoiceGeminiKey(E2E_USER, GOOD_KEY);
    const engine = await FakePlaygroundEngine.install(page);
    await openVoiceAgent(page, inbound);
    await db.setVoiceGeminiKey(E2E_USER, null);
    await page.getByRole('button', { name: 'Start call' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'No Gemini API key: voice model needs one.' })).toBeVisible();
    expect(engine.connected).toBe(false);
});

test('saving: Google’s refusals in plain words, then a good key is saved sealed and never reaches the browser', async ({
    page,
    db,
}) => {
    const { inbound } = await seedAgentsAndNumber(db);
    // Finished requests only: a prefetch cut off by a navigation never delivers its body.
    const payloads: Promise<string | null>[] = [];
    page.on('requestfinished', (request: Request) => {
        payloads.push(
            (async () => {
                const response = await request.response();
                const type = response?.headers()['content-type'] ?? '';
                if (!type.includes('text/x-component') && !type.includes('text/html')) return null;
                return response!.text().catch(() => '');
            })(),
        );
    });

    await openSettings(page);
    await card(page).getByRole('button', { name: 'Add key' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add an API key' });
    await expect(dialog.getByRole('link', { name: /aistudio\.google\.com\/apikey/ })).toHaveAttribute(
        'href',
        'https://aistudio.google.com/apikey',
    );
    await expect(dialog.getByRole('radio', { name: /^Paid tier/ })).toBeChecked();
    await expect(dialog).toContainText('Free tier');
    await expect(dialog).toContainText('Google may learn from them');

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
    await expect(dialog.getByRole('alert')).toContainText('That does not look like an API key');
    expect(await storedKeys(db)).toEqual([]);

    await input.fill(GOOD_KEY);
    await dialog.getByRole('radio', { name: /^Free tier/ }).click();
    await save.click();
    await expect(page.getByText('Gemini key saved')).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(keyStatus(page)).toHaveText('Working');
    await expect(card(page).getByTestId('voice-key')).toContainText(`Ending in ${GOOD_KEY.slice(-4)}`);
    await expect(card(page).getByTestId('voice-key')).toContainText('Default');
    // The key checks (the agent page also lists the key's models for its stack).
    expect(gemini.keys.filter((_, i) => gemini.urls[i] === '/v1beta/models?pageSize=1')).toEqual([
        INVALID_KEY,
        DISABLED_KEY,
        QUOTA_KEY,
        GOOD_KEY,
    ]);

    const [stored] = await storedKeys(db);
    expect(stored).toMatchObject({
        provider: 'gemini',
        label: `Key ending ${GOOD_KEY.slice(-4)}`,
        last4: GOOD_KEY.slice(-4),
        status: VoiceKeyStatus.OK,
        statusMessage: null,
        tier: 'free',
    });
    expect(stored?.keySealed).toMatch(/^v1\./);
    expect(stored?.keySealed).not.toContain(GOOD_KEY);

    const tier = card(page).getByRole('combobox', { name: /^Google tier of/ });
    await expect(tier).toHaveText('Free tier');

    // The tier can be changed in place.
    await tier.click();
    await page.getByRole('option', { name: 'Paid tier' }).click();
    await expect(page.getByText('Saved: paid tier')).toBeVisible();
    await expect.poll(async () => (await storedKeys(db))[0]?.tier).toBe('paid');
    await expect(tier).toHaveText('Paid tier');

    // Calls can start now.
    await openVoiceAgent(page, inbound);
    await expect(page.getByRole('button', { name: 'Start call' })).toBeEnabled();
    await expect(page.getByTestId('gemini-key-notice')).toHaveCount(0);
    await expect(page.getByTestId('gemini-key-line')).toHaveCount(1); // the playground; the editor's stack names its key
    // Every place an agent shows says which key it runs on.
    await expect(page.getByTestId('gemini-key-line').first()).toHaveText(
        `Runs on your Gemini key ending ${GOOD_KEY.slice(-4)} · paid tier`,
    );
    await openPhoneNumbers(page);
    await expect(page.getByTestId('gemini-key-notice')).toHaveCount(0);

    // Neither the key nor its sealed form is in any page or action payload.
    await openSettings(page);
    const texts = (await Promise.all(payloads)).filter((text) => text !== null);
    const bodies = [await page.content(), ...texts].join('\n');
    expect(texts.length).toBeGreaterThan(3);
    expect(bodies).not.toContain(GOOD_KEY);
    expect(bodies).not.toContain(stored?.keySealed as string);
    expect(bodies).not.toContain('keySealed');
    // The key section's view is there (escaped inside the HTML's flight data), only the last 4.
    expect(bodies).toMatch(new RegExp(`last4\\\\?":\\\\?"${GOOD_KEY.slice(-4)}`));
});

test('a key Google refused on a call: the card, the playground and the call log say so; check again; remove', async ({
    page,
    db,
}) => {
    const { inbound } = await seedAgentsAndNumber(db);
    // What the engine leaves when Google refuses the key on a call.
    await db.setVoiceGeminiKey(E2E_USER, GOOD_KEY, {
        status: VoiceKeyStatus.INVALID,
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
    await expect(page.getByRole('link', { name: 'Check your key' })).toHaveAttribute('href', GEMINI_KEY_URL);
    await expect(page.getByText('Google refused the Gemini API key: it is not a valid API key')).toBeVisible();

    await openVoiceAgent(page, inbound);
    await expect(page.getByTestId('gemini-key-notice')).toContainText(
        'Google refused your Gemini API key: it is not a valid API key',
    );
    await expect(page.getByTestId('gemini-key-line').first()).toContainText('which Google refused');
    await expect(page.getByRole('button', { name: 'Start call' })).toBeEnabled(); // quota and billing can come back

    await openAgents(page);
    await expect(page.getByTestId('gemini-key-notice')).toContainText(
        'Google refused your Gemini API key: it is not a valid API key',
    );
    await expect(page.getByTestId('gemini-key-notice').getByRole('link', { name: 'Check it in Settings' })).toHaveAttribute(
        'href',
        GEMINI_KEY_URL,
    );

    await openSettings(page);
    await expect(keyStatus(page)).toHaveText('Not valid');
    await expect(card(page).getByRole('alert')).toContainText('Gemini refused this key: it is not a valid API key');
    await card(page).getByRole('button', { name: 'Check now' }).click();
    await expect(page.getByText('Gemini accepts the key')).toBeVisible();
    await expect(keyStatus(page)).toHaveText('Working');
    expect((await storedKeys(db))[0]?.status).toBe(VoiceKeyStatus.OK);

    await card(page).getByRole('button', { name: 'Remove Main' }).click();
    const confirm = page.getByRole('dialog', { name: 'Remove Main?' });
    await expect(confirm).toContainText("Agents on this key move to the provider's next key.");
    await confirm.getByRole('button', { name: 'Remove key' }).click();
    await expect(page.getByText('Key removed')).toBeVisible();
    await expect(card(page).getByTestId('voice-key')).toHaveCount(0);
    expect(await storedKeys(db)).toEqual([]);
});

test('the open page asks Google about the key again every 10 minutes, with the free list-models call', async ({
    page,
    db,
}) => {
    await db.setVoiceGeminiKey(E2E_USER, GOOD_KEY, {
        status: VoiceKeyStatus.QUOTA,
        statusMessage: 'Google says this key is out of quota right now.',
    });
    await page.clock.install();
    await openSettings(page);
    await expect(keyStatus(page)).toHaveText('Out of quota');
    const before = gemini.urls.length;

    await page.clock.fastForward('09:00');
    expect(gemini.urls.length).toBe(before);
    await page.clock.fastForward('01:30');
    await expect(keyStatus(page)).toHaveText('Working');
    expect(gemini.keys.slice(before)).toEqual([GOOD_KEY]);
    expect(gemini.urls.slice(before)).toEqual(['/v1beta/models?pageSize=1']);
    expect((await storedKeys(db))[0]?.status).toBe(VoiceKeyStatus.OK);
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
    await expect(alert.getByRole('link', { name: 'Check your key' })).toHaveAttribute('href', GEMINI_KEY_URL);
});

test('the settings page fits a phone screen', async ({ page }) => {
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
    await openSettings(page);
    await expect(card(page)).toBeVisible();
    expect(Math.max(...(await sideways()))).toBeLessThanOrEqual(1);
    await card(page).getByRole('button', { name: 'Add key' }).click();
    await expect(page.getByRole('dialog', { name: 'Add an API key' }).getByLabel('API key')).toBeVisible();
    expect(Math.max(...(await sideways()))).toBeLessThanOrEqual(1);
});

test('several keys, and each agent its own stack: one voice model or three steps, each step’s model, key and price', async ({
    page,
    db,
}) => {
    const { inbound } = await seedAgentsAndNumber(db);
    await db.setVoiceGeminiKey(E2E_USER, GOOD_KEY);
    await openSettings(page);

    // A second Gemini key, with a name, and a Cartesia key (checked with Cartesia).
    const add = async (provider: string, label: string, key: string) => {
        await card(page).getByRole('button', { name: 'Add key' }).click();
        const dialog = page.getByRole('dialog', { name: 'Add an API key' });
        if (provider !== 'Gemini') {
            await dialog.getByLabel('Provider').click();
            await page.getByRole('option', { name: provider }).click();
        }
        await dialog.getByLabel('Name (optional)').fill(label);
        await dialog.getByLabel('API key').fill(key);
        await dialog.getByRole('button', { name: 'Check and save' }).click();
        await expect(page.getByText(`${provider} key saved`)).toBeVisible();
    };
    await add('Gemini', 'Clinic', SECOND_KEY);
    await card(page).getByRole('button', { name: 'Add key' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add an API key' });
    await dialog.getByLabel('Provider').click();
    await page.getByRole('option', { name: 'Cartesia' }).click();
    await expect(dialog.getByRole('link', { name: /play\.cartesia\.ai/ })).toBeVisible();
    await dialog.getByLabel('API key').fill('sk_car_BadE2eCartesiaKey0123456789');
    await dialog.getByRole('button', { name: 'Check and save' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Cartesia says this is not a valid API key.');
    await page.keyboard.press('Escape');
    await add('Cartesia', 'Voices', CARTESIA_KEY);
    expect(gemini.providerCalls.at(-1)).toBe(`/providers/cartesia/voices?limit=1 ${CARTESIA_KEY}`);

    await expect(card(page).getByTestId('voice-key')).toHaveCount(3);
    const clinic = card(page).getByTestId('voice-key').filter({ hasText: 'Clinic' });
    await clinic.getByRole('button', { name: 'Make default' }).click();
    await expect(page.getByText('Clinic is now your default Gemini key')).toBeVisible();
    await expect(clinic).toContainText('Default');
    const keys = await storedKeys(db);
    expect(keys.map((k) => [k.provider, k.label])).toEqual([
        ['gemini', 'Clinic'],
        ['gemini', 'Main'],
        ['cartesia', 'Voices'],
    ]);
    const [clinicId, mainId] = keys.map((k) => k._id.toString());
    await expect(page.getByTestId('voice-stack-card')).toHaveCount(0); // the stack is each agent's now

    // One voice model: the live models the Gemini key lists, priced from the catalogue; OpenAI's is coming soon.
    await openVoiceAgent(page, inbound);
    const stack = page.getByTestId('agent-stack');
    await expect(stack.getByRole('radio', { name: /^One voice model/ })).toBeChecked();
    await stack.locator('#stack-realtime-model').click();
    await expect(page.getByRole('option', { name: /^Gemini 3\.8 Live · \$0\.02\d\/min$/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /^GPT-Realtime mini · .* · coming soon$/ })).toBeDisabled();
    await page.keyboard.press('Escape');
    // Its key: the provider's keys only (the first is the default), named after the model's provider.
    await expect(stack.getByText('Gemini API key')).toBeVisible();
    await expect(stack.getByTestId('stack-realtime')).toContainText('2 saved');
    await expect(stack.locator('#stack-realtime-key')).toContainText(`Clinic · ending ${SECOND_KEY.slice(-4)}`);
    await stack.locator('#stack-realtime-key').click();
    await expect(page.getByRole('option')).toHaveText([/^Clinic · ending/, /^Main · ending/]);
    await page.keyboard.press('Escape');
    await stack.locator('#stack-realtime-key').click();
    await page.getByRole('option', { name: /^Main/ }).click();

    // Three steps (beta): each step's model and key; a step whose provider has no key says so.
    await stack.getByRole('radio', { name: /^Three steps/ }).click();
    await expect(page.getByTestId('agent-stack-beta')).toContainText('in beta');
    // One below the other, numbered.
    await expect(page.getByTestId('agent-stack-steps').getByRole('listitem')).toHaveText([
        /^1Speech to text/,
        /^2Thinking/,
        /^3Text to speech/,
    ]);
    await expect(stack.locator('#stack-stt-model')).toContainText('Deepgram Nova-3');
    await expect(page.getByTestId('stack-stt-no-key')).toContainText('No Deepgram key yet');
    await expect(page.getByTestId('stack-tts-no-key')).toHaveCount(0);
    // Text models: those the key lists and the engine can run, cheapest first, or by name.
    await stack.locator('#stack-llm-model').click();
    await expect(page.getByRole('option').first()).toContainText('GPT 5.4 Nano');
    for (const left of [/^Gemini 2\.5 Flash ·/, /Batch/, /GPT-5\.5 Pro/, /^Gemini 3\.8 Flash ·/]) {
        await expect(page.getByRole('option', { name: left })).toHaveCount(0);
    }
    await page.keyboard.press('Escape');
    await page.getByTestId('stack-llm').getByRole('button', { name: 'Sort by name' }).click();
    await stack.locator('#stack-llm-model').click();
    await expect(page.getByRole('option').first()).toContainText('Gemini 3.5 Flash Lite');
    await page.getByRole('option', { name: /^Gemini 3\.5 Flash Lite/ }).click();
    await stack.locator('#stack-stt-model').click();
    await expect(page.getByRole('option', { name: /GPT Realtime Whisper/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Gemini's own voice step needs a paid-tier key.
    await stack.locator('#stack-tts-model').click();
    await page.getByRole('option', { name: /^Gemini 3\.8 Flash TTS/ }).click();
    await expect(page.getByTestId('stack-tts-paid-only')).toContainText('about 4 sentences a minute');
    await stack.locator('#stack-tts-model').click();
    await page.getByRole('option', { name: /^Cartesia Sonic 3\.6/ }).click();
    await expect(page.getByTestId('stack-tts-paid-only')).toHaveCount(0);

    // Saved with the agent, each part with the price it bills on; the cost box prices these three steps.
    await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await expect.poll(async () => (await db.getVoiceAgentDoc(inbound)).stack?.kind).toBe('PIPELINE');
    const pipeline = (await db.getVoiceAgentDoc(inbound)).stack;
    expect(pipeline).toMatchObject({
        stt: { provider: 'deepgram', model: 'nova-3', keyId: null, price: { usdPerMinute: 0.0048 } },
        llm: { provider: 'gemini', model: 'gemini-3.5-flash-lite', keyId: null },
        tts: { provider: 'cartesia', model: 'sonic-3.6', keyId: null, price: { usdPerMillionChars: 39 } },
    });
    const llmPrice = pipeline?.kind === VoiceStackKind.PIPELINE ? pipeline.llm.price : null;
    expect(llmPrice && 'usdPerMillionTokens' in llmPrice ? llmPrice.usdPerMillionTokens : null).toEqual({
        in: expect.closeTo(0.3, 9),
        out: expect.closeTo(2.5, 9),
    });
    const parts = page.getByTestId('agent-cost-parts');
    await expect(parts).toContainText('Speech to text · Deepgram Nova-3');
    await expect(parts).toContainText('Thinking (LLM) · Gemini 3.5 Flash Lite');
    await expect(parts).toContainText('Text to speech · Cartesia Sonic 3.6');

    // Back to one voice model: the key picked for it before is still picked; saved on that key.
    await stack.getByRole('radio', { name: /^One voice model/ }).click();
    await expect(stack.locator('#stack-realtime-key')).toContainText('Main');
    await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await expect.poll(async () => (await db.getVoiceAgentDoc(inbound)).stack?.kind).toBe('REALTIME');
    const saved = (await db.getVoiceAgentDoc(inbound)).stack;
    expect(saved).toMatchObject({ kind: 'REALTIME', provider: 'gemini', model: 'gemini-3.8-live' });
    expect(String(saved && 'keyId' in saved ? saved.keyId : '')).toBe(mainId);
    expect(saved && 'price' in saved && saved.price && 'usdPerMillionTokens' in saved.price).toBe(true);
    await expect(page.getByTestId('gemini-key-line').first()).toContainText(`ending ${GOOD_KEY.slice(-4)}`);
    expect(clinicId).not.toBe(mainId);
});

test('the voice picker: Gemini voices on one voice model, the voice step’s provider’s voices on three steps', async ({
    page,
    db,
}) => {
    await db.setVoiceGeminiKey(E2E_USER, GOOD_KEY);
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya' });
    await openVoiceAgent(page, agentId);
    const stack = page.getByTestId('agent-stack');
    const picker = page.getByTestId('voice-picker');

    await stack.locator('#stack-realtime-voice').click();
    await expect(picker).toContainText('Gemini’s voices');
    await expect(picker.getByTestId('voice-option')).toHaveCount(30);
    // The agent's own voice (Sulafat) is picked already.
    await expect(page.getByTestId('voice-picker-selection')).toHaveText('Sulafat · Gemini');
    // Gemini publishes no samples: every one of its voices plays the sample shipped with the app.
    await expect(picker.getByRole('button', { name: /^Play / })).toHaveCount(30);
    const sample = await page.request.get('/voice-samples/gemini/sulafat.mp3');
    expect(sample.status()).toBe(200);
    expect(sample.headers()['content-type']).toBe('audio/mpeg');
    // The on-demand sample is only for built-in voices with none shipped.
    expect((await page.request.get('/api/voice-agent/voice-sample/gemini/sulafat')).status()).toBe(404);
    expect((await page.request.get('/api/voice-agent/voice-sample/gemini/not-a-voice')).status()).toBe(404);
    // A sample that will not load says so on its card.
    await page.route('**/voice-samples/gemini/kore.mp3', (route) => route.fulfill({ status: 503 }));
    await picker.getByRole('button', { name: 'Play Kore' }).click();
    await expect(picker.getByTestId('voice-sample-failed')).toHaveText(
        'Sample unavailable right now, try again in a minute.',
    );
    await picker.getByLabel('Search voices').fill('excitable');
    await expect(picker.getByTestId('voice-option')).toHaveCount(1);
    await picker.getByRole('button', { name: /^Fenrir/ }).click();
    await expect(page.getByTestId('voice-picker-selection')).toHaveText('Fenrir · Gemini');
    await picker.getByRole('button', { name: 'Save' }).click();
    await expect(stack.locator('#stack-realtime-voice')).toContainText('Fenrir');
    await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await expect.poll(async () => (await db.getVoiceAgentDoc(agentId)).voice).toBe('fenrir');

    // Three steps speaking through ElevenLabs: its first voice until another is picked, then its voices to pick.
    await stack.getByRole('radio', { name: /^Three steps/ }).click();
    await stack.locator('#stack-tts-model').click();
    await page.getByRole('option', { name: /^ElevenLabs Flash v2\.5/ }).click();
    await expect(stack.locator('#stack-tts-voice')).toContainText('Sarah');
    await stack.locator('#stack-tts-voice').click();
    await expect(picker).toContainText('ElevenLabs’s voices');
    await expect(picker.getByRole('button', { name: 'Play Sarah' })).toBeVisible();
    await picker.getByRole('button', { name: 'Sort by name' }).click();
    await expect(picker.getByTestId('voice-option').first()).toContainText('Adam');
    await picker.getByLabel('Gender').click();
    await page.getByRole('option', { name: 'Male', exact: true }).click();
    await expect(picker.getByTestId('voice-option').filter({ hasText: 'Sarah' })).toHaveCount(0);
    await page.getByRole('option', { name: 'Male', exact: true }).waitFor({ state: 'hidden' });
    await picker.getByLabel('Gender').click();
    await page.getByRole('option', { name: 'Any gender' }).click();
    await picker.getByRole('button', { name: /^Alice/ }).click();
    await picker.getByRole('button', { name: 'Save' }).click();
    await expect(stack.locator('#stack-tts-voice')).toContainText('Alice');
    await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await expect
        .poll(async () => (await db.getVoiceAgentDoc(agentId)).ttsVoice)
        .toEqual({ provider: 'elevenlabs', voiceId: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice' });
    // Deepgram Aura: each model's own voices, with Deepgram's samples.
    await stack.locator('#stack-tts-model').click();
    await page.getByRole('option', { name: /^Deepgram Aura-2/ }).click();
    await expect(stack.locator('#stack-tts-voice')).toContainText('Thalia');
    await stack.locator('#stack-tts-voice').click();
    await expect(picker.getByTestId('voice-option')).toHaveCount(2);
    await expect(picker.getByRole('button', { name: 'Play Orion' })).toBeVisible();
    await page.keyboard.press('Escape');
    await stack.locator('#stack-tts-model').click();
    await page.getByRole('option', { name: /^ElevenLabs Flash v2\.5/ }).click();

    const doc = await db.getVoiceAgentDoc(agentId);
    expect(doc.voice).toBe('fenrir');
    expect(doc.stack).toMatchObject({ kind: 'PIPELINE', tts: { provider: 'elevenlabs', model: 'eleven_flash_v2_5' } });
});
