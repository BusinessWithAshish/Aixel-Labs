import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ObjectId } from 'mongodb';
import type { Page } from '@playwright/test';
import { encryptOverrides } from 'flags';
import {
    VOICE_AGENT_SUB_MODULES,
    VoiceAgentCallType,
    VoiceBookingStatus,
    VoiceCallChannel,
    VoiceCallDirection,
    VoiceProvider,
} from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';
import { FeatureFlagKey } from '@/flags';
import { expect, test } from '../support/fixtures';
import { E2E_ARTIFACTS_DIR, E2E_BASE_URL, E2E_FLAGS_SECRET, USER_STORAGE_STATE } from '../support/env';
import {
    FAKE_MIC_LAUNCH_ARGS,
    FakePlaygroundEngine,
    openVoiceTool,
    VOICE_AGENTS_URL,
    voiceAgentUrl,
    waitForHydration,
} from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import {
    CALL_LOGS_URL,
    FAKE_TELNYX_KEY,
    FAKE_VOICELINK_TOKEN,
    FakeTelnyx,
    makeTestWav,
    PHONE_NUMBERS_URL,
    sealForE2e,
    sendPlaygroundTool,
} from './fake-telephony';

/**
 * Every voice-agent screen at phone and desktop width: nothing may scroll sideways (the page, its
 * scroll container, or an open dialog). Screenshots land in node_modules/.cache/e2e/voice-agent-screens.
 */
const BOOKINGS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS];
const WEB_DIALER_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.WEB_DIALER];
const VIEWPORTS = {
    phone: { width: 390, height: 844 },
    desktop: { width: 1440, height: 900 },
};
const SCREENS_DIR = path.join(E2E_ARTIFACTS_DIR, 'voice-agent-screens');

let telnyx: FakeTelnyx;

// The playground runs against a stand-in engine socket and Chromium's fake microphone.
test.use({ storageState: USER_STORAGE_STATE, permissions: ['microphone'], launchOptions: { args: FAKE_MIC_LAUNCH_ARGS } });

test.beforeAll(async () => {
    telnyx = await FakeTelnyx.start();
});

test.afterAll(async () => {
    await telnyx?.stop();
});

