import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ObjectId } from 'mongodb';
import type { Page } from '@playwright/test';
import {
    VoiceAgentCallType,
    VoiceCallChannel,
    VoiceCallDirection,
    VoiceVoicemailAction,
    type VoiceCallDoc,
} from '@aixellabs/backend/db/types';
import { SUGGESTED_VOICEMAIL_MESSAGE } from '@/helpers/voice-agent-features';
import type { E2eDb } from '../support/db';
import { expect, test } from '../support/fixtures';
import { E2E_ARTIFACTS_DIR, USER_STORAGE_STATE } from '../support/env';
import { openVoiceAgent, waitForHydration } from '../support/voice-agents';
import { E2E_USER } from '../support/users';
import {
    CALL_LOGS_URL,
    FAKE_TELNYX_KEY,
    FakeTelnyx,
    FakeVoiceEngine,
    PHONE_NUMBERS_URL,
    sealForE2e,
} from './fake-telephony';

/**
 * Agent features the engine applies per call: `{{variables}}` (editor marks, "{{" menu, default values,
 * a test call's own values), call settings (voicemail message, post-call analysis, caller memory), and
 * what the analysis and memory show in Call logs. Screenshots land in node_modules/.cache/e2e/agent-features.
 */
test.use({ storageState: USER_STORAGE_STATE, timezoneId: 'Asia/Kolkata' });

const SHOTS = path.join(E2E_ARTIFACTS_DIR, 'agent-features');
const MINUTE = 60_000;
const CALLER = '+14155550123';
const NUMBER = '+13473703925';

let telnyx: FakeTelnyx;
let engine: FakeVoiceEngine;

test.beforeAll(async () => {
    telnyx = await FakeTelnyx.start();
    engine = await FakeVoiceEngine.start();
    await mkdir(SHOTS, { recursive: true });
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
    await db.resetVoiceCallerMemories(E2E_USER);
});

const promptBox = (page: Page) => page.locator('#agent-prompt');
const variableMark = (page: Page, name: string) =>
    page.getByTestId('prompt-mirror').locator(`mark[data-variable="${name}"]`);

async function typeAtEnd(page: Page, text: string): Promise<void> {
    await promptBox(page).focus();
    await promptBox(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
    await page.keyboard.type(text);
}

async function shot(page: Page, name: string, width?: number): Promise<void> {
    if (width) await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

test('the prompt marks {{variables}}, offers them after "{{", and saves default values', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, {
        name: 'Sales',
        prompt: 'Hi {{first_name}}, this is {{agent_name}} from {{ company }}. Today is {{weekday}}.\nLead source: {{source}}',
    });
    await openVoiceAgent(page, agentId);

    // Built-ins always have a value; custom ones without a default are flagged.
    await expect(variableMark(page, 'agent_name')).not.toHaveAttribute('data-problem');
    await expect(variableMark(page, 'weekday')).not.toHaveAttribute('data-problem');
    await expect(variableMark(page, 'company')).toHaveAttribute('data-problem', /No default value/);
    const problem = page.getByTestId('prompt-variable-problem');
    await expect(problem).toContainText('{{first_name}}, {{company}}');
    // A variable's name is not taken for a tool name.
    await expect(page.getByTestId('prompt-mirror').locator('mark[data-tool]')).toHaveCount(0);

    // One input per custom variable in the prompt.
    const rows = page.getByTestId('agent-variable');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveAttribute('data-variable', 'first_name');
    await expect(rows.nth(2)).toHaveAttribute('data-variable', 'source');
    await page.getByLabel('{{company}}').fill('Acme Dental');
    await expect(variableMark(page, 'company')).not.toHaveAttribute('data-problem');
    await expect(problem).toContainText('{{first_name}}');
    await expect(problem).not.toContainText('{{company}}');

    // "{{" opens the variable menu; Enter inserts the whole placeholder.
    await typeAtEnd(page, ' Call {{ag');
    const menu = page.getByRole('listbox', { name: 'Insert a variable' });
    await expect(menu.getByRole('option').first()).toContainText('{{agent_name}}');
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect(promptBox(page)).toHaveValue(/Call \{\{agent_name\}\}$/);
    await typeAtEnd(page, ' {{');
    await expect(menu.getByRole('option')).toHaveCount(9); // six built-ins and the three custom ones
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await page.screenshot({ path: path.join(SHOTS, 'editor-variables.png') });

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Agent saved')).toBeVisible();
    const [saved] = await db.getVoiceAgents(E2E_USER);
    expect(saved.variables).toEqual({ company: 'Acme Dental' });
    expect(saved.prompt).toContain('Call {{agent_name}} {{');
});

