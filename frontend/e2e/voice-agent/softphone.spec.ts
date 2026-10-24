import { createHash, createHmac } from 'node:crypto';
import { ObjectId } from 'mongodb';
import type { Page } from '@playwright/test';
import { encryptOverrides } from 'flags';
import {
    VOICE_AGENT_SUB_MODULES,
    VoiceAgentCallType,
    VoiceCallChannel,
    VoiceCallDirection,
} from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';
import { FeatureFlagKey } from '@/flags';
import type { E2eDb } from '../support/db';
import { expect, test } from '../support/fixtures';
import {
    E2E_BASE_URL,
    E2E_FLAGS_SECRET,
    E2E_GEMINI_API_KEY,
    E2E_VOICE_ENGINE_SECRET,
    E2E_VOICE_ENGINE_URL,
    USER_STORAGE_STATE,
} from '../support/env';
import { installFakeTelnyxRtc, openVoiceAgent, type FakeRtcWindow } from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import { CALL_LOGS_URL, FAKE_TELNYX_KEY, FakeTelnyx, FakeVoiceEngine, sealForE2e } from './fake-telephony';

const NUMBER = '+13473703925';

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

test.beforeEach(async ({ db, context }) => {
    telnyx.reset();
    engine.clear();
    engine.refuseSipCalls = false;
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
    await db.setVoiceGeminiKey(E2E_USER, E2E_GEMINI_API_KEY);
    await installFakeTelnyxRtc(context);
});

/** An inbound agent answering a Telnyx number (with its TeXML app, as answering leaves it). */
async function inboundAgent(db: E2eDb) {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Front Desk', callType: VoiceAgentCallType.INBOUND });
    const texmlAppId = telnyx.addTexmlApp({ friendly_name: `Aixel Labs voice agent ${NUMBER}`, voice_url: 'https://old' });
    const numberId = await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: NUMBER,
        providerNumberId: '1293384261075731499',
        apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
        texmlAppId,
    });
    await db.setVoiceNumberAgents(numberId, { inboundAgentId: agentId });
    return { agentId, numberId, texmlAppId };
}

async function outboundAgent(db: E2eDb) {
    const agentId = await db.insertVoiceAgent(E2E_USER, {
        name: 'Caller',
        callType: VoiceAgentCallType.OUTBOUND,
        prompt: 'You call {{name}} about their order.',
    });
    await db.setVoiceAgentFields(agentId, { variables: { name: 'Sam' } });
    const numberId = await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: NUMBER,
        providerNumberId: '1293384261075731499',
        apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
    });
    await db.setVoiceNumberAgents(numberId, { outboundAgentId: agentId });
    return { agentId, numberId };
}

async function openTest(page: Page, agentId: string, title: string) {
    await openVoiceAgent(page, agentId);
    await page.getByRole('button', { name: title }).click();
    return page.getByRole('dialog', { name: title });
}

const subdomainOf = (texmlAppId: string) =>
    (telnyx.texmlApps.get(texmlAppId) as { inbound?: { sip_subdomain?: string } }).inbound?.sip_subdomain;

test('inbound, in this browser: dials the agent’s SIP address, like a customer calling the number', async ({ page, db }) => {
    const { agentId, texmlAppId } = await inboundAgent(db);
    const dialog = await openTest(page, agentId, 'Call this agent');
    await expect(dialog).toContainText('You call Front Desk the way a customer would');
    await expect(dialog).toContainText('as if you called +1 347 370 3925');

    await dialog.getByRole('button', { name: 'Call Front Desk' }).click();
    await expect(dialog.getByRole('status')).toHaveText('Ringing…');
    const calls = await page.evaluate(() => (window as unknown as FakeRtcWindow).e2eNewCalls);
    // Its own address, no caller ID (a SIP call has none): Call logs tell it from a softphone's.
    expect(calls).toEqual([{ destinationNumber: `sip:frontdesk-browser@${subdomainOf(texmlAppId)}.sip.telnyx.com` }]);
    expect(telnyx.find('POST', '/v2/telephony_credentials')).toHaveLength(1);

    await page.evaluate(() => (window as unknown as FakeRtcWindow).e2eSetState('active'));
    await expect(dialog.getByRole('status')).toContainText('On the call with Front Desk');
    await dialog.getByRole('button', { name: 'Hang up' }).click();
    await expect(dialog.getByRole('button', { name: 'Call Front Desk' })).toBeVisible();
});

