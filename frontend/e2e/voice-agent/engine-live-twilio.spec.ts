import { createHmac } from 'node:crypto';
import { VoiceAgentCallType, VoiceCallDirection, VoiceProvider } from '@aixellabs/backend/db/types';
import { voiceCallRecordingApiRoute } from '@/config/app-config';
import { expect, test } from '../support/fixtures';
import { E2E_VOICE_ENGINE_SECRET, E2E_VOICE_ENGINE_URL, USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import {
    CALL_LOGS_URL,
    FAKE_TWILIO_ACCOUNT_SID,
    FAKE_TWILIO_KEY_SECRET,
    FAKE_TWILIO_KEY_SID,
    FakeTwilio,
    FakeTwilioMediaStream,
    makeTestWav,
    sealForE2e,
} from './fake-telephony';

/**
 * A call into a customer's Twilio number against the REAL voice engine and model, with this spec
 * playing Twilio: it fetches the number's TwiML from the engine, opens the media stream the TwiML
 * names, and checks she greets the caller, the call is logged, recorded in "their" (fake) Twilio
 * account, and its recording plays in Call logs. Skipped unless `VOICE_E2E_ENGINE=1`:
 *
 *   cd backend/voice && MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsE2E \
 *     TWILIO_API_BASE=http://127.0.0.1:7865 .venv/bin/python phone.py --port 7862
 *   VOICE_E2E_ENGINE=1 E2E_VOICE_ENGINE_SECRET=<the engine's VOICELAB_KEY> E2E_GEMINI_API_KEY=<a real Gemini key> \
 *     pnpm --filter frontend exec playwright test --workers=1 e2e/voice-agent/engine-live-twilio.spec.ts
 */
test.skip(process.env.VOICE_E2E_ENGINE !== '1', 'needs the real voice engine on the e2e port');

const NUMBER = '+14155550101';
const CALLER = '+14155550177';

let twilio: FakeTwilio;

test.use({ storageState: USER_STORAGE_STATE });

test.beforeAll(async () => {
    twilio = await FakeTwilio.start();
});

test.afterAll(async () => {
    await twilio?.stop();
});

test.beforeEach(async ({ db }) => {
    twilio.reset();
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
});

test('a call into a Twilio number: TwiML, the media stream, her greeting, the log and the recording', async ({ page, db }) => {
    test.setTimeout(120_000);
    const agentId = await db.insertVoiceAgent(E2E_USER, {
        name: 'Twilio desk',
        voice: 'kore',
        callType: VoiceAgentCallType.INBOUND,
        prompt: 'You are Maya, the receptionist at Sunrise Dental. Keep every reply to one short sentence.',
        callNotes: 'Open by saying thanks for calling Sunrise Dental.',
    });
    const numberId = await db.insertVoiceNumber(E2E_USER, {
        provider: VoiceProvider.TWILIO,
        phoneNumber: NUMBER,
        providerNumberId: `PN${'0'.repeat(29)}101`,
        apiKeySealed: sealForE2e(FAKE_TWILIO_KEY_SECRET),
        twilio: { accountSid: FAKE_TWILIO_ACCOUNT_SID, apiKeySid: FAKE_TWILIO_KEY_SID },
    });
    await db.setVoiceNumberAgents(numberId, { inboundAgentId: agentId });

    // Twilio fetches the number's Voice URL (what the app set) when the call comes in.
    const sig = createHmac('sha256', E2E_VOICE_ENGINE_SECRET).update(`number|${numberId}`).digest('hex').slice(0, 32);
    const callSid = `CA${'5'.repeat(32)}`;
    const twimlRes = await fetch(`${E2E_VOICE_ENGINE_URL}/twiml?n=${numberId}&sig=${sig}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ CallSid: callSid, AccountSid: FAKE_TWILIO_ACCOUNT_SID, From: CALLER, To: NUMBER, Direction: 'inbound' }),
    });
    expect(twimlRes.status).toBe(200);
    const twiml = await twimlRes.text();
    expect(twiml).toMatch(/<Connect>\s*<Stream url="wss:\/\/[^"]+\/twilio">/);
    const params = Object.fromEntries([...twiml.matchAll(/<Parameter name="([^"]+)" value="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    expect(params).toMatchObject({ n: numberId, dir: 'in', callee: CALLER });

    const stream = await FakeTwilioMediaStream.open(E2E_VOICE_ENGINE_URL, callSid, params);
    // Her greeting was made while it rang: it comes the moment the stream starts.
    await expect.poll(() => stream.firstAudioMs, { timeout: 10_000 }).not.toBeNull();
    expect(stream.firstAudioMs).toBeLessThan(2000);
    await expect.poll(() => stream.audioBytes, { timeout: 15_000 }).toBeGreaterThan(8000 * 1.5);
    await page.waitForTimeout(3000);
    expect(stream.allCarryStreamSid()).toBe(true);
    await stream.stop();

    await expect.poll(async () => (await db.getVoiceCalls(E2E_USER)).length, { timeout: 15_000 }).toBe(1);
    const [call] = await db.getVoiceCalls(E2E_USER);
    expect(call).toMatchObject({ direction: VoiceCallDirection.INBOUND, from: CALLER, to: NUMBER, providerCallId: callSid });
    expect(call.agentId.toString()).toBe(agentId);
    expect(call.turns.some((t) => t.role === 'agent' && /sunrise/i.test(t.text))).toBe(true);

    // The engine asked "their" Twilio account to record the call, both sides, as the API key.
    const recordingStart = twilio.find('POST', `/2010-04-01/Accounts/${FAKE_TWILIO_ACCOUNT_SID}/Calls/${callSid}/Recordings.json`);
    expect(recordingStart).toHaveLength(1);
    expect(recordingStart[0].body).toEqual({ RecordingChannels: 'dual', RecordingTrack: 'both' });
    expect(recordingStart[0].authorization).toBe(
        `Basic ${Buffer.from(`${FAKE_TWILIO_KEY_SID}:${FAKE_TWILIO_KEY_SECRET}`).toString('base64')}`,
    );

    // Once Twilio has the recording, Call logs plays it through the app.
    twilio.addRecording(callSid, makeTestWav(2), 2);
    await page.goto(`${CALL_LOGS_URL}/${call._id.toString()}`);
    await expect(page.getByText('Stored in your Twilio account')).toBeVisible();
    const audio = await page.request.get(voiceCallRecordingApiRoute(call._id.toString()));
    expect(audio.status()).toBe(200);
});
