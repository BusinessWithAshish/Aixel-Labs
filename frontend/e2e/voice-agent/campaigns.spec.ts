import { ObjectId } from 'mongodb';
import type { Page } from '@playwright/test';
import {
    VOICE_AGENT_SUB_MODULES,
    VoiceAgentCallType,
    VoiceCallChannel,
    VoiceCallDirection,
    VoiceCampaignContactStatus,
    VoiceCampaignRetryOutcome,
    VoiceCampaignStatus,
} from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import { CALL_LOGS_URL, FAKE_TELNYX_KEY, sealForE2e } from './fake-telephony';

const CAMPAIGNS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.CAMPAIGNS];
const NEW_CAMPAIGN_URL = `${CAMPAIGNS_URL}/new`;
const FROM_NUMBER = '+919484950416';
/** How the app shows FROM_NUMBER (`formatPhone`). */
const FROM_NUMBER_SHOWN = '+91 94849 50416';

/** Six rows: three good (different formats), a repeat of row 2, a short number, an empty phone. */
const CSV = [
    'Full Name,Mobile,Company,City',
    'Asha Rao,98765 43210,Sunrise Dental,Pune',
    "Ben,+91 91234 56789,Ben's Garage,Mumbai",
    'Chen,098765 43210,Dup Co,Delhi',
    'Dev,12345,Bad Co,Goa',
    'Eve,,Empty Co,Goa',
    '"Farah, Jr.",0091 99887 76655,"Quote ""Co""",Chennai',
].join('\r\n');

async function uploadCsv(page: Page, csv = CSV, name = 'contacts.csv'): Promise<void> {
    await page.locator('#campaign-csv').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
}

async function openDetail(page: Page, campaignId: string): Promise<void> {
    await page.goto(`${CAMPAIGNS_URL}/${campaignId}`);
    await waitForHydration(page, '#campaign-contact-filter');
}

/** Toasts sit top right, over the campaign's buttons; a pointer resting on one keeps it open. */
async function clearToasts(page: Page): Promise<void> {
    await page.mouse.move(0, 400);
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10_000 });
}

async function pick(page: Page, trigger: string, option: string | RegExp): Promise<void> {
    await page.locator(trigger).click();
    await page.getByRole('option', { name: option }).click();
}

test.use({ storageState: USER_STORAGE_STATE });

let agentId: string;
let numberId: string;

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
    await db.resetVoiceCampaigns(E2E_USER);
    await db.setCampaignGeminiKey(E2E_USER, sealForE2e('AIza-e2e-fake-gemini-key'));
    agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Reminder caller', callType: VoiceAgentCallType.OUTBOUND });
    await db.insertVoiceAgent(E2E_USER, { name: 'Front desk', callType: VoiceAgentCallType.INBOUND });
    // A Call Control app already set: starting needs nothing from Telnyx.
    numberId = await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: FROM_NUMBER,
        providerNumberId: 'pn-campaign',
        apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
        callControlAppId: 'cc-e2e-campaign',
        outboundAgentId: new ObjectId(agentId),
    });
});

test('the sidebar opens Campaigns, which starts empty and links to the wizard', async ({ page }) => {
    await page.goto(SubModuleUrls[VOICE_AGENT_SUB_MODULES.AGENTS]);
    await page.getByRole('link', { name: 'Campaigns', exact: true }).click();
    await expect(page).toHaveURL(CAMPAIGNS_URL);
    const empty = page.getByTestId('campaigns-empty');
    await expect(empty).toContainText('No campaigns yet');
    await waitForHydration(page, '[data-testid="campaigns-empty"] a');
    await empty.getByRole('link', { name: 'New campaign' }).click();
    // The wizard route may compile on first hit under `next dev`.
    await expect(page).toHaveURL(NEW_CAMPAIGN_URL, { timeout: 60_000 });
    await expect(page.locator('#campaign-name')).toBeVisible();
});

