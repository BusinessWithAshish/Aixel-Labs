import { ObjectId } from 'mongodb';
import {
    Modules,
    VOICE_AGENT_SUB_MODULES,
    VoiceAgentCallType,
    VoiceCallChannel,
    VoiceCallDirection,
    VoiceKeyProvider,
    VoiceProvider,
    VoiceStackKind,
} from '@aixellabs/backend/db/types';
import {
    DEFAULT_INBOUND_VOICE_AGENT_PROMPT,
    DEFAULT_VOICE_AGENT_NAME,
    DEFAULT_VOICE_AGENT_PROMPT,
    DEFAULT_VOICE_AGENT_VOICE,
    defaultVoiceBookingTool,
    VOICE_AGENT_PROMPT_TEMPLATES,
} from '@/helpers/voice-agent-defaults';
import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';
import { E2E_GEMINI_API_KEY, USER_STORAGE_STATE } from '../support/env';
import type { E2eDb } from '../support/db';
import { E2E_ADMIN, E2E_USER } from '../support/users';
import { openVoiceAgent, VOICE_AGENTS_URL, voiceAgentUrl, waitForHydration } from '../support/voice-agents';

test.use({ storageState: USER_STORAGE_STATE });

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceAgents(E2E_ADMIN);
    await db.resetVoiceTelephony(E2E_USER);
});

/** A number in the e2e DB only (no provider is called); returns its id. */
function seedNumber(db: E2eDb, phoneNumber: string): Promise<string> {
    return db.insertVoiceNumber(E2E_USER, {
        phoneNumber,
        providerNumberId: `pn-${phoneNumber.slice(-4)}`,
        apiKeySealed: 'not-a-real-key',
    });
}

async function createThroughDialog(page: Page, type: RegExp, name: string, voice: RegExp): Promise<void> {
    await page.goto(VOICE_AGENTS_URL);
    await waitForHydration(page, '[data-testid="new-voice-agent"]');
    await page.getByRole('button', { name: 'New agent' }).click();
    const dialog = page.getByRole('dialog', { name: 'New voice agent' });
    // One step: the call type dropdown (inbound picked), name and voice together.
    const callType = dialog.getByRole('combobox', { name: 'Call type' });
    await expect(callType).toHaveText('Inbound');
    await expect(dialog.getByLabel('Name')).toHaveValue(DEFAULT_VOICE_AGENT_NAME);
    await callType.click();
    // Each option says what it does.
    await expect(page.getByRole('option', { name: /^Outbound/ })).toContainText('Makes calls from your number');
    await page.getByRole('option', { name: type }).click();
    await dialog.getByLabel('Name').fill(name);
    await pickVoice(page, voice);
    await dialog.getByRole('button', { name: 'Create agent' }).click();
    // The first visit to the editor in a run waits for `next dev` to compile it (well over 15 s
    // in a full suite run), so allow for that here rather than in every test.
    await expect(page).toHaveURL(new RegExp(`${VOICE_AGENTS_URL}/[0-9a-f]{24}$`), { timeout: 60_000 });
    await expect(page.locator('#agent-name')).toHaveValue(name);
}

/** Picks a voice in the voice picker (the agent editor's, or the new-agent dialog's). */
async function pickVoice(page: Page, voice: RegExp) {
    await page.getByTestId('voice-picker-trigger').click();
    const picker = page.getByTestId('voice-picker');
    await picker.getByRole('button', { name: voice }).click();
    const save = picker.getByRole('button', { name: 'Save' });
    // Already this agent's voice: nothing to save.
    await ((await save.isEnabled()) ? save : picker.getByRole('button', { name: 'Cancel' })).click();
    await expect(picker).toBeHidden();
}

/** The template picker, opened from the button beside a prompt that has text. */
function templatesDialog(page: Page) {
    return page.getByRole('dialog', { name: 'Templates' });
}

