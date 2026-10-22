import { readFile } from 'node:fs/promises';
import { ObjectId } from 'mongodb';
import { request as playwrightRequest, type Page } from '@playwright/test';
import {
    Modules,
    VOICE_AGENT_SUB_MODULES,
    VoiceCallChannel,
    VoiceCallDirection,
    VoiceProvider,
    type VoiceCallCost,
    type VoiceCallDoc,
} from '@aixellabs/backend/db/types';
import { expect, LOCAL_FETCH, test } from '../support/fixtures';
import { voiceCallRecordingApiRoute } from '@/config/app-config';
import { E2E_BASE_URL, E2E_TELNYX_API_BASE, USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_ADMIN, E2E_USER } from '../support/users';
import {
    CALL_LOGS_URL,
    FAKE_TELNYX_KEY,
    FAKE_VOICELINK_TOKEN,
    FakeTelnyx,
    makeTestWav,
    sealForE2e,
} from './fake-telephony';

type SeedCall = Omit<VoiceCallDoc, '_id' | 'tenantId' | 'userId'>;

const RECORDING_URL = `${E2E_TELNYX_API_BASE}/download/e2e-recording.mp3`;
const MINUTE = 60_000;

function call(fields: Partial<SeedCall> & Pick<SeedCall, 'agentId' | 'startedAt'>): SeedCall {
    const durationSec = fields.durationSec ?? 30;
    return {
        channel: VoiceCallChannel.PHONE,
        direction: VoiceCallDirection.OUTBOUND,
        voice: 'sulafat',
        endedAt: new Date(fields.startedAt.getTime() + durationSec * 1000),
        durationSec,
        endedBy: 'caller_hung_up',
        flags: [],
        turns: [],
        gapsMs: [],
        ...fields,
    };
}

/** `provider: undefined` seeds a call with no phone provider (playground). */
function cost(geminiUsd: number, providerUsd: number, fields: Partial<VoiceCallCost> = {}): VoiceCallCost {
    const seeded: VoiceCallCost = {
        totalUsd: geminiUsd + providerUsd,
        geminiUsd,
        geminiFreeTier: false,
        geminiTokens: { textIn: 13432, audioIn: 1745, textOut: 546, audioOut: 467 },
        provider: VoiceProvider.TELNYX,
        providerUsd,
        providerExact: false,
        ...fields,
    };
    if (!seeded.provider) delete seeded.provider;
    return seeded;
}

async function openCallLogs(page: Page, query = ''): Promise<void> {
    await page.goto(`${CALL_LOGS_URL}${query}`);
    await waitForHydration(page, '#header');
}

let telnyx: FakeTelnyx;

test.use({ storageState: USER_STORAGE_STATE });

test.beforeAll(async () => {
    telnyx = await FakeTelnyx.start();
});

test.afterAll(async () => {
    await telnyx?.stop();
});

