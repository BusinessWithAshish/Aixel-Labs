import { createHmac } from 'node:crypto';
import type { Page } from '@playwright/test';
import { VoiceAgentCallType, VoiceProvider, type VoiceNumberDoc } from '@aixellabs/backend/db/types';
import type { E2eDb } from '../support/db';
import { expect, test } from '../support/fixtures';
import { E2E_VOICE_ENGINE_SECRET, E2E_VOICE_ENGINE_URL, USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_ADMIN, E2E_USER } from '../support/users';
import {
    FAKE_VOICELINK_TOKEN,
    FakeVoiceEngine,
    FakeVoiceLink,
    PHONE_NUMBERS_URL,
    sealForE2e,
    VOICELINK_CUSTOMER_TRUNK_ID,
    type FakeVoiceLinkRouting,
} from './fake-telephony';

/** DID 501: both halves on the customer's SIP trunk (the update path). */
const TRUNK_NUMBER = '+919484950416';
const TRUNK_DID_ID = 501;
const TRUNK_RULE_ID = 9001;
/** DID 502: no routing rule yet (the create path). */
const BARE_NUMBER = '+918069450100';
const BARE_DID_ID = 502;

const TRUNK = VOICELINK_CUSTOMER_TRUNK_ID;

function sig(numberId: string): string {
    return createHmac('sha256', E2E_VOICE_ENGINE_SECRET).update(`number|${numberId}`).digest('hex').slice(0, 32);
}

/** What the bot must point at: the engine's media socket and its events webhook, both signed for the number. */
function botBody(numberId: string, phoneNumber: string, status: 0 | 1) {
    return {
        bot_name: `Aixel Labs ${phoneNumber}`,
        websocket_url: `${E2E_VOICE_ENGINE_URL.replace(/^http/, 'ws')}/voicelink?n=${numberId}&sig=${sig(numberId)}`,
        webhook_url: `${E2E_VOICE_ENGINE_URL}/voicelink-events?n=${numberId}&sig=${sig(numberId)}`,
        audio_format: 'alaw',
        status,
        noise_cancel: 0,
    };
}

/** The customer's rule on DID 501 as stored by the app before its first change. */
const TRUNK_RULE_SAVED = {
    forInboundCall: 2,
    forOutboundCall: 2,
    inboundSipTrunkId: TRUNK,
    inboundWebsocketBotId: null,
    outboundSipTrunkId: TRUNK,
    outboundWebsocketBotId: null,
    status: 1,
};

let voicelink: FakeVoiceLink;
let engine: FakeVoiceEngine;
let originalTrunkRule: FakeVoiceLinkRouting;

async function openPhoneNumbers(page: Page): Promise<void> {
    await page.goto(PHONE_NUMBERS_URL);
    await waitForHydration(page, '#header');
}

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