test('reads a CSV: guesses the columns, normalises numbers, reports repeats and bad rows', async ({ page }) => {
    await page.goto(NEW_CAMPAIGN_URL);
    await waitForHydration(page, '#campaign-name');
    await page.locator('#campaign-name').fill('October reminders');
    // Only the outbound agent is offered; with one agent and one number both are already picked.
    await page.locator('#campaign-agent').click();
    await expect(page.getByRole('option')).toHaveText(['Reminder caller']);
    await page.keyboard.press('Escape');
    await expect(page.locator('#campaign-number')).toContainText(FROM_NUMBER);
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await expect(page.getByTestId('wizard-problem')).toHaveText('Upload a CSV of contacts');
    await uploadCsv(page);
    await expect(page.getByTestId('campaign-csv-name')).toHaveText('contacts.csv');
    await expect(page.locator('#campaign-phone-column')).toContainText('Mobile');
    await expect(page.locator('#campaign-name-column')).toContainText('Full Name');
    await expect(page.locator('#campaign-country')).toContainText('India (+91)');
    await expect(page.getByTestId('csv-ready')).toHaveText('3');
    await expect(page.getByTestId('csv-duplicates')).toHaveText('1');
    await expect(page.getByTestId('csv-invalid')).toHaveText('2');
    const issues = page.getByTestId('campaign-csv-issues');
    await expect(issues.getByRole('listitem')).toHaveText([
        /Row 4.*\+91 98765 43210 is already on row 2: called once/,
        /Row 5.*12345: Not a valid number in India/,
        /Row 6.*\(empty\): No phone number/,
    ]);
    await expect(page.getByTestId('campaign-variables').locator('[data-slot="badge"]')).toHaveText(['{{company}}', '{{city}}']);
    const preview = page.getByTestId('campaign-csv-preview').getByRole('listitem');
    await expect(preview).toHaveCount(3);
    await expect(preview.nth(0)).toContainText('Asha Rao');
    await expect(preview.nth(0)).toContainText('+91 98765 43210');
    await expect(preview.nth(2)).toContainText('Farah, Jr.');
    await expect(preview.nth(2)).toContainText('+91 99887 76655');
    await expect(preview.nth(2)).toContainText('company: Quote "Co"');

    // The wrong column: nothing to call, and the wizard says so.
    await pick(page, '#campaign-phone-column', 'Company');
    await expect(page.getByTestId('wizard-problem')).toHaveText('No valid phone numbers in that column');
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await pick(page, '#campaign-phone-column', 'Mobile');
    await expect(page.getByTestId('csv-ready')).toHaveText('3');

    // Read as US numbers instead, the national Indian ones are other people's (10 digits): still 3, all +1.
    await pick(page, '#campaign-country', /United States/);
    await expect(preview.nth(0)).toContainText('+1 987 654 3210');
    await expect(preview.nth(1)).toContainText('+91 91234 56789');

    // A file with no header row of contacts is refused.
    await page.getByRole('button', { name: 'Change file' }).click();
    await uploadCsv(page, 'Mobile\r\n', 'empty.csv');
    await expect(page.getByText('The file needs a header row and at least one contact.')).toBeVisible();
});