test.describe('with seeded calls', () => {
    let outboundId: string;
    let inboundId: string;
    let playgroundId: string;
    let salesId: string;
    let frontDeskId: string;

    test.beforeEach(async ({ db }) => {
        telnyx.reset();
        await db.resetUser(E2E_USER);
        await db.resetVoiceAgents(E2E_USER);
        await db.resetVoiceTelephony(E2E_USER);

        frontDeskId = await db.insertVoiceAgent(E2E_USER, { name: 'Front desk' });
        salesId = await db.insertVoiceAgent(E2E_USER, { name: 'Sales' });
        const numberId = await db.insertVoiceNumber(E2E_USER, {
            phoneNumber: '+13473703925',
            providerNumberId: '1293384261075731499',
            apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
            texmlAppId: 'texml-1',
            callControlAppId: 'cc-1',
        });
        const now = Date.now();

        [outboundId, inboundId, , playgroundId] = await db.insertVoiceCalls(E2E_USER, [
            call({
                agentId: new ObjectId(salesId),
                numberId: new ObjectId(numberId),
                from: '+13473703925',
                to: '+14155550123',
                startedAt: new Date(now - 5 * MINUTE),
                durationSec: 95,
                endedBy: 'goodbye',
                providerCallId: 'v3:e2e-recorded-call',
                flags: [{ flag: 'callback_requested', quote: 'Call me back tomorrow after ten.' }],
                turns: [
                    { role: 'agent', text: 'Hi, this is Maya from Aixel Labs. Is this the front desk?' },
                    // One utterance logged as two fragments: shown as one bubble.
                    { role: 'caller', text: 'Yes,' },
                    { role: 'caller', text: 'who is calling?' },
                    { role: 'agent', text: 'I help clinics answer every call. Do you have a minute?' },
                    { role: 'caller', text: 'Not now. Call me back tomorrow after ten.' },
                    { role: 'agent', text: 'Of course. Tomorrow after ten it is. Goodbye!' },
                ],
                gapsMs: [600, 800],
                cost: cost(0.025, 0.02),
            }),
            call({
                agentId: new ObjectId(frontDeskId),
                numberId: new ObjectId(numberId),
                direction: VoiceCallDirection.INBOUND,
                from: '+12125550199',
                to: '+13473703925',
                startedAt: new Date(now - 60 * MINUTE),
                durationSec: 42,
                turns: [
                    { role: 'agent', text: 'Thanks for calling, how can I help?' },
                    { role: 'caller', text: 'What are your hours?' },
                    { role: 'agent', text: 'We are open nine to six.' },
                ],
                gapsMs: [1200, 2400],
                cost: cost(0.014, 0.007, { provider: VoiceProvider.TWILIO, providerExact: true }),
            }),
            call({
                agentId: new ObjectId(salesId),
                numberId: new ObjectId(numberId),
                from: '+13473703925',
                to: '+14155550188',
                startedAt: new Date(now - 90 * MINUTE),
                durationSec: 0,
                endedBy: 'no_answer',
            }),
            call({
                agentId: new ObjectId(frontDeskId),
                channel: VoiceCallChannel.PLAYGROUND,
                direction: VoiceCallDirection.PLAYGROUND,
                startedAt: new Date(now - 120 * MINUTE),
                durationSec: 12,
                cost: cost(0, 0, { geminiFreeTier: true, provider: undefined }),
            }),
        ]);
    });

    test('lists calls newest first with their key facts', async ({ page }) => {
        await openCallLogs(page);
        const cards = page.getByTestId('call-card');
        await expect(cards).toHaveCount(4);

        await expect(cards.nth(0)).toContainText('Sales');
        await expect(cards.nth(0)).toContainText('Outbound');
        await expect(cards.nth(0)).toContainText('+13473703925');
        await expect(cards.nth(0)).toContainText('+14155550123');
        await expect(cards.nth(0)).toContainText('1:35 long');
        await expect(cards.nth(0)).toContainText('Said goodbye');
        await expect(cards.nth(0)).toContainText('answers in 700 ms');

        await expect(cards.nth(1)).toContainText('Front desk');
        await expect(cards.nth(1)).toContainText('Inbound');
        await expect(cards.nth(1)).toContainText('0:42 long');
        await expect(cards.nth(1)).toContainText('Caller hung up');
        await expect(cards.nth(1)).toContainText('answers in 1.8 s');

        await expect(cards.nth(2)).toContainText('No answer');
        await expect(cards.nth(2)).toContainText('0:00 long');

        await expect(cards.nth(3)).toContainText('Playground');
        await expect(cards.nth(3)).toContainText('Browser');
    });

    test('shows what each call and each agent cost', async ({ page }) => {
        await openCallLogs(page);
        const cards = page.getByTestId('call-card');
        // Total, " est." while the phone part is the list-rate estimate, and per minute of talk.
        await expect(cards.nth(0).getByTestId('call-cost')).toHaveText('$0.045 est.');
        await expect(cards.nth(0)).toContainText('$0.028/min');
        await expect(cards.nth(1).getByTestId('call-cost')).toHaveText('$0.021');
        await expect(cards.nth(1)).toContainText('$0.030/min');
        await expect(cards.nth(2)).not.toContainText('$');
        await expect(cards.nth(3).getByTestId('call-cost')).toHaveText('$0.000');

        // Every agent added up: 3 priced calls, 2:29 of talk.
        const summary = page.getByTestId('call-cost-summary');
        // Every listed call is counted; the cost is over the ones that have one.
        await expect(summary).toContainText('Calls4 · 2:29 talking');
        await expect(summary).toContainText('Cost of 3 priced calls$0.066 est.');
        await expect(summary).toContainText('Average per minute$0.027');
        await expect(summary).toContainText('Gemini · Phone$0.039 · $0.027');

        await openCallLogs(page, `?agent=${salesId}`);
        await expect(summary).toContainText('Calls2 · 1:35 talking');
        await expect(summary).toContainText('Cost of 1 priced call$0.045 est.');
        await expect(summary).toContainText('Average per minute$0.028');
        // Every listed call priced: the label names the agent.
        await openCallLogs(page, `?agent=${frontDeskId}`);
        await expect(summary).toContainText('Front desk’s calls cost$0.021');

        await page.goto(`${CALL_LOGS_URL}/${outboundId}`);
        await expect(page.getByTestId('call-cost')).toHaveText('$0.045 est.');
        await expect(page.getByTestId('call-cost-per-minute')).toHaveText('$0.028/min');
        await expect(page.getByTestId('call-cost-breakdown')).toHaveText('Gemini $0.025 · Telnyx $0.020 (estimate)');
        await page.goto(`${CALL_LOGS_URL}/${playgroundId}`);
        await expect(page.getByTestId('call-cost-breakdown')).toHaveText('Gemini free (free-tier key)');
    });

    test('costs show in the currency the owner picks, at today’s rate', async ({ page, context }) => {
        await openCallLogs(page);
        const firstCost = page.getByTestId('call-card').first().getByTestId('call-cost');
        await expect(firstCost).toHaveText('$0.045 est.');
        await page.getByRole('combobox', { name: 'Currency' }).click();
        await page.getByRole('option', { name: 'INR', exact: true }).click();
        await expect(firstCost).toHaveText(/^₹\d\.\d{1,3} est\.$/);
        // Kept for this browser; the call detail says what it is in dollars.
        expect((await context.cookies()).find((c) => c.name === 'voice-currency')?.value).toBe('INR');
        await page.goto(`${CALL_LOGS_URL}/${outboundId}`);
        await expect(page.getByTestId('call-cost-breakdown')).toContainText('$0.045 in all');
        await context.clearCookies({ name: 'voice-currency' });
    });

    test('filters by agent through the URL', async ({ page }) => {
        await openCallLogs(page);
        await page.getByRole('combobox', { name: 'Agent' }).click();
        await page.getByRole('option', { name: 'Sales', exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`\\?agent=${salesId}$`));
        await expect(page.getByTestId('call-card')).toHaveCount(2);
        await expect(page.getByTestId('call-card').filter({ hasText: 'Front desk' })).toHaveCount(0);

        await page.getByRole('combobox', { name: 'Agent' }).click();
        await page.getByRole('option', { name: 'All agents' }).click();
        await expect(page.getByTestId('call-card')).toHaveCount(4);
    });

    test('calls of deleted agents show only when asked, with every cost part', async ({ page, db }) => {
        const [deletedCallId] = await db.insertVoiceCalls(E2E_USER, [
            call({
                agentId: new ObjectId(),
                from: '+13473703925',
                to: '+14155550142',
                startedAt: new Date(Date.now() - 3 * MINUTE),
                endedBy: 'goodbye',
                cost: cost(0.01, 0.02, { analysisUsd: 0.001, totalUsd: 0.031 }),
            }),
        ]);
        await openCallLogs(page);
        const cards = page.getByTestId('call-card');
        await expect(cards).toHaveCount(4);
        await expect(cards.filter({ hasText: 'Deleted agent' })).toHaveCount(0);

        await page.getByRole('switch', { name: 'Include deleted agents' }).click();
        await expect(page).toHaveURL(/\?deleted=1$/);
        await expect(cards).toHaveCount(5);
        await expect(cards.nth(0)).toContainText('Deleted agent');
        await expect(page.getByTestId('call-cost-summary')).toContainText('Gemini · Phone · Call analysis');

        await page.goto(`${CALL_LOGS_URL}/${deletedCallId}`);
        await expect(page.getByTestId('call-cost-breakdown')).toHaveText(
            'Gemini $0.010 · Telnyx $0.020 (estimate) · Call analysis $0.001',
        );
    });

    test('a call shows its transcript, per-turn gaps, flags and the recording', async ({ page }) => {
        telnyx.recordings.set('v3:e2e-recorded-call', [
            {
                id: 'rec-1',
                record_type: 'recording',
                call_control_id: 'v3:e2e-recorded-call',
                status: 'completed',
                duration_millis: 95_000,
                download_urls: { mp3: RECORDING_URL, wav: RECORDING_URL.replace('.mp3', '.wav') },
            },
        ]);
        await openCallLogs(page);
        await page.getByTestId('call-card').first().click();
        await expect(page).toHaveURL(`${CALL_LOGS_URL}/${outboundId}`);
        await expect(page.locator('#header')).toContainText('Call with Sales');

        const turns = page.getByTestId('transcript-turn');
        await expect(turns).toHaveCount(5);
        await expect(turns.nth(0)).toHaveAttribute('data-role', 'agent');
        await expect(turns.nth(1)).toHaveAttribute('data-role', 'caller');
        await expect(turns.nth(1)).toContainText('Yes, who is calling?');
        // Gaps belong to the agent replies that answer the caller: turns 3 and 5.
        await expect(turns.nth(0).getByTestId('turn-gap')).toHaveCount(0);
        await expect(turns.nth(2).getByTestId('turn-gap')).toHaveText('600 ms');
        await expect(turns.nth(4).getByTestId('turn-gap')).toHaveText('800 ms');

        const flags = page.getByRole('list', { name: 'Flags' });
        await expect(flags).toContainText('callback requested');
        await expect(flags).toContainText('Call me back tomorrow after ten.');

        // The player never holds Telnyx's expiring link: it streams through the app.
        await expect(page.getByLabel('Call recording')).toHaveAttribute('src', voiceCallRecordingApiRoute(outboundId));
        await expect(page.getByRole('link', { name: 'Download MP3' })).toHaveAttribute(
            'href',
            voiceCallRecordingApiRoute(outboundId, true),
        );
        const [lookup] = telnyx.find('GET', '/v2/recordings');
        expect(lookup.query).toEqual({ 'filter[call_control_id]': 'v3:e2e-recorded-call' });
        expect(lookup.authorization).toBe(`Bearer ${FAKE_TELNYX_KEY}`);
    });

    test('calls without a recording say why', async ({ page }) => {
        await page.goto(`${CALL_LOGS_URL}/${inboundId}`);
        await expect(page.getByTestId('no-recording')).toContainText('no phone-provider call id');
        await expect(page.getByTestId('transcript-turn').nth(2).getByTestId('turn-gap')).toHaveText('1.2 s');

        await page.goto(`${CALL_LOGS_URL}/${playgroundId}`);
        await expect(page.getByTestId('no-recording')).toContainText('Playground calls are not recorded.');
        await expect(page.getByText('Nobody spoke on this call.')).toBeVisible();
        expect(telnyx.find('GET', '/v2/recordings')).toHaveLength(0);
    });

    test('Telnyx having no recording is said plainly', async ({ page }) => {
        await page.goto(`${CALL_LOGS_URL}/${outboundId}`);
        await expect(page.getByTestId('no-recording')).toContainText('Telnyx has no recording for this call.');
    });

    test('the recording loads, plays, seeks and downloads through the app', LOCAL_FETCH, async ({ page }) => {
        const wav = makeTestWav(3);
        const fileUrl = telnyx.addRecordingFile('e2e-recorded-call.wav', wav);
        telnyx.recordings.set('v3:e2e-recorded-call', [
            {
                id: 'rec-wav',
                record_type: 'recording',
                call_control_id: 'v3:e2e-recorded-call',
                status: 'completed',
                duration_millis: 3_000,
                download_urls: { wav: fileUrl },
            },
        ]);
        await page.goto(`${CALL_LOGS_URL}/${outboundId}`);
        const audio = page.getByLabel('Call recording');
        await expect(audio).toHaveAttribute('src', voiceCallRecordingApiRoute(outboundId));

        // Length known, seekable, and it actually plays from where it was sought to.
        await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.duration), { timeout: 20_000 }).toBeCloseTo(3, 1);
        const played = await audio.evaluate(async (el: HTMLAudioElement) => {
            const seekable = el.seekable.length ? el.seekable.end(0) : 0;
            el.muted = true;
            await new Promise<void>((resolve) => {
                el.addEventListener('seeked', () => resolve(), { once: true });
                el.currentTime = 2;
            });
            const sought = el.currentTime;
            await el.play();
            await new Promise((resolve) => setTimeout(resolve, 400));
            const at = el.currentTime;
            el.pause();
            return { seekable, sought, at };
        });
        expect(played.seekable).toBeCloseTo(3, 1);
        expect(played.sought).toBeCloseTo(2, 1);
        expect(played.at).toBeGreaterThan(2.1);
        // The seek reached Telnyx's file as a Range request.
        expect(telnyx.find('GET', '/download/e2e-recorded-call.wav').some((r) => r.range?.startsWith('bytes='))).toBe(true);

        // The route answers Range itself with the right type.
        const part = await page.request.get(voiceCallRecordingApiRoute(outboundId), { headers: { Range: 'bytes=0-43' } });
        expect(part.status()).toBe(206);
        expect(part.headers()['content-type']).toBe('audio/wav');
        expect(part.headers()['content-range']).toBe(`bytes 0-43/${wav.length}`);
        expect((await part.body()).subarray(0, 4).toString('ascii')).toBe('RIFF');

        // Download saves the file, named after the call, instead of opening a tab.
        const date = (await page.locator('time').first().getAttribute('datetime'))?.slice(0, 10);
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.getByRole('link', { name: 'Download WAV' }).click(),
        ]);
        expect(download.suggestedFilename()).toBe(`call-${date}-sales.wav`);
        const saved = await download.path();
        const bytes = await readFile(saved);
        expect(bytes.length).toBe(wav.length);
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
        expect(bytes.subarray(8, 12).toString('ascii')).toBe('WAVE');

        // Without the session there is nothing to fetch.
        const signedOut = await playwrightRequest.newContext({
            baseURL: E2E_BASE_URL,
            storageState: { cookies: [], origins: [] },
        });
        try {
            expect((await signedOut.get(voiceCallRecordingApiRoute(outboundId))).status()).toBe(401);
        } finally {
            await signedOut.dispose();
        }
    });

    test('tools the agent used show inline in the transcript where they ran', async ({ page, db }) => {
        const [toolCallId] = await db.insertVoiceCalls(E2E_USER, [
            call({
                agentId: new ObjectId(salesId),
                startedAt: new Date(Date.now() - 2 * MINUTE),
                from: '+13473703925',
                to: '+14155550123',
                turns: [
                    { role: 'agent', text: 'Hi, how can I help?' },
                    { role: 'caller', text: 'Can I book Saturday?' },
                    { role: 'agent', text: 'Saturday at two is free. Shall I book it?' },
                    { role: 'caller', text: 'Yes, I am Ravi.' },
                    { role: 'agent', text: 'Done, see you then.' },
                ],
                toolCalls: [
                    {
                        name: 'check_availability',
                        arguments: { date: '2026-10-17' },
                        result: 'Free on Saturday 17 October: 2:00 PM, 2:30 PM.',
                        ok: true,
                        afterTurn: 2,
                        durationMs: 12,
                    },
                    {
                        name: 'book_appointment',
                        arguments: { date: '2026-10-17', time: '14:00', name: 'Ravi' },
                        result: 'Booked.',
                        ok: true,
                        afterTurn: 4,
                        durationMs: 30,
                        bookingId: new ObjectId().toString(),
                    },
                    {
                        name: 'crm_lookup',
                        arguments: { phone: '+14155550123' },
                        result: 'The tool failed: HTTP 500',
                        ok: false,
                        afterTurn: 4,
                        durationMs: 8000,
                    },
                ],
            }),
        ]);
        await page.goto(`${CALL_LOGS_URL}/${toolCallId}`);
        const transcript = page.getByRole('list', { name: 'Transcript' });
        const items = transcript.locator(':scope > li');
        // agent, caller, [check], agent, caller, [book, crm], agent
        await expect(items).toHaveCount(7);
        await expect(items.nth(2).getByTestId('tool-call')).toHaveText(/Checked availability · Sat 17 Oct/);
        const tools = items.nth(5).getByTestId('tool-call');
        await expect(tools).toHaveCount(2);
        await expect(tools.nth(0)).toContainText('Booked Sat 17 Oct, 2:00 PM for Ravi');
        await expect(tools.nth(0).getByTestId('tool-call-booking-link')).toHaveAttribute('href', /\/voice-agent\/bookings#booking-/);
        await expect(tools.nth(1)).toContainText('crm_lookup');
        await expect(tools.nth(1).getByTestId('tool-call-status')).toHaveText('Failed');

        // Collapsed by default; opens to what was sent and what came back.
        await expect(tools.nth(1).getByText('The tool failed: HTTP 500')).toBeHidden();
        await tools.nth(1).locator('summary').click();
        await expect(tools.nth(1).getByText('The tool failed: HTTP 500')).toBeVisible();
        await expect(tools.nth(1)).toContainText('"phone": "+14155550123"');
        await expect(page.getByText('5 turns, 3 tools used.', { exact: false })).toBeVisible();
    });

    test('a user granted only Call logs can open a call', async ({ page, db }) => {
        await db.resetUser(E2E_USER, { moduleAccess: { [Modules.VOICE_AGENT]: [VOICE_AGENT_SUB_MODULES.CALL_LOGS] } });
        await page.goto(`${CALL_LOGS_URL}/${inboundId}`);
        await expect(page.getByTestId('transcript-turn')).toHaveCount(3);
    });
});

