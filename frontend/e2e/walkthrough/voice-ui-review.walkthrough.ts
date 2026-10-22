import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { encryptOverrides } from 'flags';
import { ObjectId } from 'mongodb';
import {
    VOICE_AGENT_SUB_MODULES,
    VoiceAgentCallType,
    VoiceCallChannel,
    VoiceCallDirection,
    VoiceCampaignContactStatus,
    VoiceCampaignStatus,
    VoiceProvider,
    type VoiceCallCost,
    type VoiceCallDoc,
} from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';
import { FeatureFlagKey } from '@/flags';
import { DEFAULT_INBOUND_VOICE_AGENT_PROMPT, DEFAULT_VOICE_AGENT_PROMPT } from '@/helpers/voice-agent-defaults';
import { expect, test } from '../support/fixtures';
import { E2E_ARTIFACTS_DIR, E2E_BASE_URL, E2E_FLAGS_SECRET, USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import { openVoiceAgent, VOICE_AGENTS_URL, waitForHydration } from '../support/voice-agents';
import { FAKE_TELNYX_KEY, FakeTelnyx, sealForE2e } from '../voice-agent/fake-telephony';

/**
 * Not pass/fail: one tour of the voice pages changed on 2026-10-22 (agents and the create dialog,
 * the editor's Speech & behaviour, Settings, phone number rows and the change-job dialog, call
 * logs, analytics, campaigns, web dialer) at desktop and phone width. Screenshots and a
 * `report.json` of console errors, page errors, horizontal overflow and steps that could not run
 * go to `node_modules/.cache/e2e/walkthrough/voice-ui-review/<viewport>/`.
 */
const VIEWPORTS = {
    desktop: { width: 1440, height: 900 },
    phone: { width: 390, height: 844 },
};
const URLS = {
    settings: SubModuleUrls[VOICE_AGENT_SUB_MODULES.SETTINGS],
    numbers: SubModuleUrls[VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS],
    callLogs: SubModuleUrls[VOICE_AGENT_SUB_MODULES.CALL_LOGS],
    analytics: SubModuleUrls[VOICE_AGENT_SUB_MODULES.CUSTOM_AGENT_ANALYTICS],
    campaigns: SubModuleUrls[VOICE_AGENT_SUB_MODULES.CAMPAIGNS],
    webDialer: SubModuleUrls[VOICE_AGENT_SUB_MODULES.WEB_DIALER],
};
const NUMBER = '+13473703925';
const MINUTE = 60_000;
const CSV = [
    'Full Name,Mobile,Company,City',
    'Asha Rao,98765 43210,Sunrise Dental,Pune',
    "Ben,+91 91234 56789,Ben's Garage,Mumbai",
    'Chen,098765 43210,Dup Co,Delhi',
    'Dev,12345,Bad Co,Goa',
].join('\n');

type Finding = { screen: string; kind: 'console' | 'pageerror' | 'overflow' | 'step'; detail: string };
type SeedCall = Omit<VoiceCallDoc, '_id' | 'tenantId' | 'userId'>;

function call(fields: Partial<SeedCall> & Pick<SeedCall, 'agentId' | 'startedAt'>): SeedCall {
    const durationSec = fields.durationSec ?? 60;
    return {
        numberId: null,
        channel: VoiceCallChannel.PHONE,
        direction: VoiceCallDirection.OUTBOUND,
        from: NUMBER,
        to: '+14155550123',
        voice: 'sulafat',
        endedAt: new Date(fields.startedAt.getTime() + durationSec * 1000),
        durationSec,
        endedBy: 'goodbye',
        flags: [],
        turns: [
            { role: 'agent', text: 'Hi, this is Maya from Sunrise Dental. Is now a good time?' },
            { role: 'caller', text: 'Yes, go ahead.' },
        ],
        gapsMs: [700],
        ...fields,
    };
}

function cost(geminiUsd: number, providerUsd: number): VoiceCallCost {
    return {
        totalUsd: geminiUsd + providerUsd,
        geminiUsd,
        geminiFreeTier: false,
        geminiTokens: { textIn: 13432, audioIn: 1745, textOut: 546, audioOut: 467 },
        provider: VoiceProvider.TELNYX,
        providerUsd,
        providerExact: false,
    };
}

let telnyx: FakeTelnyx;

test.use({ storageState: USER_STORAGE_STATE });

test.beforeAll(async () => {
    telnyx = await FakeTelnyx.start();
});

test.afterAll(async () => {
    await telnyx?.stop();
});

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(viewportName, () => {
        test.use({ viewport });

        test('voice UI review walkthrough', async ({ page, context, db }) => {
            test.setTimeout(6 * 60_000);
            telnyx.reset();
            await db.resetUser(E2E_USER);
            await db.resetVoiceAgents(E2E_USER);
            await db.resetVoiceTelephony(E2E_USER);
            await db.resetVoiceBookings(E2E_USER);
            await db.resetVoiceCampaigns(E2E_USER);
            // The web dialer and analytics pages are behind flags that are off by default.
            const flags = await encryptOverrides(
                { [FeatureFlagKey.VOICE_WEB_DIALER]: true, [FeatureFlagKey.VOICE_AGENT_ANALYTICS]: true },
                E2E_FLAGS_SECRET,
            );
            await context.addCookies([{ name: 'vercel-flag-overrides', value: flags, url: E2E_BASE_URL }]);

            const outDir = path.join(E2E_ARTIFACTS_DIR, 'walkthrough', 'voice-ui-review', viewportName);
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
                if (overflow > 1) findings.push({ screen, kind: 'overflow', detail: `${overflow}px wider than the viewport` });
                shot += 1;
                await page.screenshot({ path: path.join(outDir, `${String(shot).padStart(2, '0')}-${name}.png`), fullPage });
            };
            const open = async (url: string) => {
                await page.goto(url);
                await waitForHydration(page, '#header');
            };
            // A broken step is a finding, not the end of the tour.
            const section = async (name: string, run: () => Promise<void>) => {
                try {
                    await run();
                } catch (error) {
                    findings.push({ screen: name, kind: 'step', detail: String(error).split('\n')[0].slice(0, 300) });
                    await page.keyboard.press('Escape').catch(() => undefined);
                }
            };

            // Seed: agents, a Telnyx number (on the fake) making calls, calls, campaigns.
            const sales = await db.insertVoiceAgent(E2E_USER, {
                name: 'Maya (sales)',
                prompt: DEFAULT_VOICE_AGENT_PROMPT,
            });
            const frontDesk = await db.insertVoiceAgent(E2E_USER, {
                name: 'Front desk (after hours)',
                callType: VoiceAgentCallType.INBOUND,
                voice: 'kore',
                prompt: DEFAULT_INBOUND_VOICE_AGENT_PROMPT,
            });
            const numberId = await db.insertVoiceNumber(E2E_USER, {
                phoneNumber: NUMBER,
                providerNumberId: telnyx.numbers[0]?.id ?? 'pn-review',
                apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
                callControlAppId: 'cc-review',
                outboundAgentId: new ObjectId(sales),
            });
            const now = Date.now();
            await db.insertVoiceCalls(E2E_USER, [
                call({ agentId: new ObjectId(sales), numberId: new ObjectId(numberId), startedAt: new Date(now - 5 * MINUTE), durationSec: 95, cost: cost(0.025, 0.02) }),
                call({
                    agentId: new ObjectId(frontDesk),
                    numberId: new ObjectId(numberId),
                    direction: VoiceCallDirection.INBOUND,
                    from: '+12125550199',
                    to: NUMBER,
                    startedAt: new Date(now - 60 * MINUTE),
                    durationSec: 42,
                    endedBy: 'caller_hung_up',
                    cost: cost(0.014, 0.007),
                }),
                call({ agentId: new ObjectId(sales), channel: VoiceCallChannel.PLAYGROUND, startedAt: new Date(now - 26 * 60 * MINUTE), durationSec: 20 }),
            ]);
            const contact = (phone: string, name: string, extra = {}) => ({ phone, name, variables: { company: `${name}’s shop` }, ...extra });
            const { campaignId } = await db.insertVoiceCampaign(
                E2E_USER,
                {
                    name: 'Clinic recall, October',
                    agentId: new ObjectId(sales),
                    numberId: new ObjectId(numberId),
                    status: VoiceCampaignStatus.RUNNING,
                    variableKeys: ['company'],
                },
                [
                    contact('+919876543210', 'Asha Rao', { status: VoiceCampaignContactStatus.ANSWERED, attempts: 1, lastOutcome: 'goodbye', booked: true }),
                    contact('+919123456789', 'Ben', { status: VoiceCampaignContactStatus.PENDING, attempts: 1, lastOutcome: 'no_answer', nextAttemptAt: new Date(now + 60 * MINUTE) }),
                    contact('+919844455566', 'Gita', { status: VoiceCampaignContactStatus.FAILED, attempts: 1, lastOutcome: 'failed', lastError: 'Telnyx refused the call: insufficient balance' }),
                    contact('+919855566677', 'Hari'),
                ],
            );
            await db.insertVoiceCampaign(
                E2E_USER,
                { name: 'Lapsed members win-back', agentId: new ObjectId(sales), numberId: new ObjectId(numberId) },
                [contact('+919866677788', 'Isha')],
            );

            await section('agents', async () => {
                await page.goto(VOICE_AGENTS_URL);
                await waitForHydration(page, '[data-testid="new-voice-agent"]');
                await capture('agents-list');
                await page.getByTestId('new-voice-agent').click();
                await expect(page.getByRole('dialog', { name: 'New voice agent' })).toBeVisible();
                await capture('agents-create-dialog', false);
                await page.keyboard.press('Escape');
            });

            await section('editor', async () => {
                await openVoiceAgent(page, sales);
                await capture('agent-editor');
                await page.getByTestId('speech-settings').scrollIntoViewIfNeeded();
                await capture('agent-editor-speech', false);
            });

            await section('settings', async () => {
                await open(URLS.settings);
                await capture('settings');
            });

            await section('numbers', async () => {
                await open(URLS.numbers);
                await expect(page.getByTestId('voice-number-row')).toHaveCount(1);
                await capture('numbers');
                await page.getByRole('button', { name: 'Connect a number' }).click();
                await page.getByRole('menuitem', { name: /^Twilio/ }).click();
                await expect(page.getByRole('dialog', { name: 'Connect a Twilio number' })).toBeVisible();
                await capture('numbers-connect-twilio', false);
                await page.keyboard.press('Escape');
            });

            await section('call-logs', async () => {
                await open(URLS.callLogs);
                await capture('call-logs');
            });

            await section('analytics', async () => {
                await open(URLS.analytics);
                await capture('analytics');
            });

            await section('campaigns', async () => {
                await page.goto(URLS.campaigns);
                await waitForHydration(page, '[data-testid="campaign-card"]');
                await capture('campaigns-list');
                await page.goto(`${URLS.campaigns}/${campaignId}`);
                await waitForHydration(page, '#header');
                await capture('campaign-detail');
            });

            await section('campaign-wizard', async () => {
                await page.goto(`${URLS.campaigns}/new`);
                await waitForHydration(page, '#campaign-name');
                await page.locator('#campaign-name').fill('October cleaning reminders');
                await page.getByRole('button', { name: 'Next', exact: true }).click();
                await page.locator('#campaign-csv').setInputFiles({ name: 'october.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
                await expect(page.getByTestId('csv-ready')).toBeVisible();
                await capture('campaign-new-contacts');
                await page.getByRole('button', { name: 'Next', exact: true }).click();
                await page.getByRole('button', { name: 'Next', exact: true }).click();
                await expect(page.getByTestId('campaign-review')).toBeVisible();
                await capture('campaign-new-review');
            });

            await section('web-dialer', async () => {
                await open(URLS.webDialer);
                await capture('web-dialer');
            });

            await writeFile(path.join(outDir, 'report.json'), JSON.stringify(findings, null, 2));
        });
    });
}
