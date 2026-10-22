import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ObjectId } from 'mongodb';
import { VoiceAgentCallType, VoiceCallChannel, VoiceCallDirection } from '@aixellabs/backend/db/types';
import { expect, test } from '../support/fixtures';
import { E2E_ARTIFACTS_DIR, E2E_TELNYX_API_BASE, USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import {
    CALL_LOGS_URL,
    FAKE_TELNYX_KEY,
    FAKE_VOICELINK_TOKEN,
    FakeTelnyx,
    FakeVoiceLink,
    PHONE_NUMBERS_URL,
} from './fake-telephony';

/**
 * Not pass/fail: screenshots of the Phone numbers and Call logs screens at desktop and phone
 * width, plus a `report.json` of console errors and horizontal overflow, for a visual review.
 */
const VIEWPORTS = {
    desktop: { width: 1440, height: 900 },
    phone: { width: 390, height: 844 },
};

type Finding = { screen: string; kind: 'console' | 'pageerror' | 'overflow'; detail: string };

let telnyx: FakeTelnyx;
let voicelink: FakeVoiceLink;

test.use({ storageState: USER_STORAGE_STATE });

test.beforeAll(async () => {
    telnyx = await FakeTelnyx.start();
    voicelink = await FakeVoiceLink.start();
});

test.afterAll(async () => {
    await telnyx?.stop();
    await voicelink?.stop();
});

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(viewportName, () => {
        test.use({ viewport });

        test('phone numbers and call logs walkthrough', async ({ page, db }) => {
            test.setTimeout(5 * 60_000);
            telnyx.reset();
            voicelink.reset();
            await db.resetUser(E2E_USER);
            await db.resetVoiceAgents(E2E_USER);
            await db.resetVoiceTelephony(E2E_USER);

            const outDir = path.join(E2E_ARTIFACTS_DIR, 'walkthrough', 'voice-telephony', viewportName);
            await mkdir(outDir, { recursive: true });
            const findings: Finding[] = [];
            let screen = 'start';
            let shot = 0;
            page.on('console', (msg) => {
                if (msg.type() === 'error') findings.push({ screen, kind: 'console', detail: msg.text().slice(0, 300) });
            });
            page.on('pageerror', (error) => findings.push({ screen, kind: 'pageerror', detail: error.message }));

            const capture = async (name: string, fullPage = true) => {
                screen = name;
                await page.waitForTimeout(400);
                const overflow = await page.evaluate(
                    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
                );
                if (overflow > 1)
                    findings.push({ screen, kind: 'overflow', detail: `${overflow}px wider than the viewport` });
                shot += 1;
                await page.screenshot({ path: path.join(outDir, `${String(shot).padStart(2, '0')}-${name}.png`), fullPage });
            };
            const open = async (url: string) => {
                await page.goto(url);
                await waitForHydration(page, '#header');
            };

            const frontDesk = await db.insertVoiceAgent(E2E_USER, {
                name: 'Front desk',
                callType: VoiceAgentCallType.INBOUND,
            });
            const sales = await db.insertVoiceAgent(E2E_USER, {
                name: 'Sales outreach',
                callType: VoiceAgentCallType.OUTBOUND,
            });

            await open(PHONE_NUMBERS_URL);
            await capture('numbers-empty');

            await page.getByRole('region', { name: 'Setup guide' }).getByRole('button', { name: 'See the guide' }).click();
            const guide = page.getByRole('dialog', { name: 'Set up Telnyx for your voice agents' });
            await capture('setup-guide', false);
            await page.keyboard.press('ArrowRight');
            await capture('setup-guide-api-key', false);
            await guide.getByRole('button', { name: 'Zoom in on the screenshot' }).click();
            await capture('setup-guide-zoomed', false);
            await page.keyboard.press('Escape');
            await expect(guide).toBeHidden();

            await page.getByRole('button', { name: 'Connect a number' }).first().click();
            const connect = page.getByRole('dialog', { name: 'Connect a number' });
            await connect.getByLabel('Telnyx API key').fill(FAKE_TELNYX_KEY);
            await capture('connect-key', false);
            await connect.getByRole('button', { name: 'Find my numbers' }).click();
            await expect(connect.getByRole('checkbox')).toHaveCount(2);
            await capture('connect-choose', false);
            await connect.getByRole('button', { name: 'Import 2 numbers' }).click();
            await expect(connect).toBeHidden();

            await page.getByRole('button', { name: 'Connect a number' }).first().click();
            await connect.getByRole('radio', { name: 'VoiceLink' }).click();
            await connect.getByLabel('VoiceLink API token').fill(FAKE_VOICELINK_TOKEN);
            await capture('connect-voicelink', false);
            await connect.getByRole('button', { name: 'Find my numbers' }).click();
            await expect(connect.getByRole('checkbox')).toHaveCount(2);
            await connect.getByRole('checkbox', { name: '+918069450100' }).click();
            await connect.getByRole('button', { name: 'Import 1 number' }).click();
            await expect(connect).toBeHidden();

            const row = (phoneNumber: string) => page.getByTestId('voice-number-row').filter({ hasText: phoneNumber });
            await capture('numbers-imported');
            await page.getByRole('combobox', { name: 'Outbound agent for +13473703925' }).click();
            await page.getByRole('option', { name: 'Sales outreach', exact: true }).click();
            await expect(row('+13473703925')).toContainText('Outbound only');
            await row('+13473703925').getByRole('switch', { name: 'AI answers incoming calls' }).click();
            await expect(row('+13473703925')).toContainText('AI answers calls');
            await page.getByRole('combobox', { name: 'Outbound agent for +13475550142' }).click();
            await page.getByRole('option', { name: 'Sales outreach', exact: true }).click();
            await expect(row('+13475550142')).toContainText('Outbound only');
            await row('+919484950416').getByRole('switch', { name: 'AI answers incoming calls' }).click();
            await expect(row('+919484950416')).toContainText('AI answers calls');
            await page.reload();
            await waitForHydration(page, '#header');
            await capture('numbers-list');

            await row('+13473703925').getByRole('button', { name: 'Test call' }).click();
            await capture('test-call', false);
            await page.keyboard.press('Escape');
            await row('+919484950416').getByRole('button', { name: 'Test call' }).click();
            await capture('test-call-voicelink', false);
            await page.keyboard.press('Escape');
            await row('+919484950416').getByRole('button', { name: 'Remove' }).click();
            await capture('remove-voicelink', false);
            await page.keyboard.press('Escape');

            const [number] = (await db.getVoiceNumbers(E2E_USER)).filter((n) => n.phoneNumber === '+13473703925');
            const now = Date.now();
            const [outboundId] = await db.insertVoiceCalls(E2E_USER, [
                {
                    agentId: new ObjectId(sales),
                    numberId: number._id,
                    channel: VoiceCallChannel.PHONE,
                    direction: VoiceCallDirection.OUTBOUND,
                    from: '+13473703925',
                    to: '+14155550123',
                    voice: 'sulafat',
                    startedAt: new Date(now - 5 * 60_000),
                    endedAt: new Date(now - 5 * 60_000 + 95_000),
                    durationSec: 95,
                    endedBy: 'goodbye',
                    providerCallId: 'v3:walkthrough-call',
                    flags: [{ flag: 'callback_requested', quote: 'Call me back tomorrow after ten.' }],
                    turns: [
                        { role: 'agent', text: 'Hi, this is Maya from Aixel Labs. Is this the front desk?' },
                        { role: 'caller', text: 'Yes, who is calling?' },
                        {
                            role: 'agent',
                            text: 'I help clinics answer every call, even after hours, so no patient goes to voicemail. Do you have a minute?',
                        },
                        { role: 'caller', text: 'Not now. Call me back tomorrow after ten.' },
                        { role: 'agent', text: 'Of course. Tomorrow after ten it is. Goodbye!' },
                    ],
                    gapsMs: [640, 1720],
                },
                {
                    agentId: new ObjectId(frontDesk),
                    numberId: number._id,
                    channel: VoiceCallChannel.PHONE,
                    direction: VoiceCallDirection.INBOUND,
                    from: '+12125550199',
                    to: '+13473703925',
                    voice: 'sulafat',
                    startedAt: new Date(now - 60 * 60_000),
                    endedAt: new Date(now - 60 * 60_000 + 42_000),
                    durationSec: 42,
                    endedBy: 'caller_hung_up',
                    flags: [],
                    turns: [
                        { role: 'agent', text: 'Thanks for calling, how can I help?' },
                        { role: 'caller', text: 'What are your hours?' },
                        { role: 'agent', text: 'We are open nine to six, Monday to Saturday.' },
                    ],
                    gapsMs: [820],
                },
                {
                    agentId: new ObjectId(frontDesk),
                    channel: VoiceCallChannel.PLAYGROUND,
                    direction: VoiceCallDirection.PLAYGROUND,
                    voice: 'sulafat',
                    startedAt: new Date(now - 120 * 60_000),
                    endedAt: new Date(now - 120 * 60_000 + 12_000),
                    durationSec: 12,
                    endedBy: 'caller_hung_up',
                    flags: [],
                    turns: [{ role: 'agent', text: 'Hello! How can I help today?' }],
                    gapsMs: [],
                },
            ]);
            telnyx.recordings.set('v3:walkthrough-call', [
                {
                    id: 'rec-1',
                    status: 'completed',
                    duration_millis: 95_000,
                    download_urls: { mp3: `${E2E_TELNYX_API_BASE}/download/walkthrough.mp3` },
                },
            ]);

            await open(CALL_LOGS_URL);
            await capture('call-logs');
            await open(`${CALL_LOGS_URL}?agent=${frontDesk}`);
            await capture('call-logs-filtered');
            await open(`${CALL_LOGS_URL}/${outboundId}`);
            await expect(page.getByLabel('Call recording')).toBeVisible();
            await capture('call-detail');

            await writeFile(path.join(outDir, 'report.json'), JSON.stringify(findings, null, 2));
        });
    });
}
