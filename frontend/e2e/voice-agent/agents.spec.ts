import { Modules, VOICE_AGENT_SUB_MODULES, VoiceAgentCallType } from '@aixellabs/backend/db/types';
import {
    DEFAULT_INBOUND_VOICE_AGENT_CALL_NOTES,
    DEFAULT_INBOUND_VOICE_AGENT_PROMPT,
    DEFAULT_VOICE_AGENT_CALL_NOTES,
    DEFAULT_VOICE_AGENT_PROMPT,
    DEFAULT_VOICE_AGENT_VOICE,
} from '@/helpers/voice-agent-defaults';
import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
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
    // Step one: the two big choices, nothing else.
    await expect(dialog.getByRole('radio')).toHaveCount(2);
    await expect(dialog.getByLabel('Name')).toHaveCount(0);
    await dialog.getByRole('radio', { name: type }).click();
    // Step two: name and voice.
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByLabel('Voice').click();
    await page.getByRole('option', { name: voice }).click();
    await dialog.getByRole('button', { name: 'Create agent' }).click();
    // The first visit to the editor in a run waits for `next dev` to compile it (well over 15 s
    // in a full suite run), so allow for that here rather than in every test.
    await expect(page).toHaveURL(new RegExp(`${VOICE_AGENTS_URL}/[0-9a-f]{24}$`), { timeout: 60_000 });
    await expect(page.locator('#agent-name')).toHaveValue(name);
}

