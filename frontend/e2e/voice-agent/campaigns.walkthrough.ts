import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ObjectId } from 'mongodb';
import {
    VOICE_AGENT_SUB_MODULES,
    VoiceAgentCallType,
    VoiceCampaignContactStatus,
    VoiceCampaignStatus,
} from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';
import { expect, test } from '../support/fixtures';
import { E2E_ARTIFACTS_DIR, USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import { FAKE_TELNYX_KEY, sealForE2e } from './fake-telephony';

/**
 * Not pass/fail: screenshots of the Campaigns list, the create wizard and a running campaign at
 * desktop and phone width, plus a `report.json` of console errors and horizontal overflow.
 */
const VIEWPORTS = {
    desktop: { width: 1440, height: 900 },
    phone: { width: 390, height: 844 },
};
const CAMPAIGNS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.CAMPAIGNS];

const CSV = [
    'Full Name,Mobile,Company,City',
    'Asha Rao,98765 43210,Sunrise Dental,Pune',
    "Ben,+91 91234 56789,Ben's Garage,Mumbai",
    'Chen,098765 43210,Dup Co,Delhi',
    'Dev,12345,Bad Co,Goa',
    '"Farah, Jr.",0091 99887 76655,Quote Co,Chennai',
].join('\n');

type Finding = { screen: string; kind: 'console' | 'pageerror' | 'overflow'; detail: string };

test.use({ storageState: USER_STORAGE_STATE });

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test.describe(viewportName, () => {
        test.use({ viewport });

        test('campaigns walkthrough', async ({ page, db }) => {
            test.setTimeout(5 * 60_000);
            await db.resetUser(E2E_USER);
            await db.resetVoiceAgents(E2E_USER);
            await db.resetVoiceTelephony(E2E_USER);
            await db.resetVoiceCampaigns(E2E_USER);
            const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Reminder caller', callType: VoiceAgentCallType.OUTBOUND });
            const numberId = await db.insertVoiceNumber(E2E_USER, {
                phoneNumber: '+919484950416',
                providerNumberId: 'pn-walkthrough',
                apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
                callControlAppId: 'cc-walkthrough',
            });
            const now = Date.now();
            const contact = (phone: string, name: string, extra = {}) => ({ phone, name, variables: { company: `${name}’s shop` }, ...extra });
            const { campaignId } = await db.insertVoiceCampaign(
                E2E_USER,
                {
                    name: 'Clinic recall, October',
                    agentId: new ObjectId(agentId),
                    numberId: new ObjectId(numberId),
                    status: VoiceCampaignStatus.RUNNING,
                    variableKeys: ['company'],
                    maxConcurrent: 3,
                    retry: { maxRetries: 2, delayMinutes: 60, on: [] },
                },
                [
                    contact('+919876543210', 'Asha Rao', { status: VoiceCampaignContactStatus.ANSWERED, attempts: 1, lastOutcome: 'goodbye', booked: true }),
                    contact('+919123456789', 'Ben', { status: VoiceCampaignContactStatus.PENDING, attempts: 1, lastOutcome: 'no_answer', nextAttemptAt: new Date(now + 3_600_000) }),
                    contact('+919988776655', 'Chen', { status: VoiceCampaignContactStatus.UNREACHED, attempts: 3, lastOutcome: 'voicemail' }),
                    contact('+919811122233', 'Dev', { status: VoiceCampaignContactStatus.SKIPPED_DNC, lastOutcome: 'dnc_list' }),
                    contact('+919833344455', 'Farah', { status: VoiceCampaignContactStatus.CALLING, attempts: 1 }),
                    contact('+919844455566', 'Gita', { status: VoiceCampaignContactStatus.FAILED, attempts: 1, lastOutcome: 'failed', lastError: 'Telnyx refused the call: insufficient balance' }),
                    contact('+919855566677', 'Hari'),
                ],
            );
            await db.insertVoiceCampaign(
                E2E_USER,
                { name: 'Lapsed members win-back', agentId: new ObjectId(agentId), numberId: new ObjectId(numberId), status: VoiceCampaignStatus.DRAFT },
                [contact('+919866677788', 'Isha'), contact('+919877788899', 'Jay')],
            );

            const outDir = path.join(E2E_ARTIFACTS_DIR, 'walkthrough', 'voice-campaigns', viewportName);
            await mkdir(outDir, { recursive: true });
            const findings: Finding[] = [];
            let screen = 'start';
            let shot = 0;
            page.on('console', (msg) => {
                if (msg.type() === 'error') findings.push({ screen, kind: 'console', detail: msg.text().slice(0, 300) });
            });
            page.on('pageerror', (error) => findings.push({ screen, kind: 'pageerror', detail: error.message }));
            const capture = async (name: string) => {
                screen = name;
                await page.waitForTimeout(400);
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
                if (overflow > 1) findings.push({ screen, kind: 'overflow', detail: `${overflow}px wider than the viewport` });
                shot += 1;
                await page.screenshot({ path: path.join(outDir, `${String(shot).padStart(2, '0')}-${name}.png`), fullPage: true });
            };

            await page.goto(CAMPAIGNS_URL);
            await waitForHydration(page, '[data-testid="campaign-card"]');
            await capture('list');

            await page.goto(`${CAMPAIGNS_URL}/${campaignId}`);
            await waitForHydration(page, '#campaign-contact-filter');
            await capture('detail-running');

            await page.goto(`${CAMPAIGNS_URL}/new`);
            await waitForHydration(page, '#campaign-name');
            await page.locator('#campaign-name').fill('October cleaning reminders');
            await capture('wizard-details');
            await page.getByRole('button', { name: 'Next', exact: true }).click();
            await capture('wizard-upload');
            await page.locator('#campaign-csv').setInputFiles({ name: 'october.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
            await expect(page.getByTestId('csv-ready')).toHaveText('3');
            await capture('wizard-contacts');
            await page.getByRole('button', { name: 'Next', exact: true }).click();
            await capture('wizard-schedule');
            await page.getByRole('button', { name: 'Next', exact: true }).click();
            await capture('wizard-review');

            await writeFile(path.join(outDir, 'report.json'), JSON.stringify(findings, null, 2));
        });
    });
}
