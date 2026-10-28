import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ObjectId } from 'mongodb';
import type { Page } from '@playwright/test';
import { VoiceAgentCallType, VoiceAgentChannel, VoiceCallChannel, VoiceProvider } from '@aixellabs/backend/db/types';
import { WHATSAPP_URL } from '@/helpers/voice-routes';
import { expect, test } from '../support/fixtures';
import type { E2eDb } from '../support/db';
import { USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import { FAKE_MIC_LAUNCH_ARGS, voiceAgentUrl, waitForHydration } from '../support/voice-agents';
import {
    FAKE_META_APP_ID,
    FAKE_META_APP_SECRET,
    FAKE_META_TOKEN,
    FAKE_WABA_ID,
    FAKE_WHATSAPP_NUMBER,
    FakeMeta,
    sealForE2e,
} from './fake-telephony';

/**
 * WhatsApp against the REAL voice engine and the real model, with Meta replaced by FakeMeta: the app connects the
 * number (Meta checks the engine's callback), then a person's messages, voice note and call arrive as webhooks signed
 * with the app secret, exactly as Meta sends them, and everything the engine sends back goes through the fake.
 * The person's phone in the call is this browser: its WebRTC offer is what Meta would relay, its fake microphone
 * plays VOICE_E2E_CALLER_WAV. Skipped unless `VOICE_E2E_ENGINE=1`:
 *
 *   cd backend/voice && MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsE2E VOICELAB_KEY=e2e-voice-engine-secret \
 *     WHATSAPP_GRAPH_BASE=http://127.0.0.1:7880 <a python with pipecat-ai[webrtc]> phone.py --port 7862
 *   VOICE_E2E_ENGINE=1 E2E_DEV=1 E2E_GEMINI_API_KEY=<a real Gemini key> VOICE_E2E_VOICE_NOTE=<an .ogg of someone asking
 *     for a cleaning> VOICE_E2E_CALLER_WAV=<a .wav of someone talking> pnpm exec playwright test e2e/voice-agent/engine-live-whatsapp.spec.ts
 */
test.skip(process.env.VOICE_E2E_ENGINE !== '1', 'needs the real voice engine on the e2e port');

const callerWav = process.env.VOICE_E2E_CALLER_WAV ?? '';
const voiceNote = process.env.VOICE_E2E_VOICE_NOTE ?? '';
/** The person, by WhatsApp id (digits, as Meta sends it). */
const PERSON = '919876543210';
const PROMPT =
    'You are Maya, the front desk of Sunrise Dental in Bengaluru. The clinic is open Monday to Saturday, 10 am to 2 pm, ' +
    'and does cleanings, fillings and whitening. Keep every reply to one or two short sentences.';

let meta: FakeMeta;

test.use({
    storageState: USER_STORAGE_STATE,
    permissions: ['microphone'],
    launchOptions: {
        args: [
            ...FAKE_MIC_LAUNCH_ARGS,
            // The engine must reach this browser's real address, as it reaches Meta's relay.
            '--disable-features=WebRtcHideLocalIpsWithMdns',
            ...(callerWav ? [`--use-file-for-fake-audio-capture=${path.resolve(callerWav)}`] : []),
        ],
    },
});

test.beforeAll(async () => {
    meta = await FakeMeta.start();
});

test.afterAll(async () => {
    await meta?.stop();
});

test.beforeEach(async ({ db }) => {
    meta.reset();
    // Meta checks the callback with the engine, and this business may call (its limit is 2,000+).
    meta.verifyCallbacks = true;
    meta.refuseCalling = false;
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
});

/** A WhatsApp agent with caller memory on its imported number, linked from its page: what turns the webhook on. */
async function setUpNumber(page: Page, db: E2eDb): Promise<{ agentId: string; numberId: string }> {
    const agentId = await db.insertVoiceAgent(E2E_USER, {
        name: 'Maya',
        callType: VoiceAgentCallType.INBOUND,
        channel: VoiceAgentChannel.WHATSAPP,
        voice: 'kore',
        prompt: PROMPT,
    });
    await db.updateVoiceAgent(agentId, { memory: true });
    const numberId = await db.insertVoiceNumber(E2E_USER, {
        provider: VoiceProvider.WHATSAPP,
        phoneNumber: FAKE_WHATSAPP_NUMBER.phone,
        providerNumberId: FAKE_WHATSAPP_NUMBER.id,
        apiKeySealed: sealForE2e(FAKE_META_TOKEN),
        whatsapp: { appId: FAKE_META_APP_ID, appSecretSealed: sealForE2e(FAKE_META_APP_SECRET), wabaId: FAKE_WABA_ID },
    });
    await page.goto(voiceAgentUrl(agentId));
    await waitForHydration(page, '#agent-prompt');
    const select = page.getByTestId('agent-whatsapp-numbers-select');
    await select.click();
    await page.getByRole('option', { name: /347/ }).click();
    // The engine answered Meta's challenge, so Meta saved the callback.
    await expect.poll(() => meta.subscription?.callback_url ?? '', { timeout: 20_000 }).toContain('/whatsapp?app=');
    await expect.poll(() => meta.calling.get(FAKE_WHATSAPP_NUMBER.id)?.status).toBe('ENABLED');
    return { agentId, numberId };
}

/** The person's open chat with the number, as the engine keeps it. */
async function openChat(db: E2eDb) {
    return (await db.getVoiceCalls(E2E_USER)).find((c) => c.channel === VoiceCallChannel.WHATSAPP && c.chat?.open);
}

test('chats: the AI answers texts and voice notes through Meta, a person takes over, and the chat becomes caller memory', async ({
    page,
    db,
}) => {
    test.setTimeout(5 * 60_000);
    test.skip(!voiceNote, 'needs VOICE_E2E_VOICE_NOTE');
    const { agentId } = await setUpNumber(page, db);

    // A text: read (blue ticks), answered by the model, kept as an open chat.
    const first = await meta.customerTexts(PERSON, 'Ravi', 'Hi! Are you open on Saturday?');
    await expect.poll(() => meta.sent.length, { timeout: 60_000 }).toBe(1);
    expect(meta.reads).toContain(first);
    expect(meta.sent[0]).toMatchObject({ to: PERSON, type: 'text' });
    const reply = meta.sent[0].text ?? '';
    expect(reply).toMatch(/saturday|10|2/i);
    let chat = await openChat(db);
    expect(chat?.turns.map((t) => t.role)).toEqual(['caller', 'agent']);
    expect(chat?.chat?.name).toBe('Ravi');
    expect(chat?.chat?.tokens.textIn).toBeGreaterThan(0);

    // A voice note: downloaded from Meta with the token, heard, answered with a voice note.
    await meta.customerSendsVoiceNote(PERSON, 'Ravi', readFileSync(voiceNote));
    await expect.poll(() => meta.sent.length, { timeout: 90_000 }).toBe(2);
    expect(meta.sent[1]).toMatchObject({ to: PERSON, type: 'audio', voice: true });
    expect(meta.find('GET', /^\/media-files\//).every((r) => r.authorization === `Bearer ${FAKE_META_TOKEN}`)).toBe(true);
    chat = await openChat(db);
    const heard = chat?.turns.at(-2);
    expect(heard).toMatchObject({ role: 'caller', voice: true });
    expect(heard?.text).toMatch(/clean/i);
    expect(chat?.turns.at(-1)).toMatchObject({ role: 'agent', voice: true });
    expect(chat?.chat?.voice?.sttSecs).toBeGreaterThan(0);
    expect(chat?.chat?.voice?.ttsSecs).toBeGreaterThan(0);

    // The inbox shows the conversation; a team member takes it over and the AI goes quiet.
    await page.goto(WHATSAPP_URL);
    await waitForHydration(page, '#header');
    await page.getByRole('button', { name: /Ravi/ }).click();
    // The inbox renders WhatsApp's *bold* / _italic_ / ~strike~, as the person's phone does.
    await expect(page.getByText(reply.replace(/[*_~]/g, '').slice(0, 40)).first()).toBeVisible();
    await page.getByRole('button', { name: 'Take over' }).click();
    await expect(page.getByRole('button', { name: 'Hand back to AI' })).toBeVisible();
    await meta.customerTexts(PERSON, 'Ravi', 'Also, how much is whitening?');
    await expect.poll(async () => (await openChat(db))?.turns.at(-1)?.text, { timeout: 20_000 }).toBe('Also, how much is whitening?');
    // Long enough for the model to have answered had it been asked.
    await page.waitForTimeout(8_000);
    expect(meta.sent).toHaveLength(2);
    const pane = page.getByRole('region', { name: 'Chat with Ravi' });
    await expect(pane.getByText('Also, how much is whitening?', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel('Message').fill('Hi Ravi, Priya here: whitening is ₹6,000 a session.');
    await page.getByLabel('Send').click();
    await expect.poll(() => meta.sent.length).toBe(3);
    expect(meta.sent[2]).toEqual({ to: PERSON, type: 'text', text: 'Hi Ravi, Priya here: whitening is ₹6,000 a session.' });
    // A voice note recorded in the inbox (the fake mic): the engine turns the browser's WebM into WhatsApp's OGG/Opus.
    await page.getByRole('button', { name: 'Record a voice note' }).click();
    await expect(page.getByText('Recording…')).toBeVisible();
    await page.waitForTimeout(2_500);
    await page.getByRole('button', { name: 'Send voice note' }).click();
    await expect.poll(() => meta.sent.length, { timeout: 30_000 }).toBe(4);
    expect(meta.sent[3]).toMatchObject({ to: PERSON, type: 'audio', voice: true });
    expect(meta.find('POST', /\/media$/).at(-1)?.body).toMatchObject({ multipart: true, ogg: true });
    expect((await openChat(db))?.turns.at(-1)).toMatchObject({ role: 'human', voice: true, text: expect.stringMatching(/^Voice note \(0:0\d\)$/) });

    // Handed back: the AI answers again.
    await page.getByRole('button', { name: 'Hand back to AI' }).click();
    await expect(page.getByRole('button', { name: 'Take over' })).toBeVisible();
    await meta.customerTexts(PERSON, 'Ravi', 'Great, please book the cleaning for Saturday at 11.');
    await expect.poll(() => meta.sent.length, { timeout: 60_000 }).toBe(5);
    expect(meta.sent[4].type).toBe('text');

    // The person goes quiet past the idle time: their next message closes the chat first (cost, analysis, memory),
    // then opens a new one that starts from what the agent remembers.
    const closing = await openChat(db);
    await db.ageVoiceChat(closing!._id.toString(), 16);
    await meta.customerTexts(PERSON, 'Ravi', 'Hi again! What did I ask you about last time?');
    await expect.poll(() => meta.sent.length, { timeout: 120_000 }).toBe(6);
    const calls = await db.getVoiceCalls(E2E_USER);
    const closed = calls.find((c) => c._id.equals(closing!._id));
    expect(closed?.chat?.open).toBe(false);
    expect(closed?.endedBy).toBe('chat_ended');
    expect(closed?.cost?.totalUsd).toBeGreaterThan(0);
    const memory = (closed as { memory?: { brief?: string; current?: boolean } } | undefined)?.memory;
    expect(memory?.current).toBe(true);
    expect(memory?.brief).toMatch(/clean|whiten|saturday/i);
    expect((await openChat(db))?.agentId.toString()).toBe(agentId);
    // The new chat's reply draws on that memory.
    expect.soft(meta.sent[5].text).toMatch(/clean|whiten|saturday/i);
    console.log('[whatsapp live] replies:', meta.sent.map((s) => s.text ?? `[${s.type}]`));
    console.log('[whatsapp live] memory:', memory?.brief);
});

/** The person's phone in the page: the call, and the loudest the agent's voice has been so far (RMS, 0..1). */
type PhoneWindow = { waPhone: RTCPeerConnection; waPeak: number };

test('a WhatsApp call: the engine answers the offer, the agent and the person hear each other, and the call is logged', async ({
    page,
    db,
}) => {
    test.setTimeout(3 * 60_000);
    test.skip(!callerWav, 'needs VOICE_E2E_CALLER_WAV');
    const { numberId } = await setUpNumber(page, db);

    // The person's phone: their microphone, and the offer WhatsApp would relay.
    const offer = await page.evaluate(async () => {
        const pc = new RTCPeerConnection();
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getTracks().forEach((track) => pc.addTrack(track, mic));
        const phone = window as unknown as PhoneWindow;
        phone.waPhone = pc;
        phone.waPeak = 0;
        // Played and measured as the person would hear it (Chrome decodes a remote track only once it plays).
        pc.ontrack = ({ streams: [stream] }) => {
            const speaker = new Audio();
            speaker.srcObject = stream;
            void speaker.play();
            const ctx = new AudioContext();
            const meter = ctx.createAnalyser();
            ctx.createMediaStreamSource(stream).connect(meter);
            const samples = new Float32Array(meter.fftSize);
            setInterval(() => {
                meter.getFloatTimeDomainData(samples);
                const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
                phone.waPeak = Math.max(phone.waPeak, rms);
            }, 50);
        };
        await pc.setLocalDescription(await pc.createOffer());
        await new Promise<void>((resolve) => {
            if (pc.iceGatheringState === 'complete') return resolve();
            pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && resolve();
            setTimeout(resolve, 3_000);
        });
        return pc.localDescription!.sdp;
    });
    const callId = await meta.customerCalls(PERSON, offer);

    // pre_accept then accept, both with the engine's answer (SHA-256 fingerprints only, as Meta takes).
    await expect.poll(() => meta.callActions.map((a) => a.action), { timeout: 30_000 }).toEqual(['pre_accept', 'accept']);
    const answer = meta.callActions[1].sdp ?? '';
    expect(answer).toContain('a=fingerprint:sha-256');
    expect(answer).not.toMatch(/a=fingerprint:sha-(384|512)/);
    await page.evaluate((sdp) => (window as unknown as PhoneWindow).waPhone.setRemoteDescription({ type: 'answer', sdp }), answer);
    await expect
        .poll(() => page.evaluate(() => (window as unknown as PhoneWindow).waPhone.connectionState), { timeout: 20_000 })
        .toBe('connected');

    // She speaks: her voice reaches the person's phone.
    await expect.poll(() => page.evaluate(() => (window as unknown as PhoneWindow).waPeak), { timeout: 30_000 }).toBeGreaterThan(0.01);

    // The person says their line (the wav, after 4 s of silence); she answers. Then they hang up.
    await page.waitForTimeout(25_000);
    await meta.customerHangsUp(callId, PERSON);
    await expect.poll(() => meta.callActions.some((a) => a.action === 'terminate'), { timeout: 20_000 }).toBe(true);

    await expect
        .poll(async () => (await db.getVoiceCalls(E2E_USER)).find((c) => c.numberId?.toString() === numberId && !c.chat), {
            timeout: 30_000,
        })
        .toBeTruthy();
    const call = (await db.getVoiceCalls(E2E_USER)).find((c) => c.numberId?.toString() === numberId && !c.chat)!;
    expect(call.callerPhone).toBe(`+${PERSON}`);
    expect(call.turns.some((t) => t.role === 'agent')).toBe(true);
    expect(call.turns.some((t) => t.role === 'caller' && /saturday|open/i.test(t.text))).toBe(true);
    console.log('[whatsapp live] call turns:', call.turns.map((t) => `${t.role}: ${t.text}`));

    // It is in the call log with its WhatsApp number.
    await page.goto('/voice-agent/call-logs');
    await waitForHydration(page, '#header');
    await expect(page.getByText('Maya').first()).toBeVisible();
    expect(new ObjectId(numberId).equals(call.numberId!)).toBe(true);
});