test('creates a draft: settings and contacts are saved as given', async ({ page, db }) => {
    await page.goto(NEW_CAMPAIGN_URL);
    await waitForHydration(page, '#campaign-name');
    await page.locator('#campaign-name').fill('October reminders');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await uploadCsv(page);
    await expect(page.getByTestId('csv-ready')).toHaveText('3');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await page.getByRole('group', { name: 'Calling days' }).getByRole('button', { name: 'Sat' }).click();
    await expect(page.getByRole('button', { name: 'Sat' })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#campaign-start').fill('10:00');
    await page.locator('#campaign-end').fill('17:30');
    await page.locator('#campaign-timezone').click();
    await page.getByPlaceholder('Search a city or region').fill('kolkata');
    await page.getByRole('option', { name: /Asia\/Kolkata|Asia\/Calcutta/ }).click();
    await pick(page, '#campaign-concurrency', '3 calls at a time');
    await pick(page, '#campaign-retries', '2 retries');
    await pick(page, '#campaign-delay', '30 minutes');
    await page.getByRole('group', { name: 'Retry when' }).getByText('Voicemail').click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    const review = page.getByTestId('campaign-review');
    const section = (name: string) => review.getByRole('region', { name, exact: true });
    await expect(section('3 contacts to call')).toContainText('Each call also gets {{company}}, {{city}}.');
    await expect(section('October reminders, by Reminder caller')).toContainText(`Calls go out from ${FROM_NUMBER_SHOWN}`);
    await expect(section('When')).toContainText('Mon–Sat, 10:00–17:30 India Standard Time, 3 calls at a time.');
    await expect(section('If nobody answers')).toContainText(
        'Up to 2 more calls on no answer, busy, or voicemail, 30 minutes apart.',
    );
    await page.getByRole('button', { name: 'Save as draft' }).click();

    await expect(page).toHaveURL(new RegExp(`${CAMPAIGNS_URL}/[0-9a-f]{24}$`));
    await expect(page.getByTestId('campaign-status')).toHaveText('Draft');
    await expect(page.getByTestId('campaign-contact')).toHaveCount(3);

    const [stored] = await db.getVoiceCampaigns(E2E_USER);
    expect(stored).toMatchObject({
        name: 'October reminders',
        status: VoiceCampaignStatus.DRAFT,
        maxConcurrent: 3,
        defaultCountry: 'IN',
        variableKeys: ['company', 'city'],
        window: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], start: '10:00', end: '17:30', timezone: 'Asia/Kolkata' },
        retry: {
            maxRetries: 2,
            delayMinutes: 30,
            on: [VoiceCampaignRetryOutcome.NO_ANSWER, VoiceCampaignRetryOutcome.BUSY, VoiceCampaignRetryOutcome.VOICEMAIL],
        },
    });
    expect(stored.agentId.toString()).toBe(agentId);
    expect(stored.numberId.toString()).toBe(numberId);
    const contacts = await db.getVoiceCampaignContacts(stored._id.toString());
    expect(contacts.map((c) => [c.row, c.phone, c.name, c.variables, c.status, c.attempts])).toEqual([
        [2, '+919876543210', 'Asha Rao', { company: 'Sunrise Dental', city: 'Pune' }, VoiceCampaignContactStatus.PENDING, 0],
        [3, '+919123456789', 'Ben', { company: "Ben's Garage", city: 'Mumbai' }, VoiceCampaignContactStatus.PENDING, 0],
        [7, '+919988776655', 'Farah, Jr.', { company: 'Quote "Co"', city: 'Chennai' }, VoiceCampaignContactStatus.PENDING, 0],
    ]);
});

test('start, pause, resume and cancel', async ({ page, db }) => {
    const { campaignId } = await db.insertVoiceCampaign(
        E2E_USER,
        { name: 'Follow-ups', agentId: new ObjectId(agentId), numberId: new ObjectId(numberId) },
        [{ phone: '+919876543210', name: 'Asha' }, { phone: '+919123456789', name: 'Ben' }],
    );
    const status = async () => (await db.getVoiceCampaigns(E2E_USER))[0].status;

    // Without a Gemini key nothing can run: Start says so and the campaign stays a draft.
    await db.setCampaignGeminiKey(E2E_USER, null);
    await openDetail(page, campaignId);
    await expect(page.getByTestId('campaign-state')).toHaveText('Draft: nobody is called until you start it.');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText(/Add your Gemini API key first/)).toBeVisible();
    expect(await status()).toBe(VoiceCampaignStatus.DRAFT);

    await db.setCampaignGeminiKey(E2E_USER, sealForE2e('AIza-e2e-fake-gemini-key'));
    await openDetail(page, campaignId); // a fresh page: the error toast must not sit over the buttons
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByTestId('campaign-status')).toHaveText('Running');
    expect(await status()).toBe(VoiceCampaignStatus.RUNNING);
    expect((await db.getVoiceCampaigns(E2E_USER))[0].startedAt).toBeTruthy();
    await clearToasts(page);

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByTestId('campaign-status')).toHaveText('Paused');
    await expect(page.getByTestId('campaign-state')).toHaveText('Paused: no new calls until you resume.');
    expect(await status()).toBe(VoiceCampaignStatus.PAUSED);
    await clearToasts(page);

    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByTestId('campaign-status')).toHaveText('Running');
    expect(await status()).toBe(VoiceCampaignStatus.RUNNING);
    await clearToasts(page);

    await page.getByRole('button', { name: 'Cancel campaign' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel campaign' }).click();
    await expect(page.getByTestId('campaign-status')).toHaveText('Cancelled');
    expect(await status()).toBe(VoiceCampaignStatus.CANCELLED);
    const contacts = await db.getVoiceCampaignContacts(campaignId);
    expect(contacts.map((c) => c.status)).toEqual([VoiceCampaignContactStatus.CANCELLED, VoiceCampaignContactStatus.CANCELLED]);
    await expect(page.getByTestId('campaign-contact').first().getByTestId('contact-status')).toHaveText('Cancelled');
    await clearToasts(page);

    // Done with it: delete, back to the (now empty) list.
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(CAMPAIGNS_URL);
    await expect(page.getByTestId('campaigns-empty')).toBeVisible();
    expect(await db.getVoiceCampaigns(E2E_USER)).toHaveLength(0);
    expect(await db.getVoiceCampaignContacts(campaignId)).toHaveLength(0);
});