async function chooseOption(page: Page, combobox: string, option: string): Promise<void> {
    await page.getByRole('combobox', { name: combobox }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
}

async function openVoiceLinkConnect(page: Page, token = FAKE_VOICELINK_TOKEN, clientId = '') {
    await page.getByRole('button', { name: 'Connect a number' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Connect a number' });
    await dialog.getByRole('radio', { name: 'VoiceLink' }).click();
    await expect(dialog.getByRole('radio', { name: 'VoiceLink' })).toHaveAttribute('aria-checked', 'true');
    await dialog.getByLabel('VoiceLink API token').fill(token);
    if (clientId) await dialog.getByLabel('Client ID').fill(clientId);
    await dialog.getByRole('button', { name: 'Find my numbers' }).click();
    return dialog;
}

async function seedAgents(db: E2eDb) {
    return {
        frontDesk: await db.insertVoiceAgent(E2E_USER, { name: 'Front desk', callType: VoiceAgentCallType.INBOUND }),
        afterHours: await db.insertVoiceAgent(E2E_USER, { name: 'After hours', callType: VoiceAgentCallType.INBOUND }),
        sales: await db.insertVoiceAgent(E2E_USER, { name: 'Sales outreach', callType: VoiceAgentCallType.OUTBOUND }),
        followUps: await db.insertVoiceAgent(E2E_USER, { name: 'Follow-ups', callType: VoiceAgentCallType.OUTBOUND }),
    };
}

async function seedVoiceLinkNumber(db: E2eDb, phoneNumber: string, didId: number): Promise<string> {
    return db.insertVoiceNumber(E2E_USER, {
        provider: VoiceProvider.VOICELINK,
        phoneNumber,
        providerNumberId: String(didId),
        apiKeySealed: sealForE2e(FAKE_VOICELINK_TOKEN),
        voicelink: { clientId: null, botId: null, routingId: null },
    });
}

async function storedNumber(db: E2eDb): Promise<VoiceNumberDoc> {
    const [stored] = await db.getVoiceNumbers(E2E_USER);
    return stored;
}

function writeLines() {
    return voicelink.writes().map((r) => `${r.method} ${r.path}`);
}

test.use({ storageState: USER_STORAGE_STATE });

test.beforeAll(async () => {
    voicelink = await FakeVoiceLink.start();
    engine = await FakeVoiceEngine.start();
});

test.afterAll(async () => {
    await voicelink?.stop();
    await engine?.stop();
});

test.beforeEach(async ({ db }) => {
    voicelink.reset();
    originalTrunkRule = structuredClone(voicelink.routings.get(TRUNK_DID_ID) as FakeVoiceLinkRouting);
    engine.clear();
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
});

test('connecting VoiceLink lists the DIDs and imports without changing anything; the token stays sealed', async ({
    page,
    db,
}) => {
    await openPhoneNumbers(page);
    const dialog = await openVoiceLinkConnect(page, FAKE_VOICELINK_TOKEN, '77');
    await expect(dialog.getByRole('checkbox')).toHaveCount(2);
    await expect(dialog.getByRole('checkbox', { name: TRUNK_NUMBER })).toBeChecked();
    await dialog.getByRole('checkbox', { name: BARE_NUMBER }).click();
    await dialog.getByRole('button', { name: 'Import 1 number' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Nothing changed in VoiceLink')).toBeVisible();

    const row = numberRow(page, TRUNK_NUMBER);
    await expect(row.getByTestId('number-job')).toHaveText('Not used yet');
    await expect(row.getByTestId('number-provider')).toHaveText('VoiceLink');
    await expect(numberRow(page, BARE_NUMBER)).toHaveCount(0);

    const stored = await storedNumber(db);
    expect(stored).toMatchObject({
        provider: VoiceProvider.VOICELINK,
        phoneNumber: TRUNK_NUMBER,
        providerNumberId: String(TRUNK_DID_ID),
        inboundAgentId: null,
        outboundAgentId: null,
        voicelink: { clientId: 77, botId: null, routingId: null },
    });
    expect(stored.voicelink).not.toHaveProperty('previousRouting');
    expect(stored.apiKeySealed).toMatch(/^v1\./);
    expect(stored.apiKeySealed).not.toContain(FAKE_VOICELINK_TOKEN);

    // Only reads (the list on connect, again on import), all with the token and the client id.
    expect(voicelink.writes()).toHaveLength(0);
    expect(voicelink.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
        'GET /v1/reseller/did/purchased',
        'GET /v1/reseller/did/purchased',
    ]);
    for (const r of voicelink.requests) {
        expect(r.authorization).toBe(`Bearer ${FAKE_VOICELINK_TOKEN}`);
        expect(r.query).toEqual({ page: '1', per_page: '100', client_id: '77' });
    }
    expect(voicelink.routings.get(TRUNK_DID_ID)).toEqual(originalTrunkRule);
    expect(voicelink.bots.size).toBe(0);

    await page.reload();
    await waitForHydration(page, '#header');
    const html = await page.content();
    expect(html).not.toContain(FAKE_VOICELINK_TOKEN);
    expect(html).not.toContain(stored.apiKeySealed);
    expect(html).not.toContain('apiKeySealed');
});

test('a DID another account already connected cannot be imported', async ({ page, db }) => {
    await db.insertVoiceNumber(E2E_ADMIN, {
        provider: VoiceProvider.VOICELINK,
        phoneNumber: TRUNK_NUMBER,
        providerNumberId: String(TRUNK_DID_ID),
        apiKeySealed: sealForE2e(FAKE_VOICELINK_TOKEN),
    });
    try {
        await openPhoneNumbers(page);
        const dialog = await openVoiceLinkConnect(page);
        const taken = dialog.getByRole('listitem').filter({ hasText: TRUNK_NUMBER });
        await expect(taken).toContainText('Used by another account');
        await expect(dialog.getByRole('checkbox', { name: TRUNK_NUMBER })).toBeDisabled();
        await dialog.getByRole('button', { name: 'Import 1 number' }).click();
        await expect(dialog).toBeHidden();
        expect((await db.getVoiceNumbers(E2E_USER)).map((n) => n.phoneNumber)).toEqual([BARE_NUMBER]);
    } finally {
        await db.resetVoiceTelephony(E2E_ADMIN);
    }
});

test('answering calls creates the bot with signed URLs, takes only the inbound half, and "Not used yet" puts the trunk back', async ({
    page,
    db,
}) => {
    const { frontDesk, afterHours } = await seedAgents(db);
    const numberId = await seedVoiceLinkNumber(db, TRUNK_NUMBER, TRUNK_DID_ID);
    await openPhoneNumbers(page);

    await jobRadio(page, TRUNK_NUMBER, 'Answer calls').click();
    await expect(page.getByText(`After hours now answers every call to ${TRUNK_NUMBER}`)).toBeVisible();
    await expect(jobBadge(page, TRUNK_NUMBER)).toHaveText('Answers calls');

    expect(writeLines()).toEqual(['POST /v1/websocket-bot/create', `POST /v1/call-routing/update/${TRUNK_RULE_ID}`]);
    const [botCreate, routingUpdate] = voicelink.writes();
    expect(botCreate.body).toEqual(botBody(numberId, TRUNK_NUMBER, 1));
    const [bot] = [...voicelink.bots.values()];
    // Inbound to our bot; the outbound half resent exactly as it was.
    expect(routingUpdate.body).toEqual({
        for_inbound_call: 3,
        for_outbound_call: 2,
        status: 1,
        inbound_websocket_bot_id: bot.id,
        outbound_sip_trunk_id: TRUNK,
    });
    expect(voicelink.routings.get(TRUNK_DID_ID)).toMatchObject({
        for_inbound_call: 3,
        inbound_websocket_bot_id: bot.id,
        for_outbound_call: 2,
        outbound_sip_trunk_id: TRUNK,
        status: 1,
    });

    let stored = await storedNumber(db);
    expect(stored.inboundAgentId?.toString()).toBe(afterHours);
    expect(stored.voicelink).toEqual({
        clientId: null,
        botId: bot.id,
        routingId: TRUNK_RULE_ID,
        previousRouting: TRUNK_RULE_SAVED,
    });

    // Changing the agent while on changes nothing at VoiceLink.
    voicelink.clear();
    await chooseOption(page, answerAgent(TRUNK_NUMBER), 'Front desk');
    await expect(page.getByText(`Front desk now answers every call to ${TRUNK_NUMBER}`)).toBeVisible();
    expect(voicelink.requests).toHaveLength(0);
    expect((await storedNumber(db)).inboundAgentId?.toString()).toBe(frontDesk);

    // Not used: the inbound half goes back to the trunk, and the rule is exactly the customer's again.
    await jobRadio(page, TRUNK_NUMBER, 'Not used yet').click();
    await expect(
        page.getByText(`The AI is off for ${TRUNK_NUMBER}. Calls to it ring the way they did before.`),
    ).toBeVisible();
    await expect(jobBadge(page, TRUNK_NUMBER)).toHaveText('Not used yet');
    expect(writeLines()).toEqual([`POST /v1/call-routing/update/${TRUNK_RULE_ID}`]);
    expect(voicelink.writes()[0].body).toEqual({
        for_inbound_call: 2,
        for_outbound_call: 2,
        status: 1,
        inbound_sip_trunk_id: TRUNK,
        outbound_sip_trunk_id: TRUNK,
    });
    expect(voicelink.routings.get(TRUNK_DID_ID)).toEqual(originalTrunkRule);
    stored = await storedNumber(db);
    expect(stored.inboundAgentId).toBeNull();
    expect(stored.voicelink).toEqual({ clientId: null, botId: bot.id, routingId: TRUNK_RULE_ID });

    // Answering again reuses the bot and saves the rule afresh.
    voicelink.clear();
    await jobRadio(page, TRUNK_NUMBER, 'Answer calls').click();
    await expect(jobBadge(page, TRUNK_NUMBER)).toHaveText('Answers calls');
    expect(writeLines()).toEqual([`POST /v1/call-routing/update/${TRUNK_RULE_ID}`]);
    expect((await storedNumber(db)).voicelink?.previousRouting).toEqual(TRUNK_RULE_SAVED);
});

test('making calls takes only the outbound half; switching to answering swaps the halves, and "Not used yet" restores the rule', async ({
    page,
    db,
}) => {
    const { sales } = await seedAgents(db);
    await seedVoiceLinkNumber(db, TRUNK_NUMBER, TRUNK_DID_ID);
    await openPhoneNumbers(page);

    await jobRadio(page, TRUNK_NUMBER, 'Make calls').click();
    await expect(page.getByText(`Follow-ups now makes the calls from ${TRUNK_NUMBER}`)).toBeVisible();
    await expect(jobBadge(page, TRUNK_NUMBER)).toHaveText('Makes calls');
    const [bot] = [...voicelink.bots.values()];
    expect(writeLines()).toEqual(['POST /v1/websocket-bot/create', `POST /v1/call-routing/update/${TRUNK_RULE_ID}`]);
    expect(voicelink.writes()[1].body).toEqual({
        for_inbound_call: 2,
        for_outbound_call: 3,
        status: 1,
        inbound_sip_trunk_id: TRUNK,
        outbound_websocket_bot_id: bot.id,
    });
    // Another agent for the same job changes nothing at VoiceLink.
    voicelink.clear();
    await chooseOption(page, callerAgent(TRUNK_NUMBER), 'Sales outreach');
    await expect(page.getByText(`Sales outreach now makes the calls from ${TRUNK_NUMBER}`)).toBeVisible();
    expect(voicelink.writes()).toHaveLength(0);
    let stored = await storedNumber(db);
    expect(stored.outboundAgentId?.toString()).toBe(sales);
    expect(stored.voicelink?.previousRouting).toEqual(TRUNK_RULE_SAVED);

    // Answering instead: the outbound half goes back to the trunk first, then the inbound half is ours.
    voicelink.clear();
    await jobRadio(page, TRUNK_NUMBER, 'Answer calls').click();
    await expect(jobBadge(page, TRUNK_NUMBER)).toHaveText('Answers calls');
    expect(voicelink.writes().map((r) => r.body)).toEqual([
        {
            for_inbound_call: 2,
            for_outbound_call: 2,
            status: 1,
            inbound_sip_trunk_id: TRUNK,
            outbound_sip_trunk_id: TRUNK,
        },
        {
            for_inbound_call: 3,
            for_outbound_call: 2,
            status: 1,
            inbound_websocket_bot_id: bot.id,
            outbound_sip_trunk_id: TRUNK,
        },
    ]);
    stored = await storedNumber(db);
    expect(stored.outboundAgentId).toBeNull();
    expect(stored.voicelink?.previousRouting).toEqual(TRUNK_RULE_SAVED);

    // Not used: the rule is the customer's again.
    voicelink.clear();
    await jobRadio(page, TRUNK_NUMBER, 'Not used yet').click();
    await expect(jobBadge(page, TRUNK_NUMBER)).toHaveText('Not used yet');
    expect(voicelink.routings.get(TRUNK_DID_ID)).toEqual(originalTrunkRule);
    stored = await storedNumber(db);
    expect(stored.inboundAgentId).toBeNull();
    expect(stored.voicelink).not.toHaveProperty('previousRouting');
});

test('a DID with no rule gets one made for it, switched off again once nothing of ours uses it', async ({ page, db }) => {
    await seedAgents(db);
    await seedVoiceLinkNumber(db, BARE_NUMBER, BARE_DID_ID);
    await openPhoneNumbers(page);
    expect(voicelink.routings.has(BARE_DID_ID)).toBe(false);

    await jobRadio(page, BARE_NUMBER, 'Answer calls').click();
    await expect(jobBadge(page, BARE_NUMBER)).toHaveText('Answers calls');
    const [bot] = [...voicelink.bots.values()];
    expect(writeLines()).toEqual(['POST /v1/websocket-bot/create', 'POST /v1/call-routing/create']);
    expect(voicelink.writes()[1].body).toEqual({
        did_number: '918069450100',
        did_id: BARE_DID_ID,
        for_inbound_call: 3,
        for_outbound_call: 4,
        status: 1,
        inbound_websocket_bot_id: bot.id,
    });
    const rule = voicelink.routings.get(BARE_DID_ID) as FakeVoiceLinkRouting;
    let stored = await storedNumber(db);
    // null: the DID had no rule before us.
    expect(stored.voicelink).toEqual({ clientId: null, botId: bot.id, routingId: rule.id, previousRouting: null });

    // Nothing of ours left: the rule we made is switched off as it stands (VoiceLink has no delete).
    voicelink.clear();
    await jobRadio(page, BARE_NUMBER, 'Not used yet').click();
    await expect(jobBadge(page, BARE_NUMBER)).toHaveText('Not used yet');
    expect(voicelink.writes().map((r) => r.body)).toEqual([
        { for_inbound_call: 3, for_outbound_call: 4, status: 0, inbound_websocket_bot_id: bot.id },
    ]);
    expect(voicelink.routings.get(BARE_DID_ID)?.status).toBe(0);
    stored = await storedNumber(db);
    expect(stored.voicelink).toEqual({ clientId: null, botId: bot.id, routingId: rule.id });

    // Next time the leftover is not mistaken for the customer's own handler.
    voicelink.clear();
    await jobRadio(page, BARE_NUMBER, 'Answer calls').click();
    await expect(jobBadge(page, BARE_NUMBER)).toHaveText('Answers calls');
    expect((await storedNumber(db)).voicelink?.previousRouting).toEqual({
        forInboundCall: null,
        forOutboundCall: 4,
        inboundSipTrunkId: null,
        inboundWebsocketBotId: null,
        outboundSipTrunkId: null,
        outboundWebsocketBotId: null,
        status: 0,
    });
    expect(voicelink.writes().map((r) => r.body)).toEqual([
        { for_inbound_call: 3, for_outbound_call: 4, status: 1, inbound_websocket_bot_id: bot.id },
    ]);
});

test('removing a VoiceLink number puts its rule back exactly and switches the bot off', async ({ page, db }) => {
    await seedAgents(db);
    const numberId = await seedVoiceLinkNumber(db, TRUNK_NUMBER, TRUNK_DID_ID);
    await openPhoneNumbers(page);
    // It made calls first, then switched to answering them.
    await jobRadio(page, TRUNK_NUMBER, 'Make calls').click();
    await expect(jobBadge(page, TRUNK_NUMBER)).toHaveText('Makes calls');
    await jobRadio(page, TRUNK_NUMBER, 'Answer calls').click();
    await expect(jobBadge(page, TRUNK_NUMBER)).toHaveText('Answers calls');
    const [bot] = [...voicelink.bots.values()];
    voicelink.clear();

    await numberRow(page, TRUNK_NUMBER).getByRole('button', { name: 'Remove' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('calls ring the way they did before you connected it');
    await dialog.getByRole('button', { name: 'Remove number' }).click();
    await expect(page.getByText('No phone numbers yet')).toBeVisible();

    expect(writeLines()).toEqual([
        `POST /v1/call-routing/update/${TRUNK_RULE_ID}`,
        `POST /v1/websocket-bot/update/${bot.id}`,
    ]);
    expect(voicelink.writes()[0].body).toEqual({
        for_inbound_call: 2,
        for_outbound_call: 2,
        status: 1,
        inbound_sip_trunk_id: TRUNK,
        outbound_sip_trunk_id: TRUNK,
    });
    expect(voicelink.writes()[1].body).toEqual(botBody(numberId, TRUNK_NUMBER, 0));
    expect(voicelink.routings.get(TRUNK_DID_ID)).toEqual(originalTrunkRule);
    expect(voicelink.bots.get(bot.id)?.status).toBe(0);
    expect(await db.getVoiceNumbers(E2E_USER)).toHaveLength(0);
});

test('a VoiceLink number places test calls only when set to make calls; an answering one is called instead', async ({
    page,
    db,
}) => {
    const { followUps } = await seedAgents(db);
    const numberId = await seedVoiceLinkNumber(db, TRUNK_NUMBER, TRUNK_DID_ID);
    await openPhoneNumbers(page);
    await jobRadio(page, TRUNK_NUMBER, 'Answer calls').click();
    await expect(jobBadge(page, TRUNK_NUMBER)).toHaveText('Answers calls');

    await numberRow(page, TRUNK_NUMBER).getByRole('button', { name: 'Test call' }).click();
    let dialog = page.getByRole('dialog', { name: 'Test call' });
    await expect(dialog).toContainText('VoiceLink only places AI calls from a number set to “Make calls”.');
    await expect(dialog).toContainText(`To try After hours, call ${TRUNK_NUMBER} from your phone: it answers.`);
    await expect(dialog.getByRole('button', { name: 'Call me now' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await jobRadio(page, TRUNK_NUMBER, 'Make calls').click();
    await expect(jobBadge(page, TRUNK_NUMBER)).toHaveText('Makes calls');
    voicelink.clear();

    await numberRow(page, TRUNK_NUMBER).getByRole('button', { name: 'Test call' }).click();
    dialog = page.getByRole('dialog', { name: 'Test call' });
    await expect(dialog).toContainText('The call is charged to your VoiceLink balance');
    await expect(dialog.getByLabel('Your phone number')).toHaveAttribute('placeholder', '+919876543210');
    await expect(dialog.getByRole('combobox', { name: 'Agent that calls' })).toHaveText('Follow-ups (makes calls)');
    await dialog.getByLabel('Your phone number').fill('+91 98765 43210');
    await dialog.getByRole('button', { name: 'Call me now' }).click();
    await expect(dialog.getByRole('status')).toContainText('Calling +91 98765 43210 now');

    expect(engine.requests).toHaveLength(1);
    expect(engine.requests[0]).toMatchObject({
        method: 'POST',
        path: '/calls',
        authorization: `Bearer ${E2E_VOICE_ENGINE_SECRET}`,
        body: { numberId, to: '+919876543210', agentId: followUps },
    });
    // The routing was set with "Make calls"; the call itself changes nothing at VoiceLink.
    expect(voicelink.writes()).toHaveLength(0);
});

test('a wrong VoiceLink token is refused and nothing is stored', async ({ page, db }) => {
    await openPhoneNumbers(page);
    const dialog = await openVoiceLinkConnect(page, '41|not_a_real_token');
    await expect(dialog.getByRole('alert')).toContainText('VoiceLink rejected this API token');
    expect(await db.getVoiceNumbers(E2E_USER)).toHaveLength(0);
});