test('call settings: who speaks first, personality, voicemail message, analysis fields and caller memory are saved together', async ({
    page,
    db,
}) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Sales', prompt: 'You call for {{company}}.' });
    await openVoiceAgent(page, agentId);
    const card = page.getByTestId('call-settings');
    await card.scrollIntoViewIfNeeded();

    // Save and Discard sit at the top right of the card; nothing to save yet.
    await expect(card.getByRole('button', { name: 'Save settings' })).toBeDisabled();
    await expect(card.getByRole('button', { name: 'Discard settings' })).toHaveCount(0);
    // The analysis runs on the owner's Gemini key: what it should cost a call.
    await expect(card.getByTestId('analysis-cost')).toHaveText(/^About \S+ a call on your Gemini key\./);
    // Silence and time limit: the inputs line up even though their descriptions differ in length.
    const tops = await Promise.all(
        ['#speech-silence-secs', '#speech-max-call-minutes'].map((id) =>
            card.locator(id).evaluate((el) => el.getBoundingClientRect().top),
        ),
    );
    expect(Math.abs(tops[0] - tops[1])).toBeLessThan(1);
    // Each says its range, and the schema holds it.
    await expect(card).toContainText('5–60 seconds, or 0 for never.');
    await expect(card).toContainText('1–120 minutes, or 0 for no limit.');
    await card.locator('#speech-silence-secs').fill('3');
    await expect(card.getByTestId('call-settings-error')).toHaveText('Silence is 5 to 60 seconds, or 0 for never');
    await card.locator('#speech-silence-secs').fill('0');
    await card.locator('#speech-max-call-minutes').fill('121');
    await expect(card.getByTestId('call-settings-error')).toHaveText(
        'The time limit is 1 to 120 minutes, or 0 for no limit',
    );
    await card.locator('#speech-max-call-minutes').fill('0');
    await expect(card.getByTestId('call-settings-error')).toHaveCount(0);
    // Never set up: an outbound agent waits for the callee's hello; personality as the prompt says.
    const firstSpeaker = card.getByTestId('first-speaker');
    await expect(firstSpeaker).toContainText('When the person this agent calls picks up.');
    await expect(firstSpeaker.getByRole('radio', { name: /Wait for their/ })).toHaveAttribute('aria-checked', 'true');
    await expect(card.locator('#speech-tone')).toHaveText('As the prompt says');
    await expect(card.locator('#speech-pace')).toHaveText('Normal');
    await expect(card.locator('#speech-reply-length')).toHaveText('Normal');
    await firstSpeaker.getByRole('radio', { name: /Speak as soon as they pick up/ }).click();
    await card.locator('#speech-tone').click();
    await page.getByRole('option', { name: 'Warm' }).click();
    await card.locator('#speech-reply-length').click();
    await page.getByRole('option', { name: /^Brief/ }).click();
    // Never set up: hang up on voicemail, summary only, no memory.
    await expect(card.getByRole('radio', { name: /Hang up/ })).toHaveAttribute('aria-checked', 'true');
    await expect(card.getByRole('switch', { name: 'Summary' })).toBeChecked();
    await expect(card.getByRole('switch', { name: 'Sentiment' })).not.toBeChecked();
    await expect(card.getByRole('switch', { name: 'Remember callers' })).not.toBeChecked();

    await card.getByRole('radio', { name: /Leave a message/ }).click();
    const message = card.getByLabel('Message', { exact: true });
    await expect(message).toHaveValue(SUGGESTED_VOICEMAIL_MESSAGE);
    await message.fill('Hi {{first_name}}, this is {{agent_name}} from {{company}}. Call me back!');
    // A variable only the voicemail message uses still gets a default-value input.
    await expect(page.getByTestId('agent-variable')).toHaveCount(2);

    await card.getByRole('switch', { name: 'Sentiment' }).click();
    await card.getByRole('switch', { name: 'Call successful' }).click();
    await expect(card.getByTestId('call-settings-error')).toHaveText('Say what makes a call successful');
    await expect(card.getByRole('button', { name: 'Save settings' })).toBeDisabled();
    await card.getByLabel('A call is successful when').fill('They agreed to a demo.');

    await card.getByRole('button', { name: 'Add field' }).click();
    await card.getByLabel('Field 1 name').fill('Budget');
    await expect(card.getByLabel('Field 1 name')).toHaveValue('budget');
    await card.getByLabel('Field 1 description').fill('Monthly budget they mentioned, in rupees');
    await card.getByRole('combobox', { name: 'Field 1 type' }).click();
    await page.getByRole('option', { name: 'Number' }).click();
    await card.getByRole('button', { name: 'Add field' }).click();
    await card.getByLabel('Field 2 name').fill('interest');
    await card.getByLabel('Field 2 description').fill('How interested they sounded');
    await card.getByRole('combobox', { name: 'Field 2 type' }).click();
    await page.getByRole('option', { name: 'Choice' }).click();
    await card.getByLabel('Field 2 answers').fill('High');
    await expect(card.getByTestId('call-settings-error')).toHaveText('Give interest at least two answers to choose from');
    await card.getByLabel('Field 2 answers').fill('High, Medium, Low');
    await card.getByRole('switch', { name: 'Remember callers' }).click();
    await expect(card.getByTestId('call-settings-error')).toHaveCount(0);
    await card.screenshot({ path: path.join(SHOTS, 'call-settings.png') });

    await card.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Call settings saved')).toBeVisible();
    await expect(card.getByText('Unsaved changes')).toHaveCount(0);
    const [saved] = await db.getVoiceAgents(E2E_USER);
    expect(saved.voicemail).toEqual({
        action: VoiceVoicemailAction.MESSAGE,
        message: 'Hi {{first_name}}, this is {{agent_name}} from {{company}}. Call me back!',
    });
    expect(saved.analysis).toEqual({
        summary: true,
        sentiment: true,
        success: true,
        successDefinition: 'They agreed to a demo.',
        fields: [
            { name: 'budget', type: 'number', description: 'Monthly budget they mentioned, in rupees' },
            {
                name: 'interest',
                type: 'choice',
                description: 'How interested they sounded',
                options: ['High', 'Medium', 'Low'],
            },
        ],
    });
    expect(saved.memory).toBe(true);
    expect(saved.speech).toMatchObject({ firstSpeaker: 'AGENT', tone: 'WARM', pace: 'NORMAL', replyLength: 'BRIEF' });

    // It loads back as saved.
    await openVoiceAgent(page, agentId);
    await expect(page.getByTestId('analysis-field')).toHaveCount(2);
    await expect(page.getByLabel('Field 2 answers')).toHaveValue('High, Medium, Low');
    await expect(page.getByRole('switch', { name: 'Remember callers' })).toBeChecked();
    await expect(page.getByRole('radio', { name: /Speak as soon as they pick up/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#speech-tone')).toHaveText('Warm');
});

test('the editor lists the callers an agent remembers, and forgets one or everyone', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Front desk', callType: VoiceAgentCallType.INBOUND });
    const otherId = await db.insertVoiceAgent(E2E_USER, { name: 'Other' });
    await db.setVoiceAgentFields(agentId, { memory: true });
    const now = Date.now();
    for (const [i, phone] of ['+14155550101', '+14155550102', '+14155550103'].entries()) {
        await db.insertVoiceCallerMemory(E2E_USER, {
            agentId: new ObjectId(agentId),
            phone,
            brief: `Caller ${i + 1}: asked about Saturday appointments.`,
            lastCallId: new ObjectId(),
            lastCallAt: new Date(now - i * 24 * 60 * MINUTE),
            calls: i + 1,
        });
    }
    // Another agent's memory of the same number is its own.
    await db.insertVoiceCallerMemory(E2E_USER, {
        agentId: new ObjectId(otherId),
        phone: '+14155550101',
        brief: 'Not this agent.',
        lastCallId: new ObjectId(),
        lastCallAt: new Date(now),
    });
    await openVoiceAgent(page, agentId);
    // Calls coming in are always answered by the agent: no voicemail section for an inbound agent.
    await expect(page.getByTestId('speech-settings')).toBeVisible();
    await expect(page.getByTestId('voicemail-settings')).toHaveCount(0);
    // An inbound agent greets as it picks up unless told to wait for the caller.
    const firstSpeaker = page.getByTestId('first-speaker');
    await expect(firstSpeaker).toContainText('When someone calls this agent’s number.');
    await expect(firstSpeaker.getByRole('radio', { name: /Agent greets the caller/ })).toHaveAttribute(
        'aria-checked',
        'true',
    );
    await expect(firstSpeaker.getByRole('radio', { name: /Wait for the caller/ })).toHaveAttribute('aria-checked', 'false');

    const list = page.getByTestId('memory-list');
    await expect(list).toContainText('Remembers 3 callers');
    await expect(list.getByTestId('memory-row')).toHaveCount(3);
    await expect(list.getByTestId('memory-row').first()).toContainText('+14155550101');
    await expect(list.getByTestId('memory-row').first()).toContainText('Caller 1: asked about Saturday appointments.');
    await expect(list).not.toContainText('Not this agent.');

    await list.getByRole('button', { name: 'Forget +14155550102' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Forget caller' }).click();
    await expect(page.getByText('Forgot +14155550102')).toBeVisible();
    await expect(list.getByTestId('memory-row')).toHaveCount(2);
    expect((await db.getVoiceCallerMemories(E2E_USER)).map((m) => m.phone).sort()).toEqual([
        '+14155550101',
        '+14155550101',
        '+14155550103',
    ]);

    await list.getByRole('button', { name: 'Forget everyone' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Forget everyone' }).click();
    await expect(page.getByText('Forgot 2 callers')).toBeVisible();
    await expect(page.getByTestId('memory-list')).toHaveCount(0);
    await expect(page.getByTestId('memory-settings')).toContainText('No callers remembered yet.');
    const left = await db.getVoiceCallerMemories(E2E_USER);
    expect(left.map((m) => m.brief)).toEqual(['Not this agent.']);
});

type SeedCall = Omit<VoiceCallDoc, '_id' | 'tenantId' | 'userId'>;

function call(fields: Partial<SeedCall> & Pick<SeedCall, 'agentId' | 'startedAt'>): SeedCall {
    const durationSec = fields.durationSec ?? 40;
    return {
        channel: VoiceCallChannel.PHONE,
        direction: VoiceCallDirection.OUTBOUND,
        voice: 'sulafat',
        from: NUMBER,
        to: CALLER,
        endedAt: new Date(fields.startedAt.getTime() + durationSec * 1000),
        durationSec,
        endedBy: 'goodbye',
        flags: [],
        turns: [
            { role: 'agent', text: 'Hi Ravi, this is Maya from Acme Dental.' },
            { role: 'caller', text: 'Oh hi. Yes, I can do a demo on Thursday.' },
        ],
        gapsMs: [700],
        ...fields,
    };
}

async function seedAnalysedCalls(db: E2eDb) {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Sales' });
    const now = Date.now();
    const ids = await db.insertVoiceCalls(E2E_USER, [
        call({
            agentId: new ObjectId(agentId),
            startedAt: new Date(now - 5 * MINUTE),
            variables: { first_name: 'Ravi', company: 'Acme Dental' },
            analysis: {
                summary: 'Ravi agreed to a demo on Thursday at 2 pm and asked for pricing by email.',
                sentiment: 'positive',
                successful: true,
                fields: { budget: 5000, interest: 'High', wants_email: true, next_step: null },
                model: 'gemini-3.5-flash-lite',
            },
            memoryUsed: {
                brief: 'Ravi runs Acme Dental; prefers calls after 5 pm.',
                lastCallAt: new Date(now - 3 * 24 * 60 * MINUTE),
            },
        }),
        call({
            agentId: new ObjectId(agentId),
            to: '+14155550188',
            startedAt: new Date(now - 30 * MINUTE),
            endedBy: 'voicemail_message',
            voicemailMessage: 'Hi Asha, this is Maya from Acme Dental. Please call me back.',
            turns: [{ role: 'caller', text: "You've reached Asha, leave a message after the tone." }],
            analysis: {
                summary: 'Reached voicemail; a message was left asking Asha to call back.',
                sentiment: 'neutral',
                successful: false,
                fields: {},
                model: 'gemini-3.5-flash-lite',
            },
        }),
        call({
            agentId: new ObjectId(agentId),
            to: '+14155550199',
            startedAt: new Date(now - 60 * MINUTE),
            analysis: { model: 'gemini-3.5-flash-lite', error: 'Gemini refused the analysis: quota exceeded' },
        }),
        call({ agentId: new ObjectId(agentId), to: '+14155550177', startedAt: new Date(now - 90 * MINUTE) }),
    ]);
    return { agentId, ids };
}

test('call logs show each call’s summary and verdicts, and filter by success', async ({ page, db }) => {
    await seedAnalysedCalls(db);
    await page.goto(CALL_LOGS_URL);
    await waitForHydration(page, '#header');

    const cards = page.getByTestId('call-card');
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0).getByTestId('call-success')).toHaveText('Successful');
    await expect(cards.nth(0).getByTestId('call-sentiment')).toHaveText('Positive');
    await expect(cards.nth(1).getByTestId('call-success')).toHaveText('Not successful');
    await expect(cards.nth(1)).toContainText('Left a voicemail');
    // A failed or missing analysis shows no verdicts.
    await expect(cards.nth(2).getByTestId('call-success')).toHaveCount(0);
    await expect(cards.nth(3).getByTestId('call-sentiment')).toHaveCount(0);
    const summaries = page.getByTestId('call-summary');
    await expect(summaries).toHaveCount(2);
    await expect(summaries.nth(0)).toHaveText('Ravi agreed to a demo on Thursday at 2 pm and asked for pricing by email.');
    await shot(page, 'call-logs-desktop');

    await page.getByRole('combobox', { name: 'Outcome' }).click();
    await page.getByRole('option', { name: 'Successful', exact: true }).click();
    await expect(page).toHaveURL(/\?success=yes$/);
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(CALLER);

    await page.getByRole('combobox', { name: 'Outcome' }).click();
    await page.getByRole('option', { name: 'Not successful' }).click();
    await expect(page).toHaveURL(/\?success=no$/);
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('+14155550188');

    // The outcome filter combines with the agent filter in the URL.
    await page.getByRole('combobox', { name: 'Agent' }).click();
    await page.getByRole('option', { name: 'Sales', exact: true }).click();
    await expect(page).toHaveURL(/\?agent=[0-9a-f]{24}&success=no$/);
    await expect(cards).toHaveCount(1);

    await page.getByRole('combobox', { name: 'Outcome' }).click();
    await page.getByRole('option', { name: 'All outcomes' }).click();
    await expect(page).toHaveURL(/\?agent=[0-9a-f]{24}$/);
    await expect(cards).toHaveCount(4);

    // Phone: the same cards carry the summary and badges too.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(cards.first().getByTestId('call-summary')).toBeVisible();
    await expect(cards.first().getByTestId('call-success')).toBeVisible();
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(1);
    await shot(page, 'call-logs-390');
});

test('a call shows its analysis, the voicemail message, its variables and the caller memory, which can be forgotten', async ({
    page,
    db,
}) => {
    const { agentId, ids } = await seedAnalysedCalls(db);
    await db.insertVoiceCallerMemory(E2E_USER, {
        agentId: new ObjectId(agentId),
        phone: CALLER,
        brief: 'Ravi runs Acme Dental; demo booked Thursday 2 pm; wants pricing by email.',
        lastCallId: new ObjectId(ids[0]),
        lastCallAt: new Date(),
        calls: 2,
    });

    await page.goto(`${CALL_LOGS_URL}/${ids[0]}`);
    await waitForHydration(page, '#header');
    const analysis = page.getByTestId('call-analysis');
    await expect(analysis).toContainText('Ravi agreed to a demo on Thursday at 2 pm');
    await expect(analysis.getByTestId('call-success')).toHaveText('Successful');
    await expect(analysis.getByTestId('call-sentiment')).toHaveText('Positive');
    const fields = analysis.getByTestId('call-analysis-field');
    await expect(fields).toHaveText(['budget5000', 'interestHigh', 'wants_emailYes', 'next_step—']);

    const variables = page.getByTestId('call-variables');
    await expect(variables).toContainText('{{first_name}}Ravi');
    await expect(variables).toContainText('{{company}}Acme Dental');

    const memory = page.getByTestId('call-memory');
    await expect(memory.getByTestId('call-memory-used')).toContainText('Ravi runs Acme Dental; prefers calls after 5 pm.');
    await expect(memory.getByTestId('call-memory-now')).toContainText('demo booked Thursday 2 pm');
    await expect(memory.getByTestId('call-memory-now')).toContainText('2 calls');
    await shot(page, 'call-detail-desktop');
    await shot(page, 'call-detail-390', 390);
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(1);

    await memory.getByRole('button', { name: 'Forget this caller' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Forget caller' }).click();
    await expect(page.getByText(`Forgot ${CALLER}`)).toBeVisible();
    await expect(memory.getByTestId('call-memory-now')).toHaveCount(0);
    await expect(memory).toContainText('Nothing is remembered about this number now.');
    expect(await db.getVoiceCallerMemories(E2E_USER)).toHaveLength(0);

    // The voicemail call: the message she left, in the summary.
    await page.goto(`${CALL_LOGS_URL}/${ids[1]}`);
    await waitForHydration(page, '#header');
    await expect(page.getByTestId('call-voicemail-message')).toContainText(
        '“Hi Asha, this is Maya from Acme Dental. Please call me back.”',
    );
    await expect(page.getByTestId('call-memory')).toHaveCount(0);

    // A failed analysis says why.
    await page.goto(`${CALL_LOGS_URL}/${ids[2]}`);
    await waitForHydration(page, '#header');
    await expect(page.getByTestId('call-analysis-error')).toContainText('quota exceeded');
});

test('a test call sends the values typed for the agent’s variables', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, {
        name: 'Sales',
        prompt: 'Ask for {{first_name}} at {{company}}. It is {{weekday}}.',
    });
    await db.setVoiceAgentFields(agentId, { variables: { company: 'Acme Dental' } });
    const numberId = await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: NUMBER,
        providerNumberId: '1293384261075731499',
        apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
        outboundAgentId: new ObjectId(agentId),
    });
    await page.goto(PHONE_NUMBERS_URL);
    await waitForHydration(page, '#header');

    await page
        .getByTestId('voice-number-row')
        .filter({ hasText: NUMBER })
        .getByRole('button', { name: 'Test call' })
        .click();
    const dialog = page.getByRole('dialog', { name: 'Test call' });
    const fieldset = dialog.getByTestId('test-call-variables');
    // Custom variables only (no built-ins), the default shown as the placeholder.
    await expect(fieldset.getByRole('textbox')).toHaveCount(2);
    await expect(fieldset.getByLabel('{{company}}')).toHaveAttribute('placeholder', 'Acme Dental');
    await expect(fieldset.getByLabel('{{first_name}}')).toHaveAttribute('placeholder', 'Empty');
    await fieldset.getByLabel('{{first_name}}').fill('  Ravi ');
    await dialog.getByLabel('Your phone number').fill(CALLER);
    await dialog.screenshot({ path: path.join(SHOTS, 'test-call-variables.png') });
    await dialog.getByRole('button', { name: 'Call me now' }).click();
    await expect(dialog.getByRole('status')).toContainText(`Calling ${CALLER} now`);

    expect(engine.requests).toHaveLength(1);
    // The empty one is left to the agent's default, which the engine fills in.
    expect(engine.requests[0].body).toEqual({ numberId, to: CALLER, agentId, variables: { first_name: 'Ravi' } });
});

test('the editor at 390 px: variables and call settings fit without sideways scrolling', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Sales', prompt: 'Hi {{first_name}} from {{company}}.' });
    await db.setVoiceAgentFields(agentId, {
        memory: true,
        voicemail: { action: VoiceVoicemailAction.MESSAGE, message: 'Hi {{first_name}}, call me back.' },
        analysis: {
            summary: true,
            sentiment: true,
            success: true,
            successDefinition: 'A demo was booked.',
            fields: [{ name: 'interest', type: 'choice', description: 'How interested', options: ['High', 'Low'] }],
        },
    });
    await db.insertVoiceCallerMemory(E2E_USER, {
        agentId: new ObjectId(agentId),
        phone: CALLER,
        brief: 'Ravi runs Acme Dental; demo booked Thursday 2 pm; wants pricing by email before the call.',
        lastCallId: new ObjectId(),
        lastCallAt: new Date(),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await openVoiceAgent(page, agentId);
    await expect(page.getByTestId('call-settings')).toBeVisible();
    const overflow = await page.evaluate(() => {
        const box = document.getElementById('page-children-container') ?? document.documentElement;
        return Math.max(
            box.scrollWidth - box.clientWidth,
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
    });
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByTestId('agent-variables').screenshot({ path: path.join(SHOTS, 'editor-variables-390.png') });
    await page.getByTestId('call-settings').screenshot({ path: path.join(SHOTS, 'call-settings-390.png') });
});