test('a VoiceLink call plays the recording link VoiceLink sent, and says plainly when it has not arrived', async ({
    page,
    db,
}) => {
    telnyx.reset();
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Front desk' });
    const numberId = await db.insertVoiceNumber(E2E_USER, {
        provider: VoiceProvider.VOICELINK,
        phoneNumber: '+919484950416',
        providerNumberId: '501',
        apiKeySealed: sealForE2e(FAKE_VOICELINK_TOKEN),
        voicelink: { clientId: null, botId: 701, routingId: 9001 },
    });
    const recordingUrl = 'https://recordings.voicelink.example/2026/10/16/e2e-call.wav';
    const now = Date.now();
    const [recordedId, pendingId] = await db.insertVoiceCalls(E2E_USER, [
        call({
            agentId: new ObjectId(agentId),
            numberId: new ObjectId(numberId),
            direction: VoiceCallDirection.INBOUND,
            from: '+919876543210',
            to: '+919484950416',
            startedAt: new Date(now - 10 * MINUTE),
            durationSec: 64,
            providerCallId: 'vl-call-sid-1',
            recordingUrl,
            turns: [{ role: 'agent', text: 'Namaste, how can I help?' }],
        }),
        call({
            agentId: new ObjectId(agentId),
            numberId: new ObjectId(numberId),
            direction: VoiceCallDirection.INBOUND,
            from: '+919876543211',
            to: '+919484950416',
            startedAt: new Date(now - 5 * MINUTE),
            providerCallId: 'vl-call-sid-2',
        }),
    ]);

    await page.goto(`${CALL_LOGS_URL}/${recordedId}`);
    await expect(page.getByLabel('Call recording')).toHaveAttribute('src', voiceCallRecordingApiRoute(recordedId));
    await expect(page.getByText('Download WAV')).toBeVisible();
    await expect(page.getByText('Stored in your VoiceLink account')).toBeVisible();

    await page.goto(`${CALL_LOGS_URL}/${pendingId}`);
    await expect(page.getByTestId('no-recording')).toContainText('VoiceLink has not sent the recording for this call yet');
    // Neither call asks Telnyx.
    expect(telnyx.find('GET', '/v2/recordings')).toHaveLength(0);
});

