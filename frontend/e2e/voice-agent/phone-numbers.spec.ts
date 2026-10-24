import { createHmac } from 'node:crypto';
import { ObjectId } from 'mongodb';
import type { Page } from '@playwright/test';
import { Modules, VOICE_AGENT_SUB_MODULES, VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { VOICE_AGENT_NO_PROMPT_MESSAGE } from '@/helpers/voice-agent-defaults';
import { formatPhone } from '@/helpers/voice-campaign-contacts';
import type { E2eDb } from '../support/db';
import { expect, test } from '../support/fixtures';
import { E2E_GEMINI_API_KEY, E2E_VOICE_ENGINE_SECRET, E2E_VOICE_ENGINE_URL, USER_STORAGE_STATE } from '../support/env';
import { openVoiceAgent, voiceAgentUrl, waitForHydration } from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import {
    CUSTOMER_CONNECTION_ID,
    ENGINE_DNC_NUMBER,
    ENGINE_UNVERIFIED_NUMBER,
    FAKE_TELNYX_KEY,
    FakeTelnyx,
    FakeVoiceEngine,
    PHONE_NUMBERS_URL,
    sealForE2e,
} from './fake-telephony';
import {
    LINK_UI_PENDING,
    linkNumber,
    numberRow,
    numberUse,
    openConnect,
    openPhoneNumbers,
    openRemove,
    unlinkNumber,
} from './phone-numbers-page';

/** What `numberWebhookUrl` must produce: the engine path, the number id and its permanent signature. */
function signedEngineUrl(path: '/texml' | '/telnyx-events', numberId: string): string {
    const sig = createHmac('sha256', E2E_VOICE_ENGINE_SECRET).update(`number|${numberId}`).digest('hex').slice(0, 32);
    return `${E2E_VOICE_ENGINE_URL}${path}?n=${numberId}&sig=${sig}`;
}

async function connectAndImport(page: Page, keep: string[]): Promise<void> {
    const dialog = await openConnect(page, 'Telnyx');
    await dialog.getByLabel('Telnyx API key').fill(FAKE_TELNYX_KEY);
    await dialog.getByRole('button', { name: 'Find my numbers' }).click();
    await expect(dialog.getByRole('checkbox')).toHaveCount(2);
    for (const label of ['+13473703925', '+13475550142']) {
        if (!keep.includes(label)) await dialog.getByRole('checkbox', { name: label }).click();
    }
    await dialog.getByRole('button', { name: `Import ${keep.length} ${keep.length === 1 ? 'number' : 'numbers'}` }).click();
    await expect(dialog).toBeHidden();
}

const FIRST_NUMBER = '+13473703925';
const FIRST_NUMBER_ID = '1293384261075731499';
const SECOND_NUMBER = '+13475550142';
const SECOND_NUMBER_ID = '1293384261075731500';

const answers = (agent: string) => `Answers calls with ${agent}`;
const places = (agent: string) => `Places calls with ${agent}`;
const NOT_LINKED = 'Not linked to an agent';

async function chooseOption(page: Page, combobox: string, option: string): Promise<void> {
    await page.getByRole('combobox', { name: combobox }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
}

async function optionsOf(page: Page, combobox: string): Promise<string[]> {
    await page.getByRole('combobox', { name: combobox }).click();
    const names = await page.getByRole('option').allTextContents();
    await page.keyboard.press('Escape');
    return names;
}

/** A test call from the row; returns the dialog once it says the call is placed (or `error`). */
async function testCall(page: Page, phoneNumber: string, to = '+14155550123', error?: string) {
    await numberRow(page, phoneNumber).getByRole('button', { name: 'Test call' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test call' });
    await dialog.getByLabel('Your phone number').fill(to);
    await dialog.getByRole('button', { name: 'Call me now' }).click();
    if (error) await expect(dialog.getByRole('alert').last()).toContainText(error);
    else await expect(dialog.getByRole('status')).toContainText(`Calling ${to} now`);
    return dialog;
}

/** Agents of both kinds, so every picker has something it must leave out. */
async function seedAgents(db: E2eDb) {
    return {
        frontDesk: await db.insertVoiceAgent(E2E_USER, { name: 'Front desk', callType: VoiceAgentCallType.INBOUND }),
        afterHours: await db.insertVoiceAgent(E2E_USER, { name: 'After hours', callType: VoiceAgentCallType.INBOUND }),
        sales: await db.insertVoiceAgent(E2E_USER, { name: 'Sales outreach', callType: VoiceAgentCallType.OUTBOUND }),
        followUps: await db.insertVoiceAgent(E2E_USER, { name: 'Follow-ups', callType: VoiceAgentCallType.OUTBOUND }),
    };
}

async function seedNumber(
    db: E2eDb,
    phoneNumber = FIRST_NUMBER,
    extra: { inboundAgentId?: ObjectId; outboundAgentId?: ObjectId; callControlAppId?: string } = {},
): Promise<string> {
    return db.insertVoiceNumber(E2E_USER, {
        phoneNumber,
        providerNumberId: phoneNumber === FIRST_NUMBER ? FIRST_NUMBER_ID : SECOND_NUMBER_ID,
        apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
        ...extra,
    });
}

/** Every request that could change something in the customer's Telnyx account. */
function telnyxWrites() {
    return telnyx.requests.filter((r) => r.method !== 'GET');
}

let telnyx: FakeTelnyx;
let engine: FakeVoiceEngine;

test.use({ storageState: USER_STORAGE_STATE });

test.beforeAll(async () => {
    telnyx = await FakeTelnyx.start();
    engine = await FakeVoiceEngine.start();
});

test.afterAll(async () => {
    await telnyx?.stop();
    await engine?.stop();
});

test.beforeEach(async ({ db }) => {
    telnyx.reset();
    engine.clear();
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
});

test('importing a number changes nothing in Telnyx and the key never reaches the browser', async ({ page, db }) => {
    await openPhoneNumbers(page);
    await expect(page.getByText('No phone numbers yet')).toBeVisible();

    await connectAndImport(page, [FIRST_NUMBER]);
    await expect(numberUse(page, FIRST_NUMBER)).toHaveText(NOT_LINKED);
    await expect(numberRow(page, FIRST_NUMBER).getByTestId('number-provider')).toHaveText('Telnyx');
    await expect(numberRow(page, FIRST_NUMBER).getByTestId('number-provider-logo-TELNYX')).toBeVisible();
    await expect(numberRow(page, SECOND_NUMBER)).toHaveCount(0);

    const [stored] = await db.getVoiceNumbers(E2E_USER);
    expect(stored).toMatchObject({
        phoneNumber: FIRST_NUMBER,
        providerNumberId: FIRST_NUMBER_ID,
        inboundAgentId: null,
        outboundAgentId: null,
        previousConnectionId: null,
    });
    expect(stored.texmlAppId).toBeUndefined();
    expect(stored.callControlAppId).toBeUndefined();
    expect(stored.apiKeySealed).toMatch(/^v1\./);
    expect(stored.apiKeySealed).not.toContain(FAKE_TELNYX_KEY);
    // Only reads: no app created, the number still on the customer's own connection.
    expect(telnyxWrites()).toHaveLength(0);
    expect(telnyx.numbers[0].connection_id).toBe(CUSTOMER_CONNECTION_ID);

    await page.reload();
    await waitForHydration(page, '#header');
    const html = await page.content();
    expect(html).not.toContain(FAKE_TELNYX_KEY);
    expect(html).not.toContain(stored.apiKeySealed);
    expect(html).not.toContain('apiKeySealed');
});

test('connect is a menu of providers, each opening its own dialog and its own setup guide', async ({ page }) => {
    await openPhoneNumbers(page);
    await page.getByRole('button', { name: 'Connect a number' }).click();
    await expect(page.getByRole('menuitem')).toHaveText([
        /^TelnyxUS and international numbers/,
        /^TwilioUS and international numbers/,
        /^VoiceLinkIndian numbers \(\+91\)/,
    ]);
    await page.keyboard.press('Escape');

    for (const provider of ['Telnyx', 'Twilio', 'VoiceLink'] as const) {
        const dialog = await openConnect(page, provider);
        // No switching to another provider in here.
        await expect(dialog.getByRole('radio', { name: /Telnyx|Twilio|VoiceLink/ })).toHaveCount(0);
        await dialog.getByRole('button', { name: `${provider} setup guide` }).click();
        const guide = page.getByRole('dialog', { name: `Set up ${provider} for your voice agents` });
        await expect(guide).toBeVisible();
        await expect(guide.getByRole('radio')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(guide).toBeHidden();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
    }
    // One way in: no banner, no separate guide button on the page.
    await expect(page.getByRole('region', { name: 'Setup guide' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Setup guide' })).toHaveCount(0);
});

test('each row says which agent uses the number and how, links to it, and has no job controls', async ({ page, db }) => {
    const { frontDesk, sales } = await seedAgents(db);
    await seedNumber(db, FIRST_NUMBER, { inboundAgentId: new ObjectId(frontDesk) });
    await seedNumber(db, SECOND_NUMBER, { outboundAgentId: new ObjectId(sales) });
    await openPhoneNumbers(page);

    await expect(numberUse(page, FIRST_NUMBER)).toHaveText(answers('Front desk'));
    await expect(numberRow(page, FIRST_NUMBER).getByRole('link', { name: 'Front desk' })).toHaveAttribute(
        'href',
        voiceAgentUrl(frontDesk),
    );
    await expect(numberUse(page, SECOND_NUMBER)).toHaveText(places('Sales outreach'));
    await expect(numberRow(page, SECOND_NUMBER).getByRole('link', { name: 'Sales outreach' })).toHaveAttribute(
        'href',
        voiceAgentUrl(sales),
    );
    for (const phone of [FIRST_NUMBER, SECOND_NUMBER]) {
        const row = numberRow(page, phone);
        await expect(row.getByRole('button', { name: /Change/ })).toHaveCount(0);
        await expect(row.getByRole('button', { name: /More for/ })).toHaveCount(0);
        await expect(row.getByRole('button', { name: `Remove ${phone}` })).toBeVisible();
    }

    await numberRow(page, FIRST_NUMBER).getByRole('link', { name: 'Front desk' }).click();
    await expect(page).toHaveURL(new RegExp(`${voiceAgentUrl(frontDesk)}$`));
});

test('numbers set up before the agent decided the job say what to fix', async ({ page, db }) => {
    const { frontDesk, sales } = await seedAgents(db);
    // Both slots set (fine), and an outbound agent answering calls.
    await seedNumber(db, FIRST_NUMBER, { inboundAgentId: new ObjectId(frontDesk), outboundAgentId: new ObjectId(sales) });
    await seedNumber(db, SECOND_NUMBER, { inboundAgentId: new ObjectId(sales) });
    await openPhoneNumbers(page);

    const both = numberRow(page, FIRST_NUMBER).getByTestId('number-use');
    await expect(both).toContainText(answers('Front desk'));
    await expect(both).toContainText(places('Sales outreach'));
    await expect(both).not.toContainText('Link it again');

    const swapped = numberRow(page, SECOND_NUMBER).getByTestId('number-use');
    await expect(swapped).toContainText(answers('Sales outreach'));
    await expect(swapped).toContainText('Sales outreach is now an agent that makes calls. Link the number again from it.');
    // Nothing changed on its own.
    expect((await db.getVoiceNumbers(E2E_USER)).find((n) => n.phoneNumber === FIRST_NUMBER)).toMatchObject({
        inboundAgentId: new ObjectId(frontDesk),
        outboundAgentId: new ObjectId(sales),
    });
});

test('a test call may use any agent', async ({ page, db }) => {
    await seedAgents(db);
    await seedNumber(db);
    await openPhoneNumbers(page);

    await numberRow(page, FIRST_NUMBER).getByRole('button', { name: 'Test call' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test call' });
    expect(await optionsOf(page, 'Agent that calls')).toEqual([
        'After hours (answers calls)',
        'Follow-ups (makes calls)',
        'Front desk (answers calls)',
        'Sales outreach (makes calls)',
    ]);
    await expect(dialog).toBeVisible();
});

test("a test call makes the one Call Control app every number shares, and at the trial limit uses the customer's own untouched", async ({
    page,
    db,
}) => {
    const { sales } = await seedAgents(db);
    const numberId = await seedNumber(db, FIRST_NUMBER, { outboundAgentId: new ObjectId(sales) });
    await openPhoneNumbers(page);

    await testCall(page, FIRST_NUMBER);
    expect(telnyxWrites().map((r) => `${r.method} ${r.path}`)).toEqual(['POST /v2/call_control_applications']);
    expect(telnyxWrites()[0].body).toEqual({
        application_name: 'Aixel Labs voice agents',
        webhook_event_url: signedEngineUrl('/telnyx-events', numberId),
        webhook_api_version: '2',
        outbound: { outbound_voice_profile_id: '1911630617284445511' },
    });
    expect(telnyx.numbers[0].connection_id).toBe(CUSTOMER_CONNECTION_ID);
    expect(telnyx.requests.every((r) => r.authorization === `Bearer ${FAKE_TELNYX_KEY}`)).toBe(true);
    const [callControlApp] = [...telnyx.callControlApps.values()];
    expect((await db.getVoiceNumbers(E2E_USER))[0].callControlAppId).toBe(callControlApp.id);

    // A trial account: one Call Control app allowed, and the customer already has it.
    await db.resetVoiceTelephony(E2E_USER);
    telnyx.reset();
    telnyx.callControlAppLimit = 1;
    const theirs = telnyx.addCustomerCallControlApp('voicelab-outbound');
    await seedNumber(db, FIRST_NUMBER, { outboundAgentId: new ObjectId(sales) });
    await openPhoneNumbers(page);
    await testCall(page, FIRST_NUMBER);
    expect((await db.getVoiceNumbers(E2E_USER))[0].callControlAppId).toBe(theirs);
    // Their app is used as it is: no PATCH, no DELETE, nothing renamed.
    expect(telnyxWrites().filter((r) => r.method !== 'POST')).toHaveLength(0);
    expect(telnyx.callControlApps.size).toBe(1);
    await page.keyboard.press('Escape');

    // Removing the number leaves their app alone.
    await (await openRemove(page, FIRST_NUMBER)).getByRole('button', { name: 'Remove number' }).click();
    await expect(page.getByText('No phone numbers yet')).toBeVisible();
    expect(telnyx.callControlApps.has(theirs)).toBe(true);
    expect(telnyx.find('DELETE', /call_control_applications/)).toHaveLength(0);
});

test('an agent with no prompt yet cannot place a test call', async ({ page, db }) => {
    await db.insertVoiceAgent(E2E_USER, { name: 'Draft caller', callType: VoiceAgentCallType.OUTBOUND, prompt: '' });
    await seedNumber(db);
    await openPhoneNumbers(page);

    await testCall(page, FIRST_NUMBER, '+14155550123', VOICE_AGENT_NO_PROMPT_MESSAGE);
    expect(engine.requests).toHaveLength(0);
    expect(telnyxWrites()).toHaveLength(0);
});

test('an account without an outbound voice profile gets a clear error and no apps', async ({ page, db }) => {
    const { sales } = await seedAgents(db);
    await seedNumber(db, FIRST_NUMBER, { outboundAgentId: new ObjectId(sales) });
    telnyx.outboundVoiceProfiles = [];
    await openPhoneNumbers(page);

    await testCall(page, FIRST_NUMBER, '+14155550123', 'Your Telnyx account has no outbound voice profile');
    expect(telnyxWrites()).toHaveLength(0);
    expect(engine.requests).toHaveLength(0);
    expect((await db.getVoiceNumbers(E2E_USER))[0].callControlAppId).toBeUndefined();
});

test('a test call names the chosen agent, prices a minute by where it goes, and spells out the trial limit', async ({
    page,
    db,
}) => {
    const { sales, followUps } = await seedAgents(db);
    const numberId = await seedNumber(db, FIRST_NUMBER, { outboundAgentId: new ObjectId(sales) });
    await db.setVoiceGeminiKey(E2E_USER, E2E_GEMINI_API_KEY); // paid: Gemini is priced
    await openPhoneNumbers(page);
    // A 41-character prompt: Gemini $0.0287 a minute (paid key), plus Telnyx's $0.0125 out to the US.
    await expect(numberRow(page, FIRST_NUMBER).getByTestId('number-cost-estimate')).toHaveText(
        'About $0.041 a minute to the US',
    );
    await expect(numberUse(page, FIRST_NUMBER)).toHaveText(places('Sales outreach'));

    await numberRow(page, FIRST_NUMBER).getByRole('button', { name: 'Test call' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test call' });
    await expect(dialog).toContainText('On a Telnyx trial account, calls only go to numbers you have verified');
    await expect(dialog.getByTestId('test-call-cost')).toHaveText(
        'It should cost about $0.041 a minute to the US (an estimate).',
    );
    // Telnyx publishes no rate for India: only Gemini is counted.
    await dialog.getByLabel('Your phone number').fill('+919876543210');
    await expect(dialog.getByTestId('test-call-cost')).toHaveText(
        'It should cost about $0.029 a minute to India (an estimate, without Telnyx’s charge).',
    );
    await expect(dialog.getByRole('combobox', { name: 'Agent that calls' })).toHaveText('Sales outreach (makes calls)');

    await dialog.getByLabel('Your phone number').fill('4155550123');
    await dialog.getByRole('button', { name: 'Call me now' }).click();
    await expect(dialog.getByRole('alert').last()).toContainText('international format');
    expect(engine.requests).toHaveLength(0);

    // The engine's refusals come back in plain words.
    await dialog.getByLabel('Your phone number').fill(ENGINE_DNC_NUMBER);
    await dialog.getByRole('button', { name: 'Call me now' }).click();
    await expect(dialog.getByRole('alert').last()).toHaveText(`${ENGINE_DNC_NUMBER} is on the do-not-call list`);
    await dialog.getByLabel('Your phone number').fill(ENGINE_UNVERIFIED_NUMBER);
    await dialog.getByRole('button', { name: 'Call me now' }).click();
    await expect(dialog.getByRole('alert').last()).toHaveText(
        'Telnyx refused the call: Destination number is not verified on this trial account',
    );
    engine.clear();

    await chooseOption(page, 'Agent that calls', 'Follow-ups (makes calls)');
    await expect(dialog).toContainText(`Follow-ups rings the number you enter from ${FIRST_NUMBER}`);
    await dialog.getByLabel('Your phone number').fill('+1 415 555 0123');
    await dialog.getByRole('button', { name: 'Call me now' }).click();
    await expect(dialog.getByRole('status')).toContainText('Calling +1 415 555 0123 now');
    expect(engine.requests).toHaveLength(1);
    expect(engine.requests[0]).toMatchObject({
        method: 'POST',
        path: '/calls',
        authorization: `Bearer ${E2E_VOICE_ENGINE_SECRET}`,
        body: { numberId, to: '+14155550123', agentId: followUps },
    });

    // The number had no Call Control app yet: the first call made one, and the routing was left alone.
    expect(telnyxWrites().map((r) => `${r.method} ${r.path}`)).toEqual(['POST /v2/call_control_applications']);
    expect(telnyx.numbers[0].connection_id).toBe(CUSTOMER_CONNECTION_ID);
});

test('an agent that answers calls can ring the owner for a test call, booking tool and all', async ({ page, db }) => {
    const { frontDesk } = await seedAgents(db);
    const numberId = await seedNumber(db, FIRST_NUMBER, { inboundAgentId: new ObjectId(frontDesk) });
    await openPhoneNumbers(page);

    await numberRow(page, FIRST_NUMBER).getByRole('button', { name: 'Test call' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test call' });
    await expect(dialog.getByRole('combobox', { name: 'Agent that calls' })).toHaveText('Front desk (answers calls)');
    await expect(dialog).toContainText(
        `Front desk rings your phone from ${FIRST_NUMBER} and talks to you as if you had called the business`,
    );
    await expect(dialog).toContainText(`You can also call ${FIRST_NUMBER} from any phone: Front desk answers.`);

    await dialog.getByLabel('Your phone number').fill('+14155550123');
    await dialog.getByRole('button', { name: 'Call me now' }).click();
    await expect(dialog.getByRole('status')).toContainText('Calling +14155550123 now. Pick up to talk to Front desk.');
    expect(engine.requests).toHaveLength(1);
    expect(engine.requests[0].body).toEqual({ numberId, to: '+14155550123', agentId: frontDesk });
    // Calling out needs the Call Control app; where the number's calls ring is left alone.
    expect(telnyxWrites().map((r) => `${r.method} ${r.path}`)).toEqual(['POST /v2/call_control_applications']);
    expect(telnyx.numbers[0].connection_id).toBe(CUSTOMER_CONNECTION_ID);
    expect((await db.getVoiceNumbers(E2E_USER))[0].inboundAgentId?.toString()).toBe(frontDesk);
});

test('the agent page starts a test call with that agent, from a number that uses it', async ({ page, db }) => {
    const { frontDesk } = await seedAgents(db);
    await seedNumber(db, FIRST_NUMBER);
    const answering = await seedNumber(db, SECOND_NUMBER, { inboundAgentId: new ObjectId(frontDesk) });
    await openVoiceAgent(page, frontDesk);

    await page.getByRole('button', { name: 'Test call' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test call' });
    // The agent is fixed; the number it answers on is picked first.
    await expect(dialog.getByRole('combobox', { name: 'Agent that calls' })).toHaveCount(0);
    await expect(dialog.getByRole('combobox', { name: 'Calls from' })).toHaveText(`Telnyx · ${formatPhone(SECOND_NUMBER)}`);
    await expect(dialog).toContainText(`Front desk rings your phone from ${SECOND_NUMBER}`);

    await dialog.getByLabel('Your phone number').fill('+14155550123');
    await dialog.getByRole('button', { name: 'Call me now' }).click();
    await expect(dialog.getByRole('status')).toContainText('Calling +14155550123 now');
    expect(engine.requests[0].body).toEqual({ numberId: answering, to: '+14155550123', agentId: frontDesk });
});

test('removing a number the AI never answered leaves its routing alone', async ({ page, db }) => {
    const { sales } = await seedAgents(db);
    await seedNumber(db, FIRST_NUMBER, { outboundAgentId: new ObjectId(sales) });
    await openPhoneNumbers(page);
    await testCall(page, FIRST_NUMBER);
    await page.keyboard.press('Escape');
    const [{ callControlAppId }] = await db.getVoiceNumbers(E2E_USER);
    telnyx.clear();

    await (await openRemove(page, FIRST_NUMBER)).getByRole('button', { name: 'Remove number' }).click();
    await expect(page.getByText('No phone numbers yet')).toBeVisible();
    expect(telnyxWrites().map((r) => `${r.method} ${r.path}`)).toEqual([
        `DELETE /v2/call_control_applications/${callControlAppId}`,
    ]);
    expect(telnyx.numbers[0].connection_id).toBe(CUSTOMER_CONNECTION_ID);
});

test('a wrong key is refused and nothing is stored', async ({ page, db }) => {
    await openPhoneNumbers(page);
    const dialog = await openConnect(page, 'Telnyx');
    await dialog.getByLabel('Telnyx API key').fill('KEY_not_a_real_key');
    await dialog.getByRole('button', { name: 'Find my numbers' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Telnyx rejected this API key');
    expect(await db.getVoiceNumbers(E2E_USER)).toHaveLength(0);
});

test('a user without the Phone numbers grant gets a 404', async ({ page, db }) => {
    await db.resetUser(E2E_USER, { moduleAccess: { [Modules.VOICE_AGENT]: [VOICE_AGENT_SUB_MODULES.CALL_LOGS] } });
    await page.goto(PHONE_NUMBERS_URL);
    await expect(page.getByRole('heading', { name: '404 - Page Not Found' }).first()).toBeVisible();
});

/** Telnyx routing as the agent editor links and unlinks numbers (the agent's type is the number's job). */
test.describe('linking from the agent editor', () => {
    test.fixme(LINK_UI_PENDING !== null, LINK_UI_PENDING ?? '');

    test('an outbound agent creates only the Call Control app and leaves the routing alone; unlinking keeps the app', async ({
        page,
        db,
    }) => {
        const { sales } = await seedAgents(db);
        const numberId = await seedNumber(db);
        await linkNumber(page, sales, FIRST_NUMBER);

        expect(telnyxWrites().map((r) => `${r.method} ${r.path}`)).toEqual(['POST /v2/call_control_applications']);
        expect(telnyxWrites()[0].body).toMatchObject({ webhook_event_url: signedEngineUrl('/telnyx-events', numberId) });
        expect(telnyx.numbers[0].connection_id).toBe(CUSTOMER_CONNECTION_ID);
        const [stored] = await db.getVoiceNumbers(E2E_USER);
        expect(stored.outboundAgentId?.toString()).toBe(sales);
        expect(stored.inboundAgentId).toBeNull();
        expect(stored.texmlAppId).toBeUndefined();
        await openPhoneNumbers(page);
        await expect(numberUse(page, FIRST_NUMBER)).toHaveText(places('Sales outreach'));

        await unlinkNumber(page, sales, FIRST_NUMBER);
        expect((await db.getVoiceNumbers(E2E_USER))[0].outboundAgentId).toBeNull();
        expect(telnyxWrites()).toHaveLength(1);
    });

    test('an agent with no prompt yet cannot be linked', async ({ page, db }) => {
        const draft = await db.insertVoiceAgent(E2E_USER, {
            name: 'Draft desk',
            callType: VoiceAgentCallType.INBOUND,
            prompt: ' ',
        });
        await seedNumber(db);
        await expect(linkNumber(page, draft, FIRST_NUMBER)).rejects.toThrow();
        await expect(page.locator('[data-sonner-toast]').getByText(VOICE_AGENT_NO_PROMPT_MESSAGE)).toBeVisible();
        expect(telnyxWrites()).toHaveLength(0);
        expect((await db.getVoiceNumbers(E2E_USER))[0].inboundAgentId).toBeNull();
    });

    test('an inbound agent saves the previous connection and points the number at the TeXML app; unlinking restores it', async ({
        page,
        db,
    }) => {
        const { frontDesk, afterHours } = await seedAgents(db);
        const numberId = await seedNumber(db);
        await linkNumber(page, afterHours, FIRST_NUMBER);

        const [texmlCreate] = telnyx.find('POST', '/v2/texml_applications');
        expect(texmlCreate.body).toEqual({
            friendly_name: `Aixel Labs voice agent ${FIRST_NUMBER}`,
            voice_url: signedEngineUrl('/texml', numberId),
            voice_method: 'post',
        });
        const [texmlApp] = [...telnyx.texmlApps.values()];
        // Read where it rang, then point it at our app. No Call Control app: that is for calls out.
        expect(telnyx.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
            'POST /v2/texml_applications',
            `GET /v2/phone_numbers/${FIRST_NUMBER_ID}`,
            `PATCH /v2/phone_numbers/${FIRST_NUMBER_ID}`,
        ]);
        expect(telnyx.numbers[0].connection_id).toBe(texmlApp.id);
        let [stored] = await db.getVoiceNumbers(E2E_USER);
        expect(stored.inboundAgentId?.toString()).toBe(afterHours);
        expect(stored.previousConnectionId).toBe(CUSTOMER_CONNECTION_ID);
        expect(stored.texmlAppId).toBe(texmlApp.id);

        // Another inbound agent only changes the field.
        telnyx.clear();
        await linkNumber(page, frontDesk, FIRST_NUMBER);
        expect(telnyx.requests).toHaveLength(0);
        expect((await db.getVoiceNumbers(E2E_USER))[0].inboundAgentId?.toString()).toBe(frontDesk);

        // Unlinked: back on the customer's connection, our app kept for next time.
        await unlinkNumber(page, frontDesk, FIRST_NUMBER);
        expect(telnyx.find('PATCH', `/v2/phone_numbers/${FIRST_NUMBER_ID}`).map((r) => r.body)).toEqual([
            { connection_id: CUSTOMER_CONNECTION_ID },
        ]);
        expect(telnyx.find('DELETE', /applications/)).toHaveLength(0);
        [stored] = await db.getVoiceNumbers(E2E_USER);
        expect(stored.inboundAgentId).toBeNull();
        expect(stored.previousConnectionId).toBeNull();
        expect(stored.texmlAppId).toBe(texmlApp.id);

        // Answering again reuses the app.
        telnyx.clear();
        await linkNumber(page, afterHours, FIRST_NUMBER);
        expect(telnyx.find('POST', /applications$/)).toHaveLength(0);
        expect((await db.getVoiceNumbers(E2E_USER))[0].previousConnectionId).toBe(CUSTOMER_CONNECTION_ID);
    });

    test('a number that had no connection goes back to none, and a Telnyx refusal is explained', async ({ page, db }) => {
        const { afterHours } = await seedAgents(db);
        await seedNumber(db, SECOND_NUMBER);
        await linkNumber(page, afterHours, SECOND_NUMBER);
        expect((await db.getVoiceNumbers(E2E_USER))[0].previousConnectionId).toBeNull();

        telnyx.refuseNullConnection = true;
        await expect(unlinkNumber(page, afterHours, SECOND_NUMBER)).rejects.toThrow();
        await expect(page.getByText(`${SECOND_NUMBER} had no connection in Telnyx before the AI answered it`)).toBeVisible();
        expect((await db.getVoiceNumbers(E2E_USER))[0].inboundAgentId).not.toBeNull();

        telnyx.refuseNullConnection = false;
        telnyx.clear();
        await unlinkNumber(page, afterHours, SECOND_NUMBER);
        expect(telnyx.find('PATCH', `/v2/phone_numbers/${SECOND_NUMBER_ID}`).map((r) => r.body)).toEqual([
            { connection_id: null },
        ]);
    });

    test('a number answers with one agent and calls out for another; taking a slot from an agent asks first', async ({
        page,
        db,
    }) => {
        const { afterHours, sales, followUps } = await seedAgents(db);
        await seedNumber(db);
        await linkNumber(page, afterHours, FIRST_NUMBER);
        const answering = telnyx.numbers[0].connection_id;
        telnyx.clear();

        // The outbound agent only adds the Call Control app: the number keeps answering with After hours.
        await linkNumber(page, sales, FIRST_NUMBER);
        expect(telnyxWrites().map((r) => `${r.method} ${r.path}`)).toEqual(['POST /v2/call_control_applications']);
        expect(telnyx.numbers[0].connection_id).toBe(answering);
        let [stored] = await db.getVoiceNumbers(E2E_USER);
        expect(stored.inboundAgentId?.toString()).toBe(afterHours);
        expect(stored.outboundAgentId?.toString()).toBe(sales);
        await openPhoneNumbers(page);
        const uses = numberRow(page, FIRST_NUMBER).getByTestId('number-use');
        await expect(uses).toContainText(answers('After hours'));
        await expect(uses).toContainText(places('Sales outreach'));

        // Follow-ups wants the outbound slot: the picker says what the number does, and asks before taking it.
        await openVoiceAgent(page, followUps);
        const select = page.getByTestId('agent-numbers-select');
        await expect(select).toHaveText(/\S/);
        await select.click();
        const option = page.getByRole('option', { name: formatPhone(FIRST_NUMBER) });
        await expect(option).toContainText('Answers with After hours · Calls out with Sales outreach');
        await option.click();
        const ask = page.getByRole('dialog', { name: `Use ${FIRST_NUMBER} for Follow-ups?` });
        await expect(ask).toContainText(`${FIRST_NUMBER} already calls out with Sales outreach.`);
        await expect(ask).toContainText('Sales outreach will have no number to call from.');
        await ask.getByRole('button', { name: 'Cancel' }).click();
        [stored] = await db.getVoiceNumbers(E2E_USER);
        expect(stored.outboundAgentId?.toString()).toBe(sales);

        telnyx.clear();
        await linkNumber(page, followUps, FIRST_NUMBER);
        [stored] = await db.getVoiceNumbers(E2E_USER);
        expect(stored.inboundAgentId?.toString()).toBe(afterHours);
        expect(stored.outboundAgentId?.toString()).toBe(followUps);
        expect(telnyxWrites()).toHaveLength(0);
    });

    test('removing an answering number restores its connection, then deletes both apps', async ({ page, db }) => {
        const { sales, afterHours } = await seedAgents(db);
        await seedNumber(db);
        // It made calls first (the Call Control app), then answered them (the TeXML app).
        await linkNumber(page, sales, FIRST_NUMBER);
        await linkNumber(page, afterHours, FIRST_NUMBER);
        const [{ texmlAppId, callControlAppId }] = await db.getVoiceNumbers(E2E_USER);
        telnyx.clear();

        await openPhoneNumbers(page);
        const dialog = await openRemove(page, FIRST_NUMBER);
        await expect(dialog).toContainText('calls ring the way they did before you connected it');
        await dialog.getByRole('button', { name: 'Remove number' }).click();
        await expect(page.getByText('No phone numbers yet')).toBeVisible();

        const calls = telnyx.requests.map((r) => `${r.method} ${r.path}`);
        expect(calls.slice(0, 2)).toEqual([
            `GET /v2/phone_numbers/${FIRST_NUMBER_ID}`,
            `PATCH /v2/phone_numbers/${FIRST_NUMBER_ID}`,
        ]);
        expect(telnyx.requests[1].body).toEqual({ connection_id: CUSTOMER_CONNECTION_ID });
        expect(
            calls
                .slice(2)
                .filter((c) => !c.startsWith('GET '))
                .sort(),
        ).toEqual(
            [
                `DELETE /v2/call_control_applications/${callControlAppId}`,
                `DELETE /v2/texml_applications/${texmlAppId}`,
            ].sort(),
        );
        expect(telnyx.texmlApps.size).toBe(0);
        expect(telnyx.callControlApps.size).toBe(0);
        expect(await db.getVoiceNumbers(E2E_USER)).toHaveLength(0);
    });
});
