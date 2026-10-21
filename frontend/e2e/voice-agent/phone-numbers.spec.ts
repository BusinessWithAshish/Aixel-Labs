import { createHmac } from 'node:crypto';
import { ObjectId } from 'mongodb';
import type { Page } from '@playwright/test';
import { Modules, VOICE_AGENT_SUB_MODULES, VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { VOICE_AGENT_NO_PROMPT_MESSAGE } from '@/helpers/voice-agent-defaults';
import type { E2eDb } from '../support/db';
import { expect, test } from '../support/fixtures';
import { E2E_VOICE_ENGINE_SECRET, E2E_VOICE_ENGINE_URL, USER_STORAGE_STATE } from '../support/env';
import { openVoiceAgent, waitForHydration } from '../support/voice-agents';
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

/** What `numberWebhookUrl` must produce: the engine path, the number id and its permanent signature. */
function signedEngineUrl(path: '/texml' | '/telnyx-events', numberId: string): string {
    const sig = createHmac('sha256', E2E_VOICE_ENGINE_SECRET).update(`number|${numberId}`).digest('hex').slice(0, 32);
    return `${E2E_VOICE_ENGINE_URL}${path}?n=${numberId}&sig=${sig}`;
}

async function openPhoneNumbers(page: Page): Promise<void> {
    await page.goto(PHONE_NUMBERS_URL);
    await waitForHydration(page, '#header');
}

async function connectAndImport(page: Page, keep: string[]): Promise<void> {
    await page.getByRole('button', { name: 'Connect a number' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Connect a number' });
    // Telnyx is the default provider.
    await expect(dialog.getByRole('radio', { name: 'Telnyx' })).toHaveAttribute('aria-checked', 'true');
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

function numberRow(page: Page, phoneNumber: string) {
    return page.getByTestId('voice-number-row').filter({ hasText: phoneNumber });
}

type Job = 'Answer calls' | 'Make calls' | 'Not used yet';

/** One of the three jobs a number can do ("What this number does"). */
function jobRadio(page: Page, phoneNumber: string, job: Job) {
    return numberRow(page, phoneNumber).getByRole('radio', { name: job });
}

/** The badge that says what the number does now. */
function jobBadge(page: Page, phoneNumber: string) {
    return numberRow(page, phoneNumber).getByTestId('number-job');
}

const answerAgent = (phoneNumber: string) => `Agent that answers for ${phoneNumber}`;
const callerAgent = (phoneNumber: string) => `Agent that makes the calls for ${phoneNumber}`;

/** Sets the number to make calls (the first outbound agent), then picks `agent` for it. */
async function makeCalls(page: Page, phoneNumber: string, agent: string): Promise<void> {
    await jobRadio(page, phoneNumber, 'Make calls').click();
    await expect(jobBadge(page, phoneNumber)).toHaveText('Makes calls');
    await chooseOption(page, callerAgent(phoneNumber), agent);
    await expect(page.getByText(`${agent} now makes the calls from ${phoneNumber}`)).toBeVisible();
}

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
    await expect(jobBadge(page, FIRST_NUMBER)).toHaveText('Not used yet');
    await expect(numberRow(page, FIRST_NUMBER).getByTestId('number-provider')).toHaveText('Telnyx');
    await expect(numberRow(page, SECOND_NUMBER)).toHaveCount(0);
    await expect(jobRadio(page, FIRST_NUMBER, 'Not used yet')).toBeChecked();

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

test('each job offers only agents made for it, and a test call may use any agent', async ({ page, db }) => {
    await seedAgents(db);
    await seedNumber(db);
    await openPhoneNumbers(page);

    await jobRadio(page, FIRST_NUMBER, 'Make calls').click();
    await expect(page.getByText(`Follow-ups now makes the calls from ${FIRST_NUMBER}`)).toBeVisible();
    expect(await optionsOf(page, callerAgent(FIRST_NUMBER))).toEqual(['Follow-ups', 'Sales outreach']);

    await jobRadio(page, FIRST_NUMBER, 'Answer calls').click();
    await expect(jobBadge(page, FIRST_NUMBER)).toHaveText('Answers calls');
    expect(await optionsOf(page, answerAgent(FIRST_NUMBER))).toEqual(['After hours', 'Front desk']);
    await expect(page.getByRole('combobox', { name: callerAgent(FIRST_NUMBER) })).toHaveCount(0);

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

test('an outbound agent creates only the Call Control app and leaves the routing alone', async ({ page, db }) => {
    const { sales } = await seedAgents(db);
    const numberId = await seedNumber(db);
    await openPhoneNumbers(page);

    await makeCalls(page, FIRST_NUMBER, 'Sales outreach');

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

    const [stored] = await db.getVoiceNumbers(E2E_USER);
    expect(stored.outboundAgentId?.toString()).toBe(sales);
    expect(stored.callControlAppId).toBe(callControlApp.id);
    expect(stored.inboundAgentId).toBeNull();
    expect(stored.texmlAppId).toBeUndefined();

    // Not used any more: the app is kept for next time.
    await jobRadio(page, FIRST_NUMBER, 'Not used yet').click();
    await expect(
        page.getByText(`The AI is off for ${FIRST_NUMBER}. Calls to it ring the way they did before.`),
    ).toBeVisible();
    await expect(jobBadge(page, FIRST_NUMBER)).toHaveText('Not used yet');
    expect((await db.getVoiceNumbers(E2E_USER))[0].outboundAgentId).toBeNull();
    expect(telnyxWrites()).toHaveLength(1);
});

test("one Call Control app serves every number, and at the trial limit the customer's own app is used untouched", async ({
    page,
    db,
}) => {
    const { sales } = await seedAgents(db);
    // A trial account: one Call Control app allowed, and the customer already has it.
    telnyx.callControlAppLimit = 1;
    const theirs = telnyx.addCustomerCallControlApp('voicelab-outbound');
    await seedNumber(db);
    await openPhoneNumbers(page);

    await makeCalls(page, FIRST_NUMBER, 'Sales outreach');
    const [stored] = await db.getVoiceNumbers(E2E_USER);
    expect(stored.outboundAgentId?.toString()).toBe(sales);
    expect(stored.callControlAppId).toBe(theirs);
    // Their app is used as it is: no PATCH, no DELETE, nothing renamed.
    expect(telnyxWrites().filter((r) => r.method !== 'POST')).toHaveLength(0);
    expect(telnyx.callControlApps.size).toBe(1);

    // Removing the number leaves their app alone.
    await numberRow(page, FIRST_NUMBER).getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove number' }).click();
    await expect(page.getByText('No phone numbers yet')).toBeVisible();
    expect(telnyx.callControlApps.has(theirs)).toBe(true);
    expect(telnyx.find('DELETE', /call_control_applications/)).toHaveLength(0);
});

test('an agent with no prompt yet cannot answer or place calls from a number', async ({ page, db }) => {
    await db.insertVoiceAgent(E2E_USER, { name: 'Draft caller', callType: VoiceAgentCallType.OUTBOUND, prompt: '' });
    await db.insertVoiceAgent(E2E_USER, { name: 'Draft desk', callType: VoiceAgentCallType.INBOUND, prompt: '  ' });
    await seedNumber(db);
    await openPhoneNumbers(page);
    const noPrompt = page.getByText(VOICE_AGENT_NO_PROMPT_MESSAGE);

    await jobRadio(page, FIRST_NUMBER, 'Answer calls').click();
    await expect(noPrompt).toBeVisible();
    await expect(jobBadge(page, FIRST_NUMBER)).toHaveText('Not used yet');

    await jobRadio(page, FIRST_NUMBER, 'Make calls').click();
    await expect(noPrompt.first()).toBeVisible();
    await expect(jobBadge(page, FIRST_NUMBER)).toHaveText('Not used yet');

    expect(telnyxWrites()).toHaveLength(0);
    const [stored] = await db.getVoiceNumbers(E2E_USER);
    expect(stored.inboundAgentId).toBeNull();
    expect(stored.outboundAgentId).toBeNull();

    // A test call with it is refused before the engine is asked.
    await numberRow(page, FIRST_NUMBER).getByRole('button', { name: 'Test call' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test call' });
    await chooseOption(page, 'Agent that calls', 'Draft caller (makes calls)');
    await dialog.getByLabel('Your phone number').fill('+14155550123');
    await dialog.getByRole('button', { name: 'Call me now' }).click();
    await expect(dialog.getByRole('alert').last()).toHaveText(VOICE_AGENT_NO_PROMPT_MESSAGE);
    expect(engine.requests).toHaveLength(0);
});

test('an account without an outbound voice profile gets a clear error and no apps', async ({ page, db }) => {
    await seedAgents(db);
    await seedNumber(db);
    telnyx.outboundVoiceProfiles = [];
    await openPhoneNumbers(page);

    await jobRadio(page, FIRST_NUMBER, 'Make calls').click();
    await expect(page.getByText('Your Telnyx account has no outbound voice profile')).toBeVisible();
    await expect(jobBadge(page, FIRST_NUMBER)).toHaveText('Not used yet');
    await expect(jobRadio(page, FIRST_NUMBER, 'Not used yet')).toBeChecked();
    expect(telnyxWrites()).toHaveLength(0);
    const [stored] = await db.getVoiceNumbers(E2E_USER);
    expect(stored.outboundAgentId).toBeNull();
    expect(stored.callControlAppId).toBeUndefined();
});

test('answering calls saves the previous connection, points the number at the TeXML app, and "Not used yet" restores it', async ({
    page,
    db,
}) => {
    const { frontDesk, afterHours } = await seedAgents(db);
    const numberId = await seedNumber(db);
    await openPhoneNumbers(page);

    await jobRadio(page, FIRST_NUMBER, 'Answer calls').click();
    await expect(page.getByText(`After hours now answers every call to ${FIRST_NUMBER}`)).toBeVisible();
    await expect(jobRadio(page, FIRST_NUMBER, 'Answer calls')).toBeChecked();
    await expect(jobBadge(page, FIRST_NUMBER)).toHaveText('Answers calls');

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
    expect(telnyx.find('PATCH', `/v2/phone_numbers/${FIRST_NUMBER_ID}`)[0].body).toEqual({ connection_id: texmlApp.id });
    expect(telnyx.numbers[0].connection_id).toBe(texmlApp.id);

    let [stored] = await db.getVoiceNumbers(E2E_USER);
    expect(stored.inboundAgentId?.toString()).toBe(afterHours);
    expect(stored.previousConnectionId).toBe(CUSTOMER_CONNECTION_ID);
    expect(stored.texmlAppId).toBe(texmlApp.id);
    expect(stored.callControlAppId).toBeUndefined();

    // Changing the agent while on only changes the field.
    telnyx.clear();
    await chooseOption(page, answerAgent(FIRST_NUMBER), 'Front desk');
    await expect(page.getByText(`Front desk now answers every call to ${FIRST_NUMBER}`)).toBeVisible();
    expect(telnyx.requests).toHaveLength(0);
    expect((await db.getVoiceNumbers(E2E_USER))[0].inboundAgentId?.toString()).toBe(frontDesk);

    // Not used: back on the customer's connection, our app kept for next time.
    await jobRadio(page, FIRST_NUMBER, 'Not used yet').click();
    await expect(
        page.getByText(`The AI is off for ${FIRST_NUMBER}. Calls to it ring the way they did before.`),
    ).toBeVisible();
    await expect(jobRadio(page, FIRST_NUMBER, 'Answer calls')).not.toBeChecked();
    await expect(jobBadge(page, FIRST_NUMBER)).toHaveText('Not used yet');
    expect(telnyx.find('PATCH', `/v2/phone_numbers/${FIRST_NUMBER_ID}`).map((r) => r.body)).toEqual([
        { connection_id: CUSTOMER_CONNECTION_ID },
    ]);
    expect(telnyx.numbers[0].connection_id).toBe(CUSTOMER_CONNECTION_ID);
    expect(telnyx.find('DELETE', /applications/)).toHaveLength(0);
    [stored] = await db.getVoiceNumbers(E2E_USER);
    expect(stored.inboundAgentId).toBeNull();
    expect(stored.previousConnectionId).toBeNull();
    expect(stored.texmlAppId).toBe(texmlApp.id);

    // Answering again reuses the app.
    telnyx.clear();
    await jobRadio(page, FIRST_NUMBER, 'Answer calls').click();
    await expect(jobBadge(page, FIRST_NUMBER)).toHaveText('Answers calls');
    expect(telnyx.find('POST', /applications$/)).toHaveLength(0);
    expect((await db.getVoiceNumbers(E2E_USER))[0].previousConnectionId).toBe(CUSTOMER_CONNECTION_ID);
});

test('a number that had no connection goes back to none, and a Telnyx refusal is explained', async ({ page, db }) => {
    await seedAgents(db);
    await seedNumber(db, SECOND_NUMBER);
    await openPhoneNumbers(page);

    await jobRadio(page, SECOND_NUMBER, 'Answer calls').click();
    await expect(jobBadge(page, SECOND_NUMBER)).toHaveText('Answers calls');
    expect((await db.getVoiceNumbers(E2E_USER))[0].previousConnectionId).toBeNull();

    telnyx.refuseNullConnection = true;
    await jobRadio(page, SECOND_NUMBER, 'Not used yet').click();
    await expect(page.getByText(`${SECOND_NUMBER} had no connection in Telnyx before the AI answered it`)).toBeVisible();
    await expect(jobRadio(page, SECOND_NUMBER, 'Answer calls')).toBeChecked();
    expect((await db.getVoiceNumbers(E2E_USER))[0].inboundAgentId).not.toBeNull();

    telnyx.refuseNullConnection = false;
    telnyx.clear();
    await jobRadio(page, SECOND_NUMBER, 'Not used yet').click();
    await expect(jobRadio(page, SECOND_NUMBER, 'Not used yet')).toBeChecked();
    expect(telnyx.find('PATCH', `/v2/phone_numbers/${SECOND_NUMBER_ID}`).map((r) => r.body)).toEqual([
        { connection_id: null },
    ]);
    expect(telnyx.numbers[1].connection_id).toBeNull();
});

test('a test call names the chosen agent and the trial limit is spelled out', async ({ page, db }) => {
    const { sales, followUps } = await seedAgents(db);
    const numberId = await seedNumber(db, FIRST_NUMBER, { outboundAgentId: new ObjectId(sales) });
    await openPhoneNumbers(page);

    await numberRow(page, FIRST_NUMBER).getByRole('button', { name: 'Test call' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test call' });
    await expect(dialog).toContainText('On a Telnyx trial account, calls only go to numbers you have verified');
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

test('a number does one job: switching from answering to making calls puts its connection back first', async ({
    page,
    db,
}) => {
    const { sales } = await seedAgents(db);
    await seedNumber(db);
    await openPhoneNumbers(page);
    await jobRadio(page, FIRST_NUMBER, 'Answer calls').click();
    await expect(jobBadge(page, FIRST_NUMBER)).toHaveText('Answers calls');
    telnyx.clear();

    await jobRadio(page, FIRST_NUMBER, 'Make calls').click();
    await expect(page.getByText(`Follow-ups now makes the calls from ${FIRST_NUMBER}`)).toBeVisible();
    await expect(jobRadio(page, FIRST_NUMBER, 'Answer calls')).not.toBeChecked();
    // The number rings the customer's own way again before the Call Control app is made.
    expect(telnyxWrites().map((r) => `${r.method} ${r.path}`)).toEqual([
        `PATCH /v2/phone_numbers/${FIRST_NUMBER_ID}`,
        'POST /v2/call_control_applications',
    ]);
    expect(telnyx.numbers[0].connection_id).toBe(CUSTOMER_CONNECTION_ID);
    let [stored] = await db.getVoiceNumbers(E2E_USER);
    expect(stored.inboundAgentId).toBeNull();
    expect(stored.previousConnectionId).toBeNull();
    expect(stored.outboundAgentId).not.toBeNull();

    await chooseOption(page, callerAgent(FIRST_NUMBER), 'Sales outreach');
    await expect(page.getByText(`Sales outreach now makes the calls from ${FIRST_NUMBER}`)).toBeVisible();
    [stored] = await db.getVoiceNumbers(E2E_USER);
    expect(stored.outboundAgentId?.toString()).toBe(sales);
    expect(stored.inboundAgentId).toBeNull();
});

test('a number set up with two jobs before says so and keeps only the job the owner picks', async ({ page, db }) => {
    const { frontDesk, sales } = await seedAgents(db);
    await seedNumber(db, FIRST_NUMBER, { inboundAgentId: new ObjectId(frontDesk), outboundAgentId: new ObjectId(sales) });
    await openPhoneNumbers(page);

    await expect(jobBadge(page, FIRST_NUMBER)).toHaveText('Pick one job');
    await expect(numberRow(page, FIRST_NUMBER)).toContainText(
        'This number was set up to do two jobs: Front desk answers its calls and Sales outreach makes calls from it.',
    );
    for (const job of ['Answer calls', 'Make calls', 'Not used yet'] as const) {
        await expect(jobRadio(page, FIRST_NUMBER, job)).not.toBeChecked();
    }
    // Nothing changed on its own.
    expect((await db.getVoiceNumbers(E2E_USER))[0]).toMatchObject({
        inboundAgentId: new ObjectId(frontDesk),
        outboundAgentId: new ObjectId(sales),
    });

    await jobRadio(page, FIRST_NUMBER, 'Make calls').click();
    await expect(page.getByText(`Sales outreach now makes the calls from ${FIRST_NUMBER}`)).toBeVisible();
    await expect(jobBadge(page, FIRST_NUMBER)).toHaveText('Makes calls');
    const [stored] = await db.getVoiceNumbers(E2E_USER);
    expect(stored.inboundAgentId).toBeNull();
    expect(stored.outboundAgentId?.toString()).toBe(sales);
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

    await page.getByTestId('voice-agent-used-on').getByRole('button', { name: 'Test call' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test call' });
    // The agent is fixed; the number it answers on is picked first.
    await expect(dialog.getByRole('combobox', { name: 'Agent that calls' })).toHaveCount(0);
    await expect(dialog.getByRole('combobox', { name: 'Calls from' })).toHaveText(`${SECOND_NUMBER} (Telnyx)`);
    await expect(dialog).toContainText(`Front desk rings your phone from ${SECOND_NUMBER}`);

    await dialog.getByLabel('Your phone number').fill('+14155550123');
    await dialog.getByRole('button', { name: 'Call me now' }).click();
    await expect(dialog.getByRole('status')).toContainText('Calling +14155550123 now');
    expect(engine.requests[0].body).toEqual({ numberId: answering, to: '+14155550123', agentId: frontDesk });
});

test('removing an answering number restores its connection, then deletes both apps', async ({ page, db }) => {
    await seedAgents(db);
    await seedNumber(db);
    await openPhoneNumbers(page);
    // It made calls first (the Call Control app), then switched to answering them (the TeXML app).
    await makeCalls(page, FIRST_NUMBER, 'Sales outreach');
    await jobRadio(page, FIRST_NUMBER, 'Answer calls').click();
    await expect(jobBadge(page, FIRST_NUMBER)).toHaveText('Answers calls');
    const [{ texmlAppId, callControlAppId }] = await db.getVoiceNumbers(E2E_USER);
    telnyx.clear();

    await numberRow(page, FIRST_NUMBER).getByRole('button', { name: 'Remove' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('calls ring the way they did before you connected it');
    await dialog.getByRole('button', { name: 'Remove number' }).click();
    await expect(page.getByText('No phone numbers yet')).toBeVisible();

    const calls = telnyx.requests.map((r) => `${r.method} ${r.path}`);
    expect(calls.slice(0, 2)).toEqual([
        `GET /v2/phone_numbers/${FIRST_NUMBER_ID}`,
        `PATCH /v2/phone_numbers/${FIRST_NUMBER_ID}`,
    ]);
    expect(telnyx.requests[1].body).toEqual({ connection_id: CUSTOMER_CONNECTION_ID });
    // The shared Call Control app is checked (is it ours, does another number use it?) before it goes.
    expect(
        calls
            .slice(2)
            .filter((c) => !c.startsWith('GET '))
            .sort(),
    ).toEqual(
        [`DELETE /v2/call_control_applications/${callControlAppId}`, `DELETE /v2/texml_applications/${texmlAppId}`].sort(),
    );
    expect(telnyx.numbers[0].connection_id).toBe(CUSTOMER_CONNECTION_ID);
    expect(telnyx.texmlApps.size).toBe(0);
    expect(telnyx.callControlApps.size).toBe(0);
    expect(await db.getVoiceNumbers(E2E_USER)).toHaveLength(0);
});

test('removing a number the AI never answered leaves its routing alone', async ({ page, db }) => {
    await seedAgents(db);
    await seedNumber(db);
    await openPhoneNumbers(page);
    await makeCalls(page, FIRST_NUMBER, 'Sales outreach');
    const [{ callControlAppId }] = await db.getVoiceNumbers(E2E_USER);
    telnyx.clear();

    await numberRow(page, FIRST_NUMBER).getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove number' }).click();
    await expect(page.getByText('No phone numbers yet')).toBeVisible();
    expect(telnyxWrites().map((r) => `${r.method} ${r.path}`)).toEqual([
        `DELETE /v2/call_control_applications/${callControlAppId}`,
    ]);
    expect(telnyx.numbers[0].connection_id).toBe(CUSTOMER_CONNECTION_ID);
});

test('a wrong key is refused and nothing is stored', async ({ page, db }) => {
    await openPhoneNumbers(page);
    await page.getByRole('button', { name: 'Connect a number' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Connect a number' });
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