test('outbound, in this browser: the agent rings the signed-in browser, which answers', async ({ page, db }) => {
    const { agentId, numberId } = await outboundAgent(db);
    const dialog = await openTest(page, agentId, 'Have Caller call me');
    await expect(dialog).toContainText('Caller calls you and starts the conversation');
    await expect(dialog).toContainText('a trial account only calls its verified number');

    await dialog.getByRole('button', { name: 'Call me here' }).click();
    await expect(dialog.getByRole('status')).toHaveText('Waiting for the call…');
    const [credential] = [...telnyx.telephonyCredentials.values()] as { sip_username: string }[];
    expect(engine.find('POST', '/calls').map((r) => r.body)).toEqual([
        { numberId, to: `sip:${credential.sip_username}@sip.telnyx.com`, agentId },
    ]);
    // The browser's SIP URI takes the account's own calls (the agent's) only.
    expect([...telnyx.credentialConnections.values()][0]).toMatchObject({ sip_uri_calling_preference: 'internal' });

    await page.evaluate(() => (window as unknown as FakeRtcWindow).e2eRing());
    await expect(dialog.getByRole('status')).toHaveText('Caller is calling…');
    await dialog.getByRole('button', { name: 'Answer' }).click();
    await expect(dialog.getByRole('status')).toContainText('On the call with Caller');
    await dialog.getByRole('button', { name: 'Hang up' }).click();
    await expect(dialog.getByRole('button', { name: 'Call me here' })).toBeVisible();
});