test('a new outbound agent starts with an empty prompt: nothing runs until a template or own text fills it', async ({
    page,
    db,
}) => {
    await page.goto(VOICE_AGENTS_URL);
    await expect(page.getByText('No voice agents yet')).toBeVisible();
    await createThroughDialog(page, /^Outbound/, 'Sales caller', /Kore/);

    await expect(page.getByTestId('voice-agent-call-type').first()).toHaveText('Outbound · makes calls');
    const [agent] = await db.getVoiceAgents(E2E_USER);
    const user = await db.getUser(E2E_USER);
    expect(agent).toMatchObject({
        name: 'Sales caller',
        callType: VoiceAgentCallType.OUTBOUND,
        voice: 'kore',
        prompt: '',
        callNotes: '',
    });
    expect(agent.userId.equals(user._id)).toBe(true);
    expect(agent.tenantId.equals(user.tenantId)).toBe(true);
    expect(page.url()).toContain(agent._id.toString());
    expect(DEFAULT_VOICE_AGENT_VOICE).toBe('sulafat');

    // Empty: the templates are offered, and the playground says plainly why it will not start.
    await expect(page.locator('#agent-prompt')).toHaveValue('');
    await expect(page.getByTestId('prompt-empty')).toContainText('cannot be saved or talked to');
    const playground = page.getByTestId('voice-playground');
    await expect(playground.getByTestId('playground-no-prompt')).toContainText('This agent has no prompt yet');
    await expect(playground.getByRole('button', { name: 'Start call' })).toBeDisabled();

    // Outbound templates first; picking one fills the empty prompt and notes at once.
    const templates = page.getByTestId('prompt-templates').getByRole('button');
    await expect(templates.first()).toContainText('Cold call for a demo');
    await templates.first().click();
    await expect(page.locator('#agent-prompt')).toHaveValue(DEFAULT_VOICE_AGENT_PROMPT);
    await expect(page.locator('#agent-call-notes')).toHaveValue(DEFAULT_VOICE_AGENT_CALL_NOTES);
    await expect(page.getByTestId('prompt-templates')).toHaveCount(0);
    await expect(playground.getByTestId('playground-no-prompt')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Agent saved')).toBeVisible();
    expect((await db.getVoiceAgents(E2E_USER))[0]).toMatchObject({
        prompt: DEFAULT_VOICE_AGENT_PROMPT,
        callNotes: DEFAULT_VOICE_AGENT_CALL_NOTES,
    });
    // The template is the tested prompt minus its per-call section.
    expect(DEFAULT_VOICE_AGENT_PROMPT).not.toContain('# This call');
});

test('a new inbound agent starts with the business-facts notes; a template keeps notes the owner wrote', async ({
    page,
    db,
}) => {
    await createThroughDialog(page, /^Inbound/, 'Front desk', /Puck/);

    await expect(page.getByTestId('voice-agent-call-type').first()).toHaveText('Inbound · answers calls');
    await expect(page.locator('#agent-prompt')).toHaveValue('');
    const [agent] = await db.getVoiceAgents(E2E_USER);
    expect(agent).toMatchObject({
        name: 'Front desk',
        callType: VoiceAgentCallType.INBOUND,
        voice: 'puck',
        prompt: '',
        callNotes: DEFAULT_INBOUND_VOICE_AGENT_CALL_NOTES,
    });
    expect(DEFAULT_INBOUND_VOICE_AGENT_PROMPT).not.toContain('# This call');
    expect(DEFAULT_INBOUND_VOICE_AGENT_PROMPT.length).toBeLessThan(6_000);

    await page.locator('#agent-call-notes').fill('Business: Sunrise Dental');
    const templates = page.getByTestId('prompt-templates').getByRole('button');
    await expect(templates.first()).toContainText('Receptionist');
    await templates.first().click();
    await expect(page.locator('#agent-prompt')).toHaveValue(DEFAULT_INBOUND_VOICE_AGENT_PROMPT);
    await expect(page.locator('#agent-call-notes')).toHaveValue('Business: Sunrise Dental');

    // The list says plainly when an agent has no prompt yet.
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
    await dialog.getByRole('radio', { name: /^Inbound/ }).click();
    await dialog.getByRole('button', { name: 'Change type' }).click();
    await dialog.getByRole('radio', { name: /^Outbound/ }).click();
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

test('changing the type keeps the prompt; a template replaces it only after asking', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, {
        name: 'Maya',
        callType: VoiceAgentCallType.OUTBOUND,
        prompt: DEFAULT_VOICE_AGENT_PROMPT,
        callNotes: DEFAULT_VOICE_AGENT_CALL_NOTES,
    });
    await openVoiceAgent(page, agentId);
    await expect(page.getByTestId('prompt-templates')).toHaveCount(0);

    await page.getByRole('radio', { name: /^Inbound/ }).click();
    await expect(page.getByRole('radio', { name: /^Inbound/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('voice-agent-call-type').first()).toHaveText('Inbound · answers calls');
    await expect(page.getByTestId('call-type-note')).toContainText('does not rewrite the prompt');
    await expect(page.locator('#agent-prompt')).toHaveValue(DEFAULT_VOICE_AGENT_PROMPT);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Agent saved')).toBeVisible();
    let [agent] = await db.getVoiceAgents(E2E_USER);
    expect(agent.callType).toBe(VoiceAgentCallType.INBOUND);
    expect(agent.prompt).toBe(DEFAULT_VOICE_AGENT_PROMPT);
    expect(agent.callNotes).toBe(DEFAULT_VOICE_AGENT_CALL_NOTES);

    // Cancelling the question changes nothing.
    await page.getByRole('button', { name: 'Templates' }).click();
    await page.getByRole('menuitem', { name: /^Receptionist/ }).click();
    const confirm = page.getByRole('dialog', { name: 'Replace your prompt with “Receptionist”?' });
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#agent-prompt')).toHaveValue(DEFAULT_VOICE_AGENT_PROMPT);

    // The notes were the other template's, so they are replaced too.
    await page.getByRole('button', { name: 'Templates' }).click();
    await page.getByRole('menuitem', { name: /^Receptionist/ }).click();
    await confirm.getByRole('button', { name: 'Replace prompt' }).click();
    await expect(page.locator('#agent-prompt')).toHaveValue(DEFAULT_INBOUND_VOICE_AGENT_PROMPT);
    await expect(page.locator('#agent-call-notes')).toHaveValue(DEFAULT_INBOUND_VOICE_AGENT_CALL_NOTES);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await db.getVoiceAgents(E2E_USER))[0].prompt).toBe(DEFAULT_INBOUND_VOICE_AGENT_PROMPT);
    [agent] = await db.getVoiceAgents(E2E_USER);
    expect(agent.callNotes).toBe(DEFAULT_INBOUND_VOICE_AGENT_CALL_NOTES);

    // Emptying the prompt blocks saving, in plain words.
    await page.locator('#agent-prompt').fill('');
    await expect(page.getByTestId('prompt-empty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('"Used on" lists the numbers that use the agent for incoming and outgoing calls', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya', callType: VoiceAgentCallType.INBOUND });
    const otherId = await db.insertVoiceAgent(E2E_USER, { name: 'Other' });
    const answers = await seedNumber(db, '+15550100001');
    const places = await seedNumber(db, '+15550100002');
    const elsewhere = await seedNumber(db, '+15550100003');
    await db.setVoiceNumberAgents(answers, { inboundAgentId: agentId });
    await db.setVoiceNumberAgents(places, { inboundAgentId: otherId, outboundAgentId: agentId });
    await db.setVoiceNumberAgents(elsewhere, { inboundAgentId: otherId, outboundAgentId: otherId });

    await openVoiceAgent(page, agentId);
    const usedOn = page.getByTestId('voice-agent-used-on');
    await expect(usedOn.getByTestId('used-on-inbound')).toContainText('+15550100001');
    await expect(usedOn.getByTestId('used-on-inbound')).not.toContainText('+15550100002');
    await expect(usedOn.getByTestId('used-on-outbound')).toContainText('+15550100002');
    await expect(usedOn).not.toContainText('+15550100003');
    // An inbound agent placing calls from a number is allowed, and pointed out.
    await expect(usedOn).toContainText('It is an inbound agent, but 1 number still places calls with it.');
    await expect(usedOn.getByRole('link', { name: /Phone numbers/ })).toHaveAttribute('href', '/voice-agent/phone-numbers');

    const unusedId = await db.insertVoiceAgent(E2E_USER, { name: 'Unused' });
    await openVoiceAgent(page, unusedId);
    await expect(page.getByTestId('voice-agent-used-on')).toContainText('No number uses it yet');
});

test('edits and saves every field', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Maya', prompt: 'Old prompt.' });
    const before = (await db.getVoiceAgents(E2E_USER))[0].updatedAt;
    await openVoiceAgent(page, agentId);

    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();

    await page.locator('#agent-name').fill('Maya v2');
    await page.getByLabel('Voice').click();
    await page.getByRole('option', { name: /Puck/ }).click();
    await page.locator('#agent-prompt').fill('You are Maya. Be brief.');
    await page.locator('#agent-call-notes').fill('Website: example.com');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();

    await save.click();
    await expect(page.getByText('Agent saved')).toBeVisible();
    await expect(save).toBeDisabled();

    const [agent] = await db.getVoiceAgents(E2E_USER);
    expect(agent).toMatchObject({
        name: 'Maya v2',
        voice: 'puck',
        prompt: 'You are Maya. Be brief.',
        callNotes: 'Website: example.com',
    });
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

test('will not delete an agent that answers a number, then deletes it once answering is off', async ({ page, db }) => {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Short lived' });
    const keepId = await db.insertVoiceAgent(E2E_USER, { name: 'Keeper' });
    const both = await seedNumber(db, '+15550100011');
    const mixed = await seedNumber(db, '+15550100012');
    await db.setVoiceNumberAgents(both, { inboundAgentId: agentId, outboundAgentId: agentId });
    await db.setVoiceNumberAgents(mixed, { inboundAgentId: keepId, outboundAgentId: agentId });
    await openVoiceAgent(page, agentId);

    // It still answers +15550100011: deleting it would leave that number ringing into nothing.
    await page.getByRole('button', { name: 'Delete agent' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete agent' }).click();
    await expect(page.getByText(/answers calls on \+15550100011.*Turn AI answering off/)).toBeVisible();
    expect((await db.getVoiceAgents(E2E_USER)).map((a) => a.name)).toEqual(['Short lived', 'Keeper']);

    // Once AI answering is off there, it goes, and it is taken off the numbers it called from.
    await db.setVoiceNumberAgents(both, { inboundAgentId: null });
    await page.reload();
    await page.getByRole('button', { name: 'Delete agent' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete agent' }).click();

    await expect(page).toHaveURL(new RegExp(`${VOICE_AGENTS_URL}$`));
    await expect(page.getByTestId('voice-agent-card')).toHaveCount(1);
    expect((await db.getVoiceAgents(E2E_USER)).map((a) => a.name)).toEqual(['Keeper']);

    const numbers = await db.getVoiceNumbers(E2E_USER);
    const byPhone = (phone: string) => numbers.find((n) => n.phoneNumber === phone);
    expect(byPhone('+15550100011')).toMatchObject({ inboundAgentId: null, outboundAgentId: null });
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
