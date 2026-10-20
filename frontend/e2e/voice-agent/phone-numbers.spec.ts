import { createHmac } from 'node:crypto';
import { ObjectId } from 'mongodb';
import type { Page } from '@playwright/test';
import { Modules, VOICE_AGENT_SUB_MODULES, VoiceAgentCallType } from '@aixellabs/backend/db/types';
import type { E2eDb } from '../support/db';
import { expect, test } from '../support/fixtures';
import { E2E_VOICE_ENGINE_SECRET, E2E_VOICE_ENGINE_URL, USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
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

function aiSwitch(page: Page, phoneNumber: string) {
    return numberRow(page, phoneNumber).getByRole('switch', { name: 'AI answers incoming calls' });
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
    extra: { outboundAgentId?: ObjectId; callControlAppId?: string } = {},
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
    await expect(numberRow(page, FIRST_NUMBER)).toContainText('Not set up');
    await expect(numberRow(page, FIRST_NUMBER).getByTestId('number-provider')).toHaveText('Telnyx');
    await expect(numberRow(page, SECOND_NUMBER)).toHaveCount(0);
    await expect(aiSwitch(page, FIRST_NUMBER)).not.toBeChecked();

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

test('each picker offers only agents made for that kind of call', async ({ page, db }) => {
    await seedAgents(db);
    await seedNumber(db);
    await openPhoneNumbers(page);

    expect(await optionsOf(page, `Outbound agent for ${FIRST_NUMBER}`)).toEqual([
        'No outbound agent',
        'Follow-ups',
        'Sales outreach',
    ]);

    await aiSwitch(page, FIRST_NUMBER).click();
    await expect(numberRow(page, FIRST_NUMBER)).toContainText('AI answers calls');
    expect(await optionsOf(page, `Inbound agent for ${FIRST_NUMBER}`)).toEqual(['After hours', 'Front desk']);

    await numberRow(page, FIRST_NUMBER).getByRole('button', { name: 'Test call' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test call' });
    expect(await optionsOf(page, 'Agent that calls')).toEqual(['Follow-ups', 'Sales outreach']);
    await expect(dialog).toBeVisible();
});

test('an outbound agent creates only the Call Control app and leaves the routing alone', async ({ page, db }) => {
    const { sales } = await seedAgents(db);
    const numberId = await seedNumber(db);
    await openPhoneNumbers(page);

    await chooseOption(page, `Outbound agent for ${FIRST_NUMBER}`, 'Sales outreach');
    await expect(page.getByText(`Sales outreach now places calls from ${FIRST_NUMBER}`)).toBeVisible();
    await expect(numberRow(page, FIRST_NUMBER)).toContainText('Outbound only');

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

    // Clearing it keeps the app for next time.
    await chooseOption(page, `Outbound agent for ${FIRST_NUMBER}`, 'No outbound agent');
    await expect(numberRow(page, FIRST_NUMBER)).toContainText('Not set up');
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

    await chooseOption(page, `Outbound agent for ${FIRST_NUMBER}`, 'Sales outreach');
    await expect(page.getByText(`Sales outreach now places calls from ${FIRST_NUMBER}`)).toBeVisible();
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

test('an account without an outbound voice profile gets a clear error and no apps', async ({ page, db }) => {
    await seedAgents(db);
    await seedNumber(db);
    telnyx.outboundVoiceProfiles = [];
    await openPhoneNumbers(page);

    await chooseOption(page, `Outbound agent for ${FIRST_NUMBER}`, 'Sales outreach');
    await expect(page.getByText('Your Telnyx account has no outbound voice profile')).toBeVisible();
    await expect(numberRow(page, FIRST_NUMBER)).toContainText('Not set up');
    expect(telnyxWrites()).toHaveLength(0);
    const [stored] = await db.getVoiceNumbers(E2E_USER);
    expect(stored.outboundAgentId).toBeNull();
    expect(stored.callControlAppId).toBeUndefined();
});

test('AI answering saves the previous connection, points the number at the TeXML app, and off restores it', async ({
    page,
    db,
}) => {
    const { frontDesk, afterHours } = await seedAgents(db);
    const numberId = await seedNumber(db);
    await openPhoneNumbers(page);

    await aiSwitch(page, FIRST_NUMBER).click();
    await expect(page.getByText(`The AI now answers every call to ${FIRST_NUMBER}, as After hours`)).toBeVisible();
    await expect(aiSwitch(page, FIRST_NUMBER)).toBeChecked();
    await expect(numberRow(page, FIRST_NUMBER)).toContainText('AI answers calls');

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
    await chooseOption(page, `Inbound agent for ${FIRST_NUMBER}`, 'Front desk');
    await expect(page.getByText(`Front desk now answers ${FIRST_NUMBER}`)).toBeVisible();
    expect(telnyx.requests).toHaveLength(0);
    expect((await db.getVoiceNumbers(E2E_USER))[0].inboundAgentId?.toString()).toBe(frontDesk);

    // Off: back on the customer's connection, our app kept for next time.
    await aiSwitch(page, FIRST_NUMBER).click();
    await expect(page.getByText(`AI answering is off. ${FIRST_NUMBER} rings wherever it did before.`)).toBeVisible();
    await expect(aiSwitch(page, FIRST_NUMBER)).not.toBeChecked();
    await expect(numberRow(page, FIRST_NUMBER)).toContainText('Not set up');
    expect(telnyx.find('PATCH', `/v2/phone_numbers/${FIRST_NUMBER_ID}`).map((r) => r.body)).toEqual([
        { connection_id: CUSTOMER_CONNECTION_ID },
    ]);
    expect(telnyx.numbers[0].connection_id).toBe(CUSTOMER_CONNECTION_ID);
    expect(telnyx.find('DELETE', /applications/)).toHaveLength(0);
    [stored] = await db.getVoiceNumbers(E2E_USER);
    expect(stored.inboundAgentId).toBeNull();
    expect(stored.previousConnectionId).toBeNull();
    expect(stored.texmlAppId).toBe(texmlApp.id);

    // On again reuses the app.
    telnyx.clear();
    await aiSwitch(page, FIRST_NUMBER).click();
    await expect(numberRow(page, FIRST_NUMBER)).toContainText('AI answers calls');
    expect(telnyx.find('POST', /applications$/)).toHaveLength(0);
    expect((await db.getVoiceNumbers(E2E_USER))[0].previousConnectionId).toBe(CUSTOMER_CONNECTION_ID);
});

test('a number that had no connection goes back to none, and a Telnyx refusal is explained', async ({ page, db }) => {
    await seedAgents(db);
    await seedNumber(db, SECOND_NUMBER);
    await openPhoneNumbers(page);

    await aiSwitch(page, SECOND_NUMBER).click();
    await expect(numberRow(page, SECOND_NUMBER)).toContainText('AI answers calls');
    expect((await db.getVoiceNumbers(E2E_USER))[0].previousConnectionId).toBeNull();

    telnyx.refuseNullConnection = true;
    await aiSwitch(page, SECOND_NUMBER).click();
    await expect(page.getByText(`${SECOND_NUMBER} had no connection in Telnyx before the AI answered it`)).toBeVisible();
    await expect(aiSwitch(page, SECOND_NUMBER)).toBeChecked();
    expect((await db.getVoiceNumbers(E2E_USER))[0].inboundAgentId).not.toBeNull();

    telnyx.refuseNullConnection = false;
    telnyx.clear();
    await aiSwitch(page, SECOND_NUMBER).click();
    await expect(aiSwitch(page, SECOND_NUMBER)).not.toBeChecked();
    expect(telnyx.find('PATCH', `/v2/phone_numbers/${SECOND_NUMBER_ID}`).map((r) => r.body)).toEqual([
        { connection_id: null },
    ]);
    expect(telnyx.numbers[1].connection_id).toBeNull();
});

test('a test call names the chosen outbound agent and the trial limit is spelled out', async ({ page, db }) => {
    const { sales, followUps } = await seedAgents(db);
    const numberId = await seedNumber(db, FIRST_NUMBER, { outboundAgentId: new ObjectId(sales) });
    await openPhoneNumbers(page);

    await numberRow(page, FIRST_NUMBER).getByRole('button', { name: 'Test call' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test call' });
    await expect(dialog).toContainText('Telnyx trial accounts can only call numbers you have verified');
    await expect(dialog.getByRole('combobox', { name: 'Agent that calls' })).toHaveText('Sales outreach');

    await dialog.getByLabel('Number to call').fill('4155550123');
    await dialog.getByRole('button', { name: 'Call now' }).click();
    await expect(dialog.getByRole('alert').last()).toContainText('international format');
    expect(engine.requests).toHaveLength(0);

    // The engine's refusals come back in plain words.
    await dialog.getByLabel('Number to call').fill(ENGINE_DNC_NUMBER);
    await dialog.getByRole('button', { name: 'Call now' }).click();
    await expect(dialog.getByRole('alert').last()).toHaveText(`${ENGINE_DNC_NUMBER} is on the do-not-call list`);
    await dialog.getByLabel('Number to call').fill(ENGINE_UNVERIFIED_NUMBER);
    await dialog.getByRole('button', { name: 'Call now' }).click();
    await expect(dialog.getByRole('alert').last()).toHaveText(
        'Telnyx refused the call: Destination number is not verified on this trial account',
    );
    engine.clear();

    await chooseOption(page, 'Agent that calls', 'Follow-ups');
    await expect(dialog).toContainText(`Follow-ups calls the number you enter from ${FIRST_NUMBER}`);
    await dialog.getByLabel('Number to call').fill('+1 415 555 0123');
    await dialog.getByRole('button', { name: 'Call now' }).click();
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

test('removing a number with AI answering on restores its connection, then deletes both apps', async ({ page, db }) => {
    await seedAgents(db);
    await seedNumber(db);
    await openPhoneNumbers(page);
    await chooseOption(page, `Outbound agent for ${FIRST_NUMBER}`, 'Sales outreach');
    await expect(numberRow(page, FIRST_NUMBER)).toContainText('Outbound only');
    await aiSwitch(page, FIRST_NUMBER).click();
    await expect(numberRow(page, FIRST_NUMBER)).toContainText('AI answers calls');
    const [{ texmlAppId, callControlAppId }] = await db.getVoiceNumbers(E2E_USER);
    telnyx.clear();

    await numberRow(page, FIRST_NUMBER).getByRole('button', { name: 'Remove' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('goes back to the connection it had before');
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
    await chooseOption(page, `Outbound agent for ${FIRST_NUMBER}`, 'Sales outreach');
    await expect(numberRow(page, FIRST_NUMBER)).toContainText('Outbound only');
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