test('inbound, from a softphone: set up, dial the SIP address, reset and remove', async ({ page, db }) => {
    const { agentId, numberId, texmlAppId } = await inboundAgent(db);
    const dialog = await openTest(page, agentId, 'Call this agent');
    await dialog.getByRole('tab', { name: 'From your softphone' }).click();
    await dialog.getByRole('button', { name: 'Set up Linphone' }).click();

    // A SIP login on the account's one credential connection, with an outbound voice profile (Telnyx refuses its
    // calls to an "only my connections" subdomain without one), its SIP URI open to the account's own calls only.
    const userName = await dialog.getByTestId('softphone-username').innerText();
    const password = await dialog.getByTestId('softphone-password').innerText();
    const [connection] = [...telnyx.credentialConnections.values()];
    expect(connection).toMatchObject({
        connection_name: 'Aixel Labs web phone',
        user_name: userName,
        password,
        sip_uri_calling_preference: 'internal',
        outbound: { outbound_voice_profile_id: '1911630617284445511' },
    });
    await expect(dialog.getByTestId('softphone-status')).toContainText('Not signed in yet');

    // Linphone's one-time setup link (and its QR code): the whole account as Linphone XML, once, never cached.
    await expect(dialog.getByTestId('linphone-qr')).toBeVisible();
    const link = await dialog.getByTestId('linphone-setup-link').innerText();
    expect(link).toMatch(/\/api\/voice-agent\/softphone\/provision\/[A-Za-z0-9_-]{43}$/);
    const first = await page.request.get(link);
    expect(first.status()).toBe(200);
    expect(first.headers()['cache-control']).toContain('no-store');
    const xml = await first.text();
    expect(xml).toContain(`<entry name="username" overwrite="true">${userName}</entry>`);
    expect(xml).toContain(`<entry name="passwd" overwrite="true">${password}</entry>`);
    expect(xml).toContain('<entry name="reg_route" overwrite="true">&lt;sip:sip.telnyx.com;transport=tls&gt;</entry>');
    expect((await page.request.get(link)).status()).toBe(404);
    expect((await db.getVoiceAccount(E2E_USER))?.softphone?.provisioning).toBeNull();

    // The number's TeXML app takes SIP calls from the account's own connections, and still points at the engine.
    const app = telnyx.texmlApps.get(texmlAppId) as { inbound: Record<string, string>; voice_url: string };
    const sig = createHmac('sha256', E2E_VOICE_ENGINE_SECRET).update(`number|${numberId}`).digest('hex').slice(0, 32);
    expect(app.voice_url).toBe(`${E2E_VOICE_ENGINE_URL}/texml?n=${numberId}&sig=${sig}`);
    expect(app.inbound.sip_subdomain_receive_settings).toBe('only_my_connections');
    await expect(dialog.getByTestId('softphone-dial-in')).toHaveText(
        `sip:frontdesk@${app.inbound.sip_subdomain}.sip.telnyx.com;transport=tls`,
    );

    // Nothing secret is kept once the link is spent: the password lives only in Telnyx and was on screen once.
    const account = await db.getVoiceAccount(E2E_USER);
    expect(account?.softphone).toMatchObject({ userName, connectionId: connection.id });
    expect(JSON.stringify(account?.softphone)).not.toContain(password);
    expect((await db.getVoiceNumbers(E2E_USER))[0].sipSubdomain).toBe(app.inbound.sip_subdomain);

    // The password survives switching tabs; signed in, then opened again: not shown twice, subdomain not set twice.
    await dialog.getByRole('tab', { name: 'In this browser' }).click();
    await dialog.getByRole('tab', { name: 'From your softphone' }).click();
    await expect(dialog.getByTestId('softphone-password')).toHaveText(password);
    telnyx.registered.add(userName);
    await dialog.getByRole('button', { name: 'Check again' }).click();
    await expect(dialog.getByTestId('softphone-status')).toContainText('Signed in');
    await page.keyboard.press('Escape');
    const patches = telnyx.find('PATCH', /^\/v2\/texml_applications\//).length;
    const reopened = await openTest(page, agentId, 'Call this agent');
    await reopened.getByRole('tab', { name: 'From your softphone' }).click();
    await expect(reopened.getByTestId('softphone-dial-in')).toBeVisible();
    await expect(reopened.getByTestId('softphone-password')).toHaveCount(0);
    expect(telnyx.find('PATCH', /^\/v2\/texml_applications\//)).toHaveLength(patches);

    await reopened.getByRole('button', { name: 'New setup link' }).click();
    await expect(reopened.getByTestId('softphone-password')).toBeVisible();
    const newPassword = await reopened.getByTestId('softphone-password').innerText();
    expect(newPassword).not.toBe(password);
    expect(connection.password).toBe(newPassword);

    await reopened.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('dialog', { name: 'Remove the softphone?' }).getByRole('button', { name: 'Remove' }).click();
    await expect(reopened.getByRole('button', { name: 'Set up Linphone' })).toBeVisible();
    expect(connection.password).not.toBe(newPassword);
    expect((await db.getVoiceAccount(E2E_USER))?.softphone).toBeNull();
});

test('outbound, on a softphone: the agent calls it once it is signed in', async ({ page, db }) => {
    const { agentId, numberId } = await outboundAgent(db);
    const dialog = await openTest(page, agentId, 'Have Caller call me');
    await dialog.getByRole('tab', { name: 'On your softphone' }).click();
    await dialog.getByRole('button', { name: 'Set up Linphone' }).click();
    const userName = await dialog.getByTestId('softphone-username').innerText();
    const call = dialog.getByRole('button', { name: 'Call my softphone' });
    await expect(call).toBeDisabled();

    telnyx.registered.add(userName);
    await dialog.getByRole('button', { name: 'Check again' }).click();
    await call.click();
    await expect(dialog.getByRole('status')).toContainText(`Caller is calling Linphone from ${NUMBER}`);
    expect(engine.find('POST', '/calls').map((r) => r.body)).toEqual([
        { numberId, to: `sip:${userName}@sip.telnyx.com`, agentId },
    ]);
});

test('web dialer: the Agents tab calls an agent like a customer would', async ({ page, db, context }) => {
    const { texmlAppId } = await inboundAgent(db);
    const value = await encryptOverrides({ [FeatureFlagKey.VOICE_WEB_DIALER]: true }, E2E_FLAGS_SECRET);
    await context.addCookies([{ name: 'vercel-flag-overrides', value, url: E2E_BASE_URL }]);
    await page.goto(SubModuleUrls[VOICE_AGENT_SUB_MODULES.WEB_DIALER]);

    await page.getByRole('tab', { name: 'Agents' }).click();
    await page
        .getByRole('list', { name: 'Agents' })
        .getByRole('button', { name: /Front Desk/ })
        .click();
    await expect(page.getByText('as if you called +1 347 370 3925')).toBeVisible();
    await expect(page.getByText('Front Desk', { exact: true })).toBeVisible();
    await expect
        .poll(() => page.evaluate(() => (window as unknown as FakeRtcWindow).e2eNewCalls))
        .toEqual([{ destinationNumber: `sip:frontdesk-browser@${subdomainOf(texmlAppId)}.sip.telnyx.com` }]);
    await page.getByRole('button', { name: 'Hang up' }).click();
    await expect(page.getByRole('tab', { name: 'Agents' })).toBeVisible();
});

test('outbound rehearsal in this browser: the owner dials in, the agent runs it as its outbound call', async ({
    page,
    db,
}) => {
    const { agentId, numberId } = await outboundAgent(db);
    engine.refuseSipCalls = true; // a trial account
    const dialog = await openTest(page, agentId, 'Have Caller call me');
    await dialog.getByRole('button', { name: 'Call me here' }).click();
    await expect(dialog.getByText(/account level does not allow this call/)).toBeVisible();
    const rehearsal = dialog.getByTestId('rehearsal').first();
    await expect(rehearsal).toContainText('Your Telnyx account cannot place this call yet');

    await rehearsal.getByLabel('{{name}}').fill('Ana');
    await expect(rehearsal.getByLabel('{{name}}')).toHaveAttribute('placeholder', 'Sam');
    await rehearsal.getByRole('button', { name: 'Rehearse: call Caller here' }).click();
    await expect(dialog.getByRole('status')).toHaveText('Ringing…');
    const [call] = await page.evaluate(() => (window as unknown as FakeRtcWindow).e2eNewCalls);
    const match = /^sip:caller-rehearse-([0-9a-f]{24})-browser@(aixel[0-9a-f]{12})\.sip\.telnyx\.com$/.exec(
        call.destinationNumber,
    );
    expect(match, call.destinationNumber).not.toBeNull();

    // The number only places calls: it got a TeXML app (and SIP subdomain) of its own, its routing untouched.
    expect(telnyx.texmlApps.size).toBe(1);
    expect(subdomainOf([...telnyx.texmlApps.keys()][0])).toBe(match![2]);
    expect(telnyx.find('PATCH', /^\/v2\/phone_numbers\//)).toHaveLength(0);
    // What the engine takes once: the agent, the number it "calls from", the values; the token only as its hash.
    const account = await db.getVoiceAccount(E2E_USER);
    expect(account?.rehearsal).toMatchObject({
        tokenHash: createHash('sha256').update(match![1]).digest('hex'),
        variables: { name: 'Ana' },
    });
    expect(String(account?.rehearsal?.agentId)).toBe(agentId);
    expect(String(account?.rehearsal?.numberId)).toBe(numberId);
});

test('outbound rehearsal on Linphone: the address to dial, over TLS', async ({ page, db }) => {
    const { agentId } = await outboundAgent(db);
    const dialog = await openTest(page, agentId, 'Have Caller call me');
    await dialog.getByRole('tab', { name: 'On your softphone' }).click();
    await dialog.getByRole('button', { name: 'Set up Linphone' }).click();
    const rehearsal = dialog.getByTestId('rehearsal').last();
    await rehearsal.getByRole('button', { name: 'Get the address to dial' }).click();
    await expect(rehearsal.getByTestId('rehearsal-address')).toHaveText(
        /^sip:caller-rehearse-[0-9a-f]{24}@aixel[0-9a-f]{12}\.sip\.telnyx\.com;transport=tls$/,
    );
});

test('call logs: browser and softphone tests say so', async ({ page, db }) => {
    const agentId = new ObjectId(await db.insertVoiceAgent(E2E_USER, { name: 'Front Desk' }));
    const now = new Date();
    const call = (from: string, startedAt: Date) => ({
        agentId,
        channel: VoiceCallChannel.PHONE,
        direction: VoiceCallDirection.INBOUND,
        from,
        to: NUMBER,
        voice: 'sulafat',
        startedAt,
        endedAt: startedAt,
        durationSec: 30,
        endedBy: 'caller_hung_up',
        flags: [],
        turns: [],
        gapsMs: [],
    });
    await db.insertVoiceCalls(E2E_USER, [
        call('sip:aixel0123abcd@sip.telnyx.com', now),
        call('sip:frontdesk-browser@aixel0a1b2c3d4e5f.sip.telnyx.com', new Date(now.getTime() - 60_000)),
        {
            ...call(NUMBER, new Date(now.getTime() - 120_000)),
            direction: VoiceCallDirection.OUTBOUND,
            to: 'sip:caller-rehearse-0123456789abcdef01234567-browser@aixel0a1b2c3d4e5f.sip.telnyx.com',
        },
    ]);
    await page.goto(CALL_LOGS_URL);
    const cards = page.getByTestId('call-card');
    await expect(cards.nth(0)).toContainText('Softphone test');
    await expect(cards.nth(1)).toContainText('Browser test');
    await expect(cards.nth(2)).toContainText('Outbound rehearsal');
    await expect(cards.nth(0)).not.toContainText('aixel0123abcd');
});