test('a new outbound agent starts with an empty prompt: a template is read in full, then used', async ({ page, db }) => {
    await page.goto(VOICE_AGENTS_URL);
    await expect(page.getByText('No voice agents yet')).toBeVisible();
    await createThroughDialog(page, /^Outbound/, 'Sales caller', /Kore/);

    await expect(page.getByTestId('voice-agent-call-type').first()).toHaveText('Outbound · makes calls');
    const [agent] = await db.getVoiceAgents(E2E_USER);
    const user = await db.getUser(E2E_USER);
    expect(agent).toMatchObject({ name: 'Sales caller', callType: VoiceAgentCallType.OUTBOUND, voice: 'kore', prompt: '' });
    expect(agent).not.toHaveProperty('callNotes');
    expect(agent.userId.equals(user._id)).toBe(true);
    expect(agent.tenantId.equals(user.tenantId)).toBe(true);
    expect(page.url()).toContain(agent._id.toString());
    expect(DEFAULT_VOICE_AGENT_VOICE).toBe('sulafat');

    // Empty: its type's templates are offered, and the playground says plainly why it will not start.
    await expect(page.locator('#agent-prompt')).toHaveValue('');
    await expect(page.getByTestId('prompt-empty')).toContainText('cannot be saved or talked to');
    const playground = page.getByTestId('voice-playground');
    await expect(playground.getByTestId('playground-no-prompt')).toContainText('This agent has no prompt yet');
    await expect(playground.getByRole('button', { name: 'Start call' })).toBeDisabled();
    const cards = page.getByTestId('prompt-templates').getByRole('button').filter({ hasNotText: 'All templates' });
    const outbound = VOICE_AGENT_PROMPT_TEMPLATES.filter((t) => t.callType === VoiceAgentCallType.OUTBOUND);
    await expect(cards).toHaveCount(outbound.length);
    await expect(cards.first()).toContainText('Cold call for a demo');

    // A card opens the preview; Cancel leaves the prompt empty.
    await cards.first().click();
    const dialog = templatesDialog(page);
    await expect(dialog.getByTestId('template-preview')).toContainText('You are Maya, an AI calling assistant');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#agent-prompt')).toHaveValue('');

    // Used: the prompt, and the default for its {{website}} (a campaign's CSV column wins per call).
    await cards.first().click();
    await dialog.getByRole('button', { name: 'Use Cold call for a demo' }).click();
    await expect(page.locator('#agent-prompt')).toHaveValue(DEFAULT_VOICE_AGENT_PROMPT);
    await expect(page.getByLabel('{{website}}')).toHaveValue('none found');
    await expect(page.getByTestId('prompt-templates')).toHaveCount(0);
    await expect(playground.getByTestId('playground-no-prompt')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Agent saved')).toBeVisible();
    expect((await db.getVoiceAgents(E2E_USER))[0]).toMatchObject({
        prompt: DEFAULT_VOICE_AGENT_PROMPT,
        variables: { website: 'none found' },
    });
});

test('templates are grouped by call type; switching to one keeps your own prompt one click away', async ({ page, db }) => {
    await createThroughDialog(page, /^Inbound/, 'Front desk', /Puck/);
    await expect(page.getByTestId('voice-agent-call-type').first()).toHaveText('Inbound · answers calls');
    expect((await db.getVoiceAgents(E2E_USER))[0]).toMatchObject({ callType: VoiceAgentCallType.INBOUND, voice: 'puck' });

    // Every template ends with the facts the owner fills in; none relies on call notes. The new ones
    // stay well under the tested cold call's length.
    for (const template of VOICE_AGENT_PROMPT_TEMPLATES) {
        if (template.id === 'cold-call') continue;
        expect(template.prompt, template.id).toMatch(/# Business facts/);
        expect(template.prompt.length, template.id).toBeLessThan(10_000);
    }
    expect(DEFAULT_VOICE_AGENT_PROMPT).toMatch(/# This call\n\nTheir website: \{\{website\}\}$/);
    expect(VOICE_AGENT_PROMPT_TEMPLATES.length).toBeGreaterThanOrEqual(12);

    await page.getByTestId('prompt-templates').getByRole('button', { name: 'All templates' }).click();
    const dialog = templatesDialog(page);
    const list = dialog.getByTestId('template-list');
    await expect(list.getByRole('button')).toHaveCount(VOICE_AGENT_PROMPT_TEMPLATES.length);
    await expect(list.getByText('Inbound · answers calls')).toBeVisible();
    await expect(list.getByText('Outbound · makes calls')).toBeVisible();
    // Its own type first: the receptionist is picked.
    await expect(list.getByRole('button', { name: 'Receptionist' })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Use Receptionist' }).click();
    await expect(page.locator('#agent-prompt')).toHaveValue(DEFAULT_INBOUND_VOICE_AGENT_PROMPT);
    await expect(page.getByTestId('prompt-alternate')).toHaveCount(0); // nothing of the owner's was replaced

    // Own words, then a template over them: both stay one click apart.
    await page.locator('#agent-prompt').fill('You are the front desk at Sunrise Dental.');
    await page.getByRole('button', { name: 'Templates' }).click();
    await list.getByRole('button', { name: 'Restaurant reservations' }).click();
    await expect(dialog.getByTestId('template-preview')).toContainText('# Business facts');
    await dialog.getByRole('button', { name: 'Use Restaurant reservations' }).click();
    const restaurant = VOICE_AGENT_PROMPT_TEMPLATES.find((t) => t.id === 'restaurant')!;
    await expect(page.locator('#agent-prompt')).toHaveValue(restaurant.prompt);
    const alternate = page.getByTestId('prompt-alternate');
    await expect(alternate).toContainText('Showing Restaurant reservations');
    await alternate.getByRole('button', { name: 'Switch to your prompt' }).click();
    await expect(page.locator('#agent-prompt')).toHaveValue('You are the front desk at Sunrise Dental.');
    await alternate.getByRole('button', { name: 'Switch to Restaurant reservations' }).click();
    await expect(page.locator('#agent-prompt')).toHaveValue(restaurant.prompt);

    // The list says plainly when an agent has no prompt yet.
    await page.getByRole('button', { name: 'Discard' }).click();
    await db.insertVoiceAgent(E2E_USER, { name: 'Blank', prompt: '' });
    await page.goto(VOICE_AGENTS_URL);
    const card = (name: string) => page.getByTestId('voice-agent-card').filter({ hasText: name });
    await expect(card('Front desk').getByTestId('voice-agent-call-type')).toHaveText('Inbound · answers calls');
    await expect(card('Blank')).toContainText('No prompt yet. Open it to pick a template or write one.');
});

test('the type can be changed back in the create dialog', async ({ page, db }) => {
    await page.goto(VOICE_AGENTS_URL);
    await waitForHydration(page, '[data-testid="new-voice-agent"]');
    await page.getByRole('button', { name: 'New agent' }).click();
    const dialog = page.getByRole('dialog', { name: 'New voice agent' });
    const callType = dialog.getByRole('combobox', { name: 'Call type' });
    for (const type of ['Outbound', 'Inbound', 'Outbound']) {
        await callType.click();
        await page.getByRole('option', { name: new RegExp(`^${type}`) }).click();
        await expect(callType).toHaveText(type);
    }
    await dialog.getByRole('button', { name: 'Create agent' }).click();
    await expect(page).toHaveURL(new RegExp(`${VOICE_AGENTS_URL}/[0-9a-f]{24}$`));
    expect((await db.getVoiceAgents(E2E_USER))[0].callType).toBe(VoiceAgentCallType.OUTBOUND);
});

test("list cards show each agent's type; agents saved before types read as outbound", async ({ page, db }) => {
    await db.insertVoiceAgent(E2E_USER, { name: 'Reception', callType: VoiceAgentCallType.INBOUND });
    await db.insertVoiceAgent(E2E_USER, { name: 'Caller', callType: VoiceAgentCallType.OUTBOUND });
    await db.insertLegacyVoiceAgent(E2E_USER, 'Old one');
    await page.goto(VOICE_AGENTS_URL);

    const card = (name: string) => page.getByTestId('voice-agent-card').filter({ hasText: name });
    await expect(card('Reception').getByTestId('voice-agent-call-type')).toHaveText('Inbound · answers calls');
    await expect(card('Caller').getByTestId('voice-agent-call-type')).toHaveText('Outbound · makes calls');
    await expect(card('Old one').getByTestId('voice-agent-call-type')).toHaveText('Outbound · makes calls');
});

test('changing the type keeps the prompt; with numbers linked, saving asks what they should do', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, {
        name: 'Maya',
        callType: VoiceAgentCallType.OUTBOUND,
        prompt: DEFAULT_VOICE_AGENT_PROMPT,
    });
    await openVoiceAgent(page, agentId);
    await expect(page.getByTestId('prompt-templates')).toHaveCount(0);

    // The editor uses the same dropdown as the create dialog.
    const callType = page.getByRole('combobox', { name: 'Call type' });
    await callType.click();
    await page.getByRole('option', { name: /^Inbound/ }).click();
    await expect(callType).toHaveText('Inbound');
    await expect(page.getByTestId('voice-agent-call-type').first()).toHaveText('Inbound · answers calls');
    await expect(page.getByTestId('call-type-note')).toContainText('does not rewrite the prompt');
    await expect(page.locator('#agent-prompt')).toHaveValue(DEFAULT_VOICE_AGENT_PROMPT);
    // Numbers follow the saved type, so they wait for the save.
    await expect(page.getByTestId('agent-numbers-change')).toBeDisabled();

    // No number yet: it just saves.
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Agent saved')).toBeVisible();
    const [agent] = await db.getVoiceAgents(E2E_USER);
    expect(agent.callType).toBe(VoiceAgentCallType.INBOUND);
    expect(agent.prompt).toBe(DEFAULT_VOICE_AGENT_PROMPT);

    // On a number: saving a new type asks first; Cancel saves nothing.
    await db.setVoiceNumberAgents(await seedNumber(db, '+15550100021'), { inboundAgentId: agentId });
    await page.reload();
    await waitForHydration(page, '#agent-prompt');
    await callType.click();
    await page.getByRole('option', { name: /^Outbound/ }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const ask = page.getByRole('dialog', { name: 'Make it outbound?' });
    await expect(ask).toContainText('It is on +15550100021');
    await expect(ask.getByRole('button', { name: 'Switch it' })).toBeVisible();
    await expect(ask.getByRole('button', { name: 'Unlink' })).toBeVisible();
    await ask.getByRole('button', { name: 'Cancel' }).click();
    expect((await db.getVoiceAgents(E2E_USER))[0].callType).toBe(VoiceAgentCallType.INBOUND);

    // Emptying the prompt blocks saving, in plain words.
    await page.locator('#agent-prompt').fill('');
    await expect(page.getByTestId('prompt-empty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('the agent card shows its numbers and its Gemini key, and opens a picker of all numbers', async ({ page, db }) => {
    await db.setVoiceGeminiKey(E2E_USER, E2E_GEMINI_API_KEY);
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya', callType: VoiceAgentCallType.INBOUND });
    const otherId = await db.insertVoiceAgent(E2E_USER, { name: 'Other' });
    const answers = await seedNumber(db, '+15550100001');
    const places = await seedNumber(db, '+15550100002');
    const elsewhere = await seedNumber(db, '+15550100003');
    await db.setVoiceNumberAgents(answers, { inboundAgentId: agentId });
    await db.setVoiceNumberAgents(places, { outboundAgentId: agentId });
    await db.setVoiceNumberAgents(elsewhere, { inboundAgentId: otherId });

    await openVoiceAgent(page, agentId);
    await expect(page.getByTestId('voice-agent-used-on')).toHaveCount(0); // the separate card is gone
    const numbers = page.getByTestId('agent-numbers');
    await expect(numbers.getByTestId('agent-numbers-list')).toHaveText('+15550100001');
    await expect(numbers).toContainText('Calls to these numbers are answered by this agent.');
    // A number left calling with it from before it was inbound is pointed out, with a way out.
    await expect(numbers.getByTestId('agent-numbers-stray')).toContainText('+15550100002 still calls with it');
    await expect(numbers.getByTestId('agent-numbers-stray').getByRole('button', { name: 'Unlink' })).toBeVisible();
    await expect(page.getByTestId('gemini-key-line').first()).toContainText('Runs on your Gemini key ending');
    await expect(page.getByRole('link', { name: 'Manage keys' })).toHaveAttribute(
        'href',
        '/voice-agent/settings#gemini-key',
    );

    await numbers.getByTestId('agent-numbers-change').click();
    const picker = page.getByRole('dialog', { name: 'Numbers it answers' });
    await expect(picker.getByRole('checkbox')).toHaveCount(3);
    await expect(picker.getByRole('checkbox', { name: /\+15550100001/ })).toBeChecked();
    await expect(picker.getByRole('checkbox', { name: /\+15550100003/ })).not.toBeChecked();
    await expect(picker).toContainText('now answers with Other');
    await picker.getByRole('button', { name: 'Cancel' }).click();

    const unusedId = await db.insertVoiceAgent(E2E_USER, { name: 'Unused' });
    await openVoiceAgent(page, unusedId);
    await expect(page.getByTestId('agent-numbers')).toContainText('No number yet: pick the ones it calls from.');
});

test('the cost card is a bill: the voice stack, the prompt, each tool and the phone, then the real average', async ({
    page,
    db,
}) => {
    await db.setVoiceGeminiKey(E2E_USER, E2E_GEMINI_API_KEY);
    // 2,400 characters = 600 tokens, plus the engine's own 600: 1,200 × $0.0000103 = $0.012 a minute.
    const agentId = await db.insertVoiceAgent(E2E_USER, {
        name: 'Maya',
        callType: VoiceAgentCallType.INBOUND,
        prompt: 'x'.repeat(2400),
    });
    await db.setVoiceNumberAgents(await seedNumber(db, '+15550100001'), { inboundAgentId: agentId });

    await openVoiceAgent(page, agentId);
    const card = page.getByTestId('agent-cost-estimate');
    const parts = card.getByTestId('agent-cost-parts');
    // Gemini $0.0224 + prompt $0.0124 + Telnyx in $0.0107 = $0.045 a minute, $0.136 for 3 minutes.
    await expect(parts).toContainText('Gemini 3.8 Live · talk time$0.022');
    await expect(parts).toContainText('Prompt · 1,200 tokens, read every turn$0.012');
    await expect(parts).toContainText('Telnyx · list rate$0.011');
    await expect(card.getByTestId('agent-cost-per-minute')).toHaveText('$0.045');
    await expect(parts).toContainText('A 3-minute call$0.136');
    await expect(card.getByTestId('agent-cost-real')).toHaveText('No calls yet to compare with.');

    // A longer prompt, before saving: 6,000 characters = 2,100 tokens a turn, $0.055 a minute.
    await page.locator('#agent-prompt').fill('y'.repeat(6000));
    await expect(card.getByTestId('agent-cost-per-minute')).toHaveText('$0.055');
    await page.locator('#agent-prompt').fill('x'.repeat(2400)); // back as saved, so leaving asks nothing

    // Booking adds its 525 tokens a turn and two uses a call: $0.006 a minute.
    await db.setVoiceAgentTools(agentId, { booking: { ...defaultVoiceBookingTool('UTC'), enabled: true }, webhooks: [] });
    await openVoiceAgent(page, agentId);
    await expect(parts).toContainText('Booking · 525 tokens a turn, ~2 uses a call$0.006');
    await expect(card.getByTestId('agent-cost-per-minute')).toHaveText('$0.052');

    // A pipeline stack bills its three parts; thinking grows with the prompt (its list rate assumes 1,500
    // tokens a turn), and so do the tools' tokens: $0.0058 + $0.0029 + $0.039 + booking $0.0024 + Telnyx.
    await db.setVoiceAgentFields(agentId, {
        stack: {
            kind: VoiceStackKind.PIPELINE,
            stt: { provider: VoiceKeyProvider.DEEPGRAM, model: 'nova-3' },
            llm: { provider: VoiceKeyProvider.GEMINI, model: 'gemini-3.5-flash-lite' },
            tts: { provider: VoiceKeyProvider.CARTESIA, model: 'sonic-3.6' },
        },
    });
    await openVoiceAgent(page, agentId);
    await expect(parts).toContainText('Speech to text · Deepgram Nova-3$0.006');
    await expect(parts).toContainText('Thinking (LLM) · Gemini 3.5 Flash-Lite, 1,200 tokens a turn$0.003');
    await expect(parts).toContainText('Text to speech · Cartesia Sonic 3.6$0.039');
    await expect(parts).not.toContainText('Gemini 3.8 Live');
    await expect(card.getByTestId('agent-cost-per-minute')).toHaveText('$0.061');
    await db.setVoiceAgentFields(agentId, { stack: null });

    // A free-tier key pays nothing for Gemini; a priced call gives the real average.
    await db.setVoiceGeminiKey(E2E_USER, E2E_GEMINI_API_KEY, { tier: 'free' });
    await db.insertVoiceCalls(E2E_USER, [
        {
            agentId: new ObjectId(agentId),
            channel: VoiceCallChannel.PHONE,
            direction: VoiceCallDirection.INBOUND,
            voice: 'sulafat',
            startedAt: new Date(Date.now() - 5 * 60_000),
            endedAt: new Date(Date.now() - 3 * 60_000),
            durationSec: 120,
            endedBy: 'goodbye',
            flags: [],
            turns: [],
            gapsMs: [],
            cost: {
                totalUsd: 0.06,
                geminiUsd: 0.04,
                geminiFreeTier: false,
                geminiTokens: { textIn: 1, audioIn: 1, textOut: 1, audioOut: 1 },
                provider: VoiceProvider.TELNYX,
                providerUsd: 0.02,
                providerExact: false,
            },
        },
    ]);
    await openVoiceAgent(page, agentId);
    await expect(parts).toContainText('Gemini 3.8 Live · free-tier key$0.000');
    await expect(card.getByTestId('agent-cost-per-minute')).toHaveText('$0.011');
    await expect(card.getByTestId('agent-cost-real')).toHaveText(
        'Real so far: $0.030 a minute over 1 call (phone part partly estimated).',
    );
    await db.setVoiceGeminiKey(E2E_USER, E2E_GEMINI_API_KEY); // the seeded paid key, for the specs after this one
});

test('edits and saves every field', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya', prompt: 'Old prompt.' });
    const before = (await db.getVoiceAgents(E2E_USER))[0].updatedAt;
    await openVoiceAgent(page, agentId);

    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();
    await expect(page.locator('#agent-call-notes')).toHaveCount(0);

    await page.locator('#agent-name').fill('Maya v2');
    await pickVoice(page, /^Puck/);
    await page.locator('#agent-prompt').fill('You are Maya. Be brief.');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();

    await save.click();
    await expect(page.getByText('Agent saved')).toBeVisible();
    await expect(save).toBeDisabled();

    const [agent] = await db.getVoiceAgents(E2E_USER);
    expect(agent).toMatchObject({ name: 'Maya v2', voice: 'puck', prompt: 'You are Maya. Be brief.' });
    expect(agent.updatedAt.getTime()).toBeGreaterThan(before.getTime());

    await page.goto(VOICE_AGENTS_URL);
    const card = page.getByTestId('voice-agent-card');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Maya v2');
    await expect(card).toContainText('Puck');
    await expect(card).toContainText('Upbeat');
    await expect(card.getByTestId('voice-agent-call-type')).toHaveText('Outbound · makes calls');
});

test('will not save an agent without a name', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya' });
    await openVoiceAgent(page, agentId);

    await page.locator('#agent-name').fill('   ');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    expect((await db.getVoiceAgents(E2E_USER))[0].name).toBe('Maya');
});

test('Delete sits beside Save; deleting lets its numbers go, and keeps it when a number cannot be let go', async ({
    page,
    db,
}) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Short lived' });
    const keepId = await db.insertVoiceAgent(E2E_USER, { name: 'Keeper' });
    const both = await seedNumber(db, '+15550100011');
    const mixed = await seedNumber(db, '+15550100012');
    await db.setVoiceNumberAgents(both, { inboundAgentId: agentId });
    await db.setVoiceNumberAgents(mixed, { inboundAgentId: keepId, outboundAgentId: agentId });
    await openVoiceAgent(page, agentId);

    // It answers +15550100011, whose provider account cannot be reached here: nothing is deleted.
    await page.getByRole('button', { name: 'Delete agent' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete agent' }).click();
    await expect(page.locator('[data-sonner-toast][data-type="error"]').first()).toBeVisible();
    expect((await db.getVoiceAgents(E2E_USER)).map((a) => a.name)).toEqual(['Short lived', 'Keeper']);

    // Once nothing answers with it, it goes, and it is taken off the numbers it called from.
    await db.setVoiceNumberAgents(both, { inboundAgentId: null });
    await page.reload();
    await waitForHydration(page, '#agent-prompt');
    await page.getByRole('button', { name: 'Delete agent' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete agent' }).click();

    await expect(page).toHaveURL(new RegExp(`${VOICE_AGENTS_URL}$`));
    await expect(page.getByTestId('voice-agent-card')).toHaveCount(1);
    expect((await db.getVoiceAgents(E2E_USER)).map((a) => a.name)).toEqual(['Keeper']);

    const numbers = await db.getVoiceNumbers(E2E_USER);
    const byPhone = (phone: string) => numbers.find((n) => n.phoneNumber === phone);
    expect(byPhone('+15550100012')?.inboundAgentId?.toString()).toBe(keepId);
    expect(byPhone('+15550100012')?.outboundAgentId).toBeNull();
});

test("another user's agent is not found", async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_ADMIN, { name: 'Admin only' });
    await page.goto(voiceAgentUrl(agentId));
    await expect(page.getByText('Admin only')).toHaveCount(0);
    await expect(page.locator('#agent-prompt')).toHaveCount(0);
    await page.goto(VOICE_AGENTS_URL);
    await expect(page.getByText('No voice agents yet')).toBeVisible();
});

test.describe('module access', () => {
    test.afterEach(async ({ db }) => db.resetUser(E2E_USER));

    test('a user granted only Agents can open an agent', async ({ page, db }) => {
        await db.resetUser(E2E_USER, { moduleAccess: { [Modules.VOICE_AGENT]: [VOICE_AGENT_SUB_MODULES.AGENTS] } });
        const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Granted' });
        await openVoiceAgent(page, agentId);
        await expect(page.locator('#agent-name')).toHaveValue('Granted');
    });

    test('a user without Agents gets a 404', async ({ page, db }) => {
        await db.resetUser(E2E_USER, {
            moduleAccess: { [Modules.VOICE_AGENT]: [VOICE_AGENT_SUB_MODULES.CALL_LOGS] },
        });
        const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Hidden' });
        await page.goto(voiceAgentUrl(agentId));
        await expect(page.getByRole('heading', { name: '404 - Page Not Found' }).first()).toBeVisible();
        await expect(page.locator('#agent-prompt')).toHaveCount(0);
    });
});