test.describe('a campaign the engine is running', () => {
    let campaignId: string;
    let contactIds: string[];
    let callId: string;

    test.beforeEach(async ({ db }) => {
        const now = Date.now();
        [callId] = await db.insertVoiceCalls(E2E_USER, [
            {
                agentId: new ObjectId(agentId),
                numberId: new ObjectId(numberId),
                channel: VoiceCallChannel.PHONE,
                direction: VoiceCallDirection.OUTBOUND,
                from: FROM_NUMBER,
                to: '+919876543210',
                voice: 'sulafat',
                startedAt: new Date(now - 120_000),
                endedAt: new Date(now - 60_000),
                durationSec: 60,
                endedBy: 'goodbye',
                flags: [],
                turns: [{ role: 'agent', text: 'You are booked for Thursday at three.' }],
                gapsMs: [],
            },
        ]);
        ({ campaignId, contactIds } = await db.insertVoiceCampaign(
            E2E_USER,
            {
                name: 'Clinic recall',
                agentId: new ObjectId(agentId),
                numberId: new ObjectId(numberId),
                status: VoiceCampaignStatus.RUNNING,
                startedAt: new Date(now - 600_000),
                variableKeys: ['company'],
            },
            [
                {
                    phone: '+919876543210',
                    name: 'Asha',
                    variables: { company: 'Sunrise Dental' },
                    status: VoiceCampaignContactStatus.ANSWERED,
                    attempts: 1,
                    lastOutcome: 'goodbye',
                    lastCallId: new ObjectId(callId),
                    callIds: [new ObjectId(callId)],
                    booked: true,
                },
                {
                    phone: '+919123456789',
                    name: 'Ben',
                    status: VoiceCampaignContactStatus.PENDING,
                    attempts: 1,
                    lastOutcome: 'no_answer',
                    nextAttemptAt: new Date(now + 3_600_000),
                },
                { phone: '+919988776655', name: 'Chen', status: VoiceCampaignContactStatus.UNREACHED, attempts: 2, lastOutcome: 'busy' },
                {
                    phone: '+919811122233',
                    name: 'Dev',
                    status: VoiceCampaignContactStatus.FAILED,
                    attempts: 1,
                    lastOutcome: 'failed',
                    lastError: 'Telnyx refused the call: Dialed number is not included in whitelisted countries',
                },
                { phone: '+919822233344', name: 'Eve', status: VoiceCampaignContactStatus.SKIPPED_DNC, lastOutcome: 'dnc_list' },
                { phone: '+919833344455', name: 'Farah', status: VoiceCampaignContactStatus.CALLING, attempts: 1 },
                { phone: '+919844455566', name: 'Gita' },
            ],
        ));
    });

    test('the list shows its progress: called, answered, booked, failed', async ({ page }) => {
        await page.goto(CAMPAIGNS_URL);
        const card = page.getByTestId('campaign-card');
        await expect(card).toHaveCount(1);
        await expect(card).toContainText('Clinic recall');
        await expect(card.getByTestId('campaign-status')).toHaveText('Running');
        await expect(card).toContainText('Reminder caller');
        await expect(card).toContainText(FROM_NUMBER_SHOWN);
        await expect(card.getByTestId('stat-called')).toContainText('5');
        await expect(card.getByTestId('stat-answered')).toContainText('1');
        await expect(card.getByTestId('stat-booked')).toContainText('1');
        await expect(card.getByTestId('stat-failed')).toContainText('2');
        await expect(card).toContainText('4 of 7 done');
        await expect(card.getByTestId('stat-calling')).toHaveText('1 on a call now');
    });

    test('the detail page shows every contact’s outcome, the do-not-call skip, and links to the call', async ({ page }) => {
        await openDetail(page, campaignId);
        await expect(page.getByTestId('stat-skipped')).toContainText('1');
        await expect(page.getByTestId('stat-pending')).toContainText('2');
        await expect(page.getByTestId('campaign-dnc-note')).toHaveText('1 on the do-not-call list: skipped, never dialled.');

        const rows = page.getByTestId('campaign-contact');
        await expect(rows).toHaveCount(7);
        const row = (name: string) => rows.filter({ hasText: name });
        await expect(row('Asha').getByTestId('contact-status')).toHaveText('Answered');
        await expect(row('Asha').getByTestId('contact-booked')).toHaveText('Booked');
        await expect(row('Asha')).toContainText('company: Sunrise Dental');
        await expect(row('Ben').getByTestId('contact-status')).toHaveText('Waiting');
        await expect(row('Ben').getByTestId('contact-detail')).toContainText('1 call · last: No answer · next try');
        await expect(row('Chen').getByTestId('contact-status')).toHaveText('Not reached');
        await expect(row('Chen').getByTestId('contact-detail')).toHaveText('2 calls · last: Busy');
        await expect(row('Dev').getByTestId('contact-status')).toHaveText('Failed');
        await expect(row('Dev')).toContainText('Dialed number is not included in whitelisted countries');
        await expect(row('Eve').getByTestId('contact-status')).toHaveText('Do not call');
        await expect(row('Eve').getByTestId('contact-detail')).toHaveText('Asked not to be called on an earlier call. Not called.');
        await expect(row('Farah').getByTestId('contact-status')).toHaveText('Calling');
        await expect(row('Gita').getByTestId('contact-detail')).toHaveText('Not called yet');

        await pick(page, '#campaign-contact-filter', /Booked/);
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText('Asha');
        await pick(page, '#campaign-contact-filter', /Do not call/);
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText('Eve');
        await pick(page, '#campaign-contact-filter', /All contacts/);
        await expect(rows).toHaveCount(7);

        await row('Asha').getByTestId('contact-call-link').click();
        await expect(page).toHaveURL(`${CALL_LOGS_URL}/${callId}`);
        await expect(page.getByText('You are booked for Thursday at three.')).toBeVisible();
    });

    test('follows the engine while it runs', async ({ page, db }) => {
        await openDetail(page, campaignId);
        await expect(page.getByTestId('stat-answered')).toContainText('1');
        // The engine settles Farah's call: answered, booked.
        await db.updateVoiceCampaignContact(contactIds[5], {
            status: VoiceCampaignContactStatus.ANSWERED,
            lastOutcome: 'goodbye',
            booked: true,
        });
        await expect(page.getByTestId('stat-answered')).toContainText('2', { timeout: 15_000 });
        await expect(page.getByTestId('stat-booked')).toContainText('2');
        await expect(page.getByTestId('campaign-contact').filter({ hasText: 'Farah' }).getByTestId('contact-status')).toHaveText(
            'Answered',
        );
    });

    test('a campaign the engine paused says why', async ({ page, db }) => {
        await db.insertVoiceCampaign(
            E2E_USER,
            {
                name: 'Paused by the engine',
                agentId: new ObjectId(agentId),
                numberId: new ObjectId(numberId),
                status: VoiceCampaignStatus.PAUSED,
                lastError: '3 calls in a row were refused. Last reason: insufficient balance',
            },
            [{ phone: '+919876543210' }],
        );
        await page.goto(CAMPAIGNS_URL);
        await page.getByRole('link', { name: 'Open Paused by the engine' }).click();
        await expect(page.getByTestId('campaign-error')).toContainText('insufficient balance');
        await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
    });

    test('fits a 390 px phone: list, detail and wizard', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        await page.goto(CAMPAIGNS_URL);
        await expect(page.getByTestId('campaign-card')).toBeVisible();
        expect(await overflow()).toBeLessThanOrEqual(0);
        await openDetail(page, campaignId);
        await expect(page.getByTestId('campaign-contact')).toHaveCount(7);
        expect(await overflow()).toBeLessThanOrEqual(0);
        await page.goto(NEW_CAMPAIGN_URL);
        await waitForHydration(page, '#campaign-name');
        await page.locator('#campaign-name').fill('Phone check');
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await uploadCsv(page);
        await expect(page.getByTestId('csv-ready')).toHaveText('3');
        expect(await overflow()).toBeLessThanOrEqual(0);
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(page.locator('#campaign-start')).toBeVisible();
        expect(await overflow()).toBeLessThanOrEqual(0);
    });
});
