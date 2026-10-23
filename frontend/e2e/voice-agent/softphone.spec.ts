import { createHmac } from 'node:crypto';
import { ObjectId } from 'mongodb';
import type { Page } from '@playwright/test';
import { VoiceAgentCallType, VoiceCallChannel, VoiceCallDirection } from '@aixellabs/backend/db/types';
import { expect, test } from '../support/fixtures';
import { E2E_GEMINI_API_KEY, E2E_VOICE_ENGINE_SECRET, E2E_VOICE_ENGINE_URL, USER_STORAGE_STATE } from '../support/env';
import { openVoiceAgent } from '../support/voice-agents';
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

test.beforeEach(async ({ db }) => {
    telnyx.reset();
    engine.clear();
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
    await db.setVoiceGeminiKey(E2E_USER, E2E_GEMINI_API_KEY);
});

async function openSoftphone(page: Page, agentId: string) {
    await openVoiceAgent(page, agentId);
    await page.getByRole('button', { name: 'Softphone' }).click();
    return page.getByRole('dialog', { name: 'Test on a softphone' });
}

test('inbound: set up, dial the agent at its number’s SIP address, reset and remove', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Front Desk', callType: VoiceAgentCallType.INBOUND });
    const texmlAppId = telnyx.addTexmlApp({ friendly_name: `Aixel Labs voice agent ${NUMBER}`, voice_url: 'https://old' });
    const numberId = await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: NUMBER,
        providerNumberId: '1293384261075731499',
        apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
        texmlAppId,
    });
    await db.setVoiceNumberAgents(numberId, { inboundAgentId: agentId });

    const dialog = await openSoftphone(page, agentId);
    await dialog.getByRole('button', { name: 'Set up softphone' }).click();

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

    // The number's TeXML app takes SIP calls from the account's own connections, and still points at the engine.
    const app = telnyx.texmlApps.get(texmlAppId) as { inbound: Record<string, string>; voice_url: string };
    const sig = createHmac('sha256', E2E_VOICE_ENGINE_SECRET).update(`number|${numberId}`).digest('hex').slice(0, 32);
    expect(app.voice_url).toBe(`${E2E_VOICE_ENGINE_URL}/texml?n=${numberId}&sig=${sig}`);
    expect(app.inbound.sip_subdomain_receive_settings).toBe('only_my_connections');
    await expect(dialog.getByTestId('softphone-dial-in')).toHaveText(
        `sip:frontdesk@${app.inbound.sip_subdomain}.sip.telnyx.com`,
    );

    // Nothing secret is stored: the password lives only in Telnyx and on screen once.
    const account = await db.getVoiceAccount(E2E_USER);
    expect(account?.softphone).toMatchObject({ userName, connectionId: connection.id });
    expect(JSON.stringify(account?.softphone)).not.toContain(password);
    expect((await db.getVoiceNumbers(E2E_USER))[0].sipSubdomain).toBe(app.inbound.sip_subdomain);

    // Signed in, then opened again: the password is not shown twice, the subdomain is not set twice.
    telnyx.registered.add(userName);
    await dialog.getByRole('button', { name: 'Check again' }).click();
    await expect(dialog.getByTestId('softphone-status')).toContainText('Signed in');
    await page.keyboard.press('Escape');
    const patches = telnyx.find('PATCH', /^\/v2\/texml_applications\//).length;
    const reopened = await openSoftphone(page, agentId);
    await expect(reopened.getByTestId('softphone-dial-in')).toBeVisible();
    await expect(reopened.getByTestId('softphone-password')).toHaveCount(0);
    expect(telnyx.find('PATCH', /^\/v2\/texml_applications\//)).toHaveLength(patches);

    await reopened.getByRole('button', { name: 'Reset password' }).click();
    await expect(reopened.getByTestId('softphone-password')).toBeVisible();
    expect(await reopened.getByTestId('softphone-password').innerText()).not.toBe(password);
    expect(connection.password).toBe(await reopened.getByTestId('softphone-password').innerText());

    await reopened.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('dialog', { name: 'Remove the softphone?' }).getByRole('button', { name: 'Remove' }).click();
    await expect(reopened.getByRole('button', { name: 'Set up softphone' })).toBeVisible();
    expect(connection.sip_uri_calling_preference).toBe('disabled');
    expect((await db.getVoiceAccount(E2E_USER))?.softphone).toBeNull();
});

test('outbound: the agent calls the signed-in softphone through the test-call path', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Caller', callType: VoiceAgentCallType.OUTBOUND });
    const numberId = await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: NUMBER,
        providerNumberId: '1293384261075731499',
        apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
    });
    await db.setVoiceNumberAgents(numberId, { outboundAgentId: agentId });

    const dialog = await openSoftphone(page, agentId);
    await dialog.getByRole('button', { name: 'Set up softphone' }).click();
    const userName = await dialog.getByTestId('softphone-username').innerText();
    const call = dialog.getByRole('button', { name: 'Call my softphone' });
    await expect(call).toBeDisabled();

    telnyx.registered.add(userName);
    await dialog.getByRole('button', { name: 'Check again' }).click();
    await call.click();
    await expect(dialog.getByRole('status')).toContainText(`Caller is calling your softphone from ${NUMBER}`);
    expect(engine.find('POST', '/calls').map((r) => r.body)).toEqual([
        { numberId, to: `sip:${userName}@sip.telnyx.com`, agentId },
    ]);
});

test('call logs: a softphone call says so', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Front Desk', callType: VoiceAgentCallType.INBOUND });
    const now = new Date();
    await db.insertVoiceCalls(E2E_USER, [
        {
            agentId: new ObjectId(agentId),
            channel: VoiceCallChannel.PHONE,
            direction: VoiceCallDirection.INBOUND,
            from: 'sip:aixel0123abcd@sip.telnyx.com',
            to: NUMBER,
            voice: 'sulafat',
            startedAt: now,
            endedAt: now,
            durationSec: 30,
            endedBy: 'caller_hung_up',
            flags: [],
            turns: [],
            gapsMs: [],
        },
    ]);
    await page.goto(CALL_LOGS_URL);
    const card = page.getByTestId('call-card');
    await expect(card).toContainText('Softphone test');
    await expect(card).toContainText('Softphone');
    await expect(card).not.toContainText('aixel0123abcd');
});