/** What sticks out sideways: the page, its scroll container, open dialogs, and the widest offenders. */
async function sidewaysOverflow(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const issues: string[] = [];
        const describe = (el: Element) =>
            `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.getAttribute('class') ?? '')
                .split(/\s+/)
                .slice(0, 4)
                .join('.')}`;
        const docExtra = document.documentElement.scrollWidth - vw;
        if (docExtra > 1) issues.push(`document is ${docExtra}px wider than the viewport`);
        const scrollers = [
            document.getElementById('page-children-container'),
            ...document.querySelectorAll('[role="dialog"]'),
        ].filter((el): el is HTMLElement => !!el);
        for (const el of scrollers) {
            const extra = el.scrollWidth - el.clientWidth;
            if (extra > 1) {
                const right = el.getBoundingClientRect().right;
                const offenders = [...el.querySelectorAll('*')]
                    .filter((child) => child.getBoundingClientRect().right > right + 1)
                    .slice(0, 3)
                    .map(describe);
                issues.push(`${describe(el)} scrolls ${extra}px sideways (${offenders.join(', ')})`);
            }
            const rect = el.getBoundingClientRect();
            if (el.getAttribute('role') === 'dialog' && (rect.left < -1 || rect.right > vw + 1)) {
                issues.push(`${describe(el)} spans ${Math.round(rect.left)}..${Math.round(rect.right)} of ${vw}px`);
            }
        }
        return issues;
    });
}

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(viewportName, () => {
        test.use({ viewport });

        test(`every voice-agent page fits ${viewport.width} px without sideways scrolling`, async ({ page, db, context }) => {
            test.setTimeout(4 * 60_000);
            telnyx.reset();
            await db.resetUser(E2E_USER);
            await db.resetVoiceAgents(E2E_USER);
            await db.resetVoiceTelephony(E2E_USER);
            await db.resetVoiceBookings(E2E_USER);

            const outDir = path.join(SCREENS_DIR, viewportName);
            await mkdir(outDir, { recursive: true });
            const problems: string[] = [];
            let shot = 0;
            const check = async (name: string) => {
                await page.waitForTimeout(300);
                for (const issue of await sidewaysOverflow(page)) problems.push(`${name}: ${issue}`);
                shot += 1;
                await page.screenshot({ path: path.join(outDir, `${String(shot).padStart(2, '0')}-${name}.png`) });
            };
            const open = async (url: string) => {
                await page.goto(url);
                await waitForHydration(page, '#header');
            };

            const frontDesk = await db.insertVoiceAgent(E2E_USER, {
                name: 'Front desk for Sunrise Dental Clinic, Koramangala branch',
                callType: VoiceAgentCallType.INBOUND,
            });
            await db.insertVoiceAgent(E2E_USER, { name: 'Sales outreach', callType: VoiceAgentCallType.OUTBOUND });
            const numberId = await db.insertVoiceNumber(E2E_USER, {
                phoneNumber: '+13473703925',
                providerNumberId: '1293384261075731499',
                apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
                texmlAppId: 'texml-1',
                callControlAppId: 'cc-1',
                inboundAgentId: new ObjectId(frontDesk),
            });
            await db.insertVoiceNumber(E2E_USER, {
                provider: VoiceProvider.VOICELINK,
                phoneNumber: '+919484950416',
                providerNumberId: '501',
                apiKeySealed: sealForE2e(FAKE_VOICELINK_TOKEN),
                voicelink: { clientId: null, botId: 701, routingId: 9001 },
            });
            const now = Date.now();
            const longUrl = 'https://hooks.example.com/clinic/crm/lookup-customer-by-phone-number?source=voice-agent';
            const [callId] = await db.insertVoiceCalls(E2E_USER, [
                {
                    agentId: new ObjectId(frontDesk),
                    numberId: new ObjectId(numberId),
                    channel: VoiceCallChannel.PHONE,
                    direction: VoiceCallDirection.INBOUND,
                    from: '+12125550199',
                    to: '+13473703925',
                    voice: 'sulafat',
                    startedAt: new Date(now - 10 * 60_000),
                    endedAt: new Date(now - 10 * 60_000 + 95_000),
                    durationSec: 95,
                    endedBy: 'goodbye',
                    providerCallId: 'v3:mobile-call',
                    flags: [{ flag: 'callback_requested', quote: 'Call me back tomorrow after ten, please.' }],
                    turns: [
                        { role: 'agent', text: 'Thanks for calling Sunrise Dental, how can I help?' },
                        { role: 'caller', text: 'Can I get a cleaning on Saturday afternoon?' },
                        { role: 'agent', text: 'Saturday at two is free. Shall I book it for you?' },
                        { role: 'caller', text: 'Yes please, I am Ravi.' },
                        { role: 'agent', text: 'Done. See you Saturday at two, Ravi. Goodbye!' },
                    ],
                    gapsMs: [640, 1720],
                    toolCalls: [
                        {
                            name: 'check_availability',
                            arguments: { date: '2030-03-16' },
                            result: 'Free on Saturday 16 March: 2:00 PM, 2:30 PM, 3:00 PM.',
                            ok: true,
                            afterTurn: 2,
                            durationMs: 14,
                        },
                        {
                            name: 'book_appointment',
                            arguments: { date: '2030-03-16', time: '14:00', name: 'Ravi', notes: 'Cleaning' },
                            result: 'Booked.',
                            ok: true,
                            afterTurn: 4,
                            durationMs: 30,
                            bookingId: new ObjectId().toString(),
                        },
                        {
                            name: 'crm_lookup_customer_by_phone_number',
                            arguments: { phone: '+12125550199', url: longUrl },
                            result: `POST ${longUrl} failed: HTTP 500 Internal Server Error`,
                            ok: false,
                            afterTurn: 4,
                            durationMs: 8000,
                        },
                    ],
                },
            ]);
            telnyx.recordings.set('v3:mobile-call', [
                {
                    id: 'rec-mobile',
                    record_type: 'recording',
                    call_control_id: 'v3:mobile-call',
                    status: 'completed',
                    duration_millis: 3_000,
                    download_urls: { wav: telnyx.addRecordingFile('mobile-call.wav', makeTestWav(3)) },
                },
            ]);
            await db.insertVoiceBookings(E2E_USER, [
                {
                    agentId: new ObjectId(frontDesk),
                    callId: new ObjectId(callId),
                    channel: VoiceCallChannel.PHONE,
                    start: new Date('2030-03-16T08:30:00Z'),
                    end: new Date('2030-03-16T09:00:00Z'),
                    timezone: 'Asia/Kolkata',
                    customerName: 'Ravi Kumar Venkataraman Subramanian',
                    customerPhone: '+919876543210',
                    notes: 'First visit. Wants a cleaning and asked about whitening prices, call back with a quote.',
                    status: VoiceBookingStatus.BOOKED,
                },
                {
                    agentId: new ObjectId(frontDesk),
                    callId: null,
                    channel: VoiceCallChannel.PLAYGROUND,
                    start: new Date('2025-12-05T10:00:00Z'),
                    end: new Date('2025-12-05T10:30:00Z'),
                    timezone: 'Asia/Kolkata',
                    customerName: 'Meera',
                    status: VoiceBookingStatus.CANCELLED,
                },
            ]);

            // Agents: list, the two create steps, the editor + playground workspace.
            await open(VOICE_AGENTS_URL);
            await check('agents');
            await page.getByRole('button', { name: 'New agent' }).click();
            const create = page.getByRole('dialog', { name: 'New voice agent' });
            await create.getByRole('combobox', { name: 'Agent type' }).click();
            await check('create-agent-type');
            await page.getByRole('option', { name: /^Inbound/ }).click();
            await expect(create.getByLabel('Name')).toBeVisible();
            await check('create-agent-details');
            await page.keyboard.press('Escape');

            const engine = await FakePlaygroundEngine.install(page);
            await page.goto(voiceAgentUrl(frontDesk));
            await waitForHydration(page, '#agent-prompt');
            await check('agent-editor');
            await page.getByTestId('voice-playground').scrollIntoViewIfNeeded();
            await check('agent-playground');
            await page.getByRole('button', { name: 'Start call' }).click();
            await expect(page.getByTestId('playground-status')).toHaveText('Live');
            await expect.poll(() => engine.connected).toBe(true);
            engine.sendEvent({ type: 'transcript', role: 'agent', text: 'Thanks for calling Sunrise Dental, how can I help?' });
            engine.sendEvent({ type: 'transcript', role: 'caller', text: 'Can I come in Saturday at two? I am Ravi.' });
            sendPlaygroundTool(engine, {
                name: 'check_availability',
                arguments: { date: '2030-03-16' },
                result: 'Free on Saturday 16 March: 2:00 PM, 2:30 PM.',
                ok: true,
            });
            sendPlaygroundTool(engine, {
                name: 'book_appointment',
                arguments: { date: '2030-03-16', time: '14:00', name: 'Ravi' },
                result: 'Booked.',
                ok: true,
            });
            engine.sendEvent({ type: 'turn', gapMs: 712 });
            engine.sendEvent({ type: 'transcript', role: 'agent', text: 'You are booked for Saturday at two, Ravi.' });
            await expect(page.getByTestId('playground-transcript').getByTestId('tool-call')).toHaveCount(2);
            await page.getByTestId('voice-playground').scrollIntoViewIfNeeded();
            await check('agent-playground-live');
            await page.getByRole('button', { name: 'End call' }).click();

            // The Tools list with a booking tool open on an app, and the call settings' first speaker and personality.
            await openVoiceTool(page, 'check_availability');
            await page.locator('#booking-destination').click();
            await page.getByRole('option', { name: 'Google Calendar' }).click();
            await page.getByTestId('voice-agent-tools').scrollIntoViewIfNeeded();
            await check('agent-tools-booking');
            await page.getByTestId('first-speaker').scrollIntoViewIfNeeded();
            await check('agent-call-settings-speech');
            await page.getByTestId('personality-settings').scrollIntoViewIfNeeded();
            await check('agent-call-settings-personality');

            // Phone numbers: the list, the provider menu, the connect dialog and its guide carousel.
            await open(PHONE_NUMBERS_URL);
            await expect(page.getByTestId('voice-number-row')).toHaveCount(2);
            await check('phone-numbers');
            await page.getByRole('button', { name: 'Connect a number' }).first().click();
            await expect(page.getByRole('menuitem')).toHaveCount(3);
            await check('connect-number-menu');
            await page.getByRole('menuitem', { name: /^Telnyx/ }).click();
            const connect = page.getByRole('dialog', { name: 'Connect a Telnyx number' });
            await connect.getByRole('button', { name: 'Telnyx setup guide' }).click();
            const guide = page.getByRole('dialog', { name: /Set up Telnyx/ });
            await expect(guide).toBeVisible();
            await check('setup-guide');
            await page.keyboard.press('ArrowRight');
            await check('setup-guide-step-2');
            await page.keyboard.press('Escape');
            await expect(guide).toBeHidden();
            await connect.getByLabel('Telnyx API key').fill(FAKE_TELNYX_KEY);
            await check('connect-number');
            await connect.getByRole('button', { name: 'Find my numbers' }).click();
            await expect(connect.getByRole('checkbox').first()).toBeVisible();
            await check('connect-number-choose');
            await page.keyboard.press('Escape');

            // Call logs, a call with tools and its recording.
            await open(CALL_LOGS_URL);
            await check('call-logs');
            await open(`${CALL_LOGS_URL}/${callId}`);
            await expect(page.getByLabel('Call recording')).toBeVisible();
            await check('call-detail');
            // Open each tool row by its chevron (the booked one's title is a link).
            for (const tool of await page.getByTestId('tool-call').locator('summary').all()) {
                await tool.click({ position: { x: 12, y: 12 } });
            }
            await page.getByTestId('tool-call').last().scrollIntoViewIfNeeded();
            await check('call-detail-tools-open');

            // Bookings and the cancel dialog.
            await open(BOOKINGS_URL);
            await expect(page.getByTestId('booking')).toHaveCount(2);
            await check('bookings');
            await page.getByRole('button', { name: 'Cancel booking' }).click();
            await expect(page.getByRole('dialog', { name: 'Cancel this booking?' })).toBeVisible();
            await check('bookings-cancel');
            await page.keyboard.press('Escape');

            await db.resetVoiceBookings(E2E_USER);
            await open(BOOKINGS_URL);
            await check('bookings-empty');

            // Web dialer (behind a flag): the phone, its recents, the in-call screen (the microphone prompt
            // never answers, so no call is placed), and with no number.
            const flags = await encryptOverrides({ [FeatureFlagKey.VOICE_WEB_DIALER]: true }, E2E_FLAGS_SECRET);
            await context.addCookies([{ name: 'vercel-flag-overrides', value: flags, url: E2E_BASE_URL }]);
            await page.addInitScript(() => {
                navigator.mediaDevices.getUserMedia = () => new Promise(() => {});
                window.localStorage.setItem('web-dialer-recent', JSON.stringify(['+447700900123', '+919876543210']));
            });
            await open(WEB_DIALER_URL);
            await page.locator('input[aria-label="Number to call"]').fill('+12025550188');
            await check('web-dialer');
            await page.getByRole('tab', { name: 'Recents' }).click();
            await check('web-dialer-recents');
            await page.getByRole('button', { name: /\+44 77009 00123/ }).click();
            await page.getByRole('button', { name: 'Call', exact: true }).click();
            await expect(page.getByRole('button', { name: 'Hang up' })).toBeVisible();
            await check('web-dialer-in-call');
            await page.getByRole('button', { name: 'Keypad' }).click();
            await check('web-dialer-in-call-keypad');

            // A first-time user's Phone numbers page: one way in, the Connect a number menu.
            await db.resetVoiceTelephony(E2E_USER);
            await open(PHONE_NUMBERS_URL);
            await expect(page.getByRole('button', { name: 'Connect a number' })).toBeVisible();
            await check('phone-numbers-empty');
            await open(WEB_DIALER_URL);
            await expect(page.getByText('No phone number yet')).toBeVisible();
            await check('web-dialer-empty');

            expect(problems).toEqual([]);
        });
    });
}