// `notFound()` under `withPageHandler` lands in its error boundary ("No data found."), the same as
// the lead-list and agent pages; what matters is that nothing of the call is shown.
test('someone else’s call is not shown', async ({ page, db }) => {
    await db.resetUser(E2E_USER);
    const adminAgent = await db.insertVoiceAgent(E2E_ADMIN, { name: 'Admin agent' });
    const [adminCall] = await db.insertVoiceCalls(E2E_ADMIN, [
        call({ agentId: new ObjectId(adminAgent), startedAt: new Date(), from: '+13470000000', to: '+13470000001' }),
    ]);
    try {
        await page.goto(`${CALL_LOGS_URL}/${adminCall}`);
        await expect(page.getByText('No data found.')).toBeVisible();
        await expect(page.getByText('Admin agent')).toHaveCount(0);
        await expect(page.getByText('+13470000000')).toHaveCount(0);
    } finally {
        await db.resetVoiceTelephony(E2E_ADMIN);
        await db.resetVoiceAgents(E2E_ADMIN);
    }
});

test('a user without the Call logs grant gets a 404 on the list and on a call', async ({ page, db }) => {
    await db.resetUser(E2E_USER, { moduleAccess: { [Modules.VOICE_AGENT]: [VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS] } });
    try {
        await page.goto(CALL_LOGS_URL);
        await expect(page.getByRole('heading', { name: '404 - Page Not Found' }).first()).toBeVisible();
        await page.goto(`${CALL_LOGS_URL}/${new ObjectId().toString()}`);
        await expect(page.getByRole('heading', { name: '404 - Page Not Found' }).first()).toBeVisible();
    } finally {
        await db.resetUser(E2E_USER);
    }
});
