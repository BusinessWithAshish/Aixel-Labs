import { ObjectId } from 'mongodb';
import { VoiceAgentCallType, VoiceCallChannel, VoiceCallDirection, VoiceProvider } from '@aixellabs/backend/db/types';
import { WHATSAPP_URL } from '@/helpers/voice-routes';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import { VOICE_AGENTS_URL, voiceAgentUrl, waitForHydration } from '../support/voice-agents';
import {
    FAKE_META_APP_ID,
    FAKE_META_APP_SECRET,
    FAKE_META_TOKEN,
    FAKE_TELNYX_KEY,
    FAKE_WABA_ID,
    FAKE_WHATSAPP_NUMBER,
    FakeMeta,
    FakeTelnyx,
    PHONE_NUMBERS_URL,
    sealForE2e,
} from './fake-telephony';
import { expectSlots, numberRow, slotAgent } from './phone-numbers-page';

/**
 * WhatsApp against a fake Meta Graph API: connecting the customer's own Meta app on Numbers, putting an agent on
 * it (from the agent or from the number), the same number as a phone line sharing one agent, and a team member
 * taking a chat over in the inbox and replying through Meta. The engine's side (webhooks in, the AI's replies, calls) is in
 * engine-live-whatsapp.spec.ts.
 */

const PERSON = '919876543210';

let meta: FakeMeta;
let telnyx: FakeTelnyx;

test.use({ storageState: USER_STORAGE_STATE });

test.beforeAll(async () => {
    [meta, telnyx] = await Promise.all([FakeMeta.start(), FakeTelnyx.start()]);
});

test.afterAll(async () => {
    await Promise.all([meta?.stop(), telnyx?.stop()]);
});

test.beforeEach(async ({ db }) => {
    meta.reset();
    telnyx.reset();
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
});

async function open(page: import('@playwright/test').Page, url: string) {
    await page.goto(url);
    await waitForHydration(page, '#header');
}

/** Picks the agent that answers the number on WhatsApp, from its row on Numbers (a pick saves at once). */
async function chooseSlotAgent(page: import('@playwright/test').Page, phoneNumber: string, agent: string) {
    const select = slotAgent(page, phoneNumber, 'whatsapp');
    await select.click();
    await page.getByRole('option', { name: agent, exact: true }).click();
    await expect(select).toHaveText(agent);
    await expect(select).toBeEnabled();
}

/** A WhatsApp number as the import leaves it (no agent yet). */
function insertWhatsAppNumber(db: import('../support/db').E2eDb, inboundAgentId: string | null = null) {
    return db.insertVoiceNumber(E2E_USER, {
        provider: VoiceProvider.WHATSAPP,
        phoneNumber: FAKE_WHATSAPP_NUMBER.phone,
        providerNumberId: FAKE_WHATSAPP_NUMBER.id,
        apiKeySealed: sealForE2e(FAKE_META_TOKEN),
        inboundAgentId: inboundAgentId ? new ObjectId(inboundAgentId) : null,
        whatsapp: { appId: FAKE_META_APP_ID, appSecretSealed: sealForE2e(FAKE_META_APP_SECRET), wabaId: FAKE_WABA_ID },
    });
}

test('a WhatsApp number connects with the customer’s own Meta app on Numbers: chats on, calls wait for Meta', async ({
    page,
    db,
}) => {
    test.setTimeout(120_000);
    await db.insertVoiceAgent(E2E_USER, { name: 'Phone desk', callType: VoiceAgentCallType.INBOUND });

    await open(page, PHONE_NUMBERS_URL);
    await page.getByRole('button', { name: 'Connect a number' }).first().click();
    await page.getByRole('menuitem', { name: /^WhatsApp/ }).click();
    const connect = page.getByRole('dialog', { name: 'Connect a WhatsApp number' });
    await connect.getByLabel('App ID').fill(FAKE_META_APP_ID);
    await connect.getByLabel('App secret').fill(FAKE_META_APP_SECRET);
    await connect.getByLabel('Access token').fill(FAKE_META_TOKEN);
    await connect.getByRole('button', { name: 'Find my numbers' }).click();
    // The Cloud API number can come in; the one still on the WhatsApp Business app cannot.
    const boxes = connect.getByRole('checkbox');
    await expect(boxes).toHaveCount(2);
    await expect(boxes.nth(1)).toBeDisabled();
    await connect.getByRole('button', { name: 'Import 1 number' }).click();
    await expect(connect).toBeHidden();
    await expect(numberRow(page, FAKE_WHATSAPP_NUMBER.phone)).toHaveCount(1);
    await expect(slotAgent(page, FAKE_WHATSAPP_NUMBER.phone, 'whatsapp')).toHaveText('No agent');
    // Importing changes nothing at Meta.
    expect(meta.subscription).toBeNull();

    // An agent is just an agent: where it works comes from the number it goes on.
    await open(page, VOICE_AGENTS_URL);
    await page.getByRole('button', { name: 'New agent' }).first().click();
    const create = page.getByRole('dialog', { name: 'New agent' });
    await create.getByLabel('Name').fill('Chat desk');
    await create.getByRole('button', { name: /create/i }).click();
    await page.waitForURL(/\/voice-agent\/agents\/[a-f0-9]{24}/);
    const [, chatDesk] = await db.getVoiceAgents(E2E_USER);
    expect(chatDesk.callType).toBe(VoiceAgentCallType.INBOUND);
    expect(chatDesk.channel).toBeUndefined();

    await waitForHydration(page, '#agent-prompt');
    // Where it works: a phone number and a WhatsApp number; on neither yet, it cannot be tried as either.
    await expect(page.getByTestId('agent-numbers')).toBeVisible();
    await expect(page.getByTestId('call-blockers').first()).toContainText('It is not on a phone or WhatsApp number yet.');
    await page
        .locator('#agent-prompt')
        .fill('You are Maya, the front desk of Sunrise Dental. Answer in one short sentence.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Call this agent' })).toBeDisabled();
    const select = page.getByTestId('agent-whatsapp-numbers-select');
    await select.click();
    await page.getByRole('option', { name: /347/ }).click();
    await expect(select).toContainText('347');
    // Only on WhatsApp now: it is tried in the test chat, which needs no phone line.
    await expect(page.getByRole('button', { name: 'Test on WhatsApp' })).toBeEnabled();

    // Meta now sends the app's webhooks to the engine, the app is on the WhatsApp account, and calling was asked
    // for and refused (a new business is below the 2,000 limit): chats work, the row says why calls do not.
    await expect.poll(() => meta.subscription?.callback_url ?? '').toContain(`/whatsapp?app=${FAKE_META_APP_ID}&sig=`);
    expect(meta.subscription?.fields).toEqual(['calls', 'messages']);
    expect(meta.wabaSubscribed).toBe(true);
    await open(page, PHONE_NUMBERS_URL);
    await expect(slotAgent(page, FAKE_WHATSAPP_NUMBER.phone, 'whatsapp')).toHaveText('Chat desk');
    await expect(page.getByTestId('number-status')).toContainText('Chats are on. Calls are off');
    await expect(page.getByTestId('number-status')).toContainText('2,000');

    // Meta raises the limit: turning AI answering on again (here, from the number) turns calls on.
    meta.refuseCalling = false;
    await chooseSlotAgent(page, FAKE_WHATSAPP_NUMBER.phone, 'No agent');
    await chooseSlotAgent(page, FAKE_WHATSAPP_NUMBER.phone, 'Chat desk');
    await expect.poll(() => meta.calling.get(FAKE_WHATSAPP_NUMBER.id)?.status).toBe('ENABLED');
    await open(page, PHONE_NUMBERS_URL);
    await expect(page.getByTestId('number-status')).toContainText('Chats and WhatsApp calls are on');

    // Agents says where each one works; the WhatsApp filter (and the old WhatsApp agents link) shows Chat desk only.
    await open(page, VOICE_AGENTS_URL);
    await expect(page.getByTestId('voice-agent-card').filter({ hasText: 'Chat desk' })).toContainText(
        `WhatsApp ${FAKE_WHATSAPP_NUMBER.phone}`,
    );
    await expect(page.getByTestId('voice-agent-card').filter({ hasText: 'Phone desk' })).toContainText(
        'Not on a number yet',
    );
    await open(page, '/voice-agent/whatsapp/agents');
    await expect(page).toHaveURL(/\/voice-agent\/agents\?show=whatsapp$/);
    await expect(page.getByRole('tab', { name: 'WhatsApp' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Chat desk')).toBeVisible();
    await expect(page.getByText('Phone desk')).toHaveCount(0);
});

test('a token that applies to all WhatsApp accounts finds them through its system user', async ({ page }) => {
    // An admin system user's token: Meta's debug_token says "applies to all objects" and names no account.
    meta.grantsAll = true;
    meta.assignedWabas = [];

    await open(page, PHONE_NUMBERS_URL);
    await page.getByRole('button', { name: 'Connect a number' }).first().click();
    await page.getByRole('menuitem', { name: /^WhatsApp/ }).click();
    const connect = page.getByRole('dialog', { name: 'Connect a WhatsApp number' });
    await connect.getByLabel('App ID').fill(FAKE_META_APP_ID);
    await connect.getByLabel('App secret').fill(FAKE_META_APP_SECRET);
    await connect.getByLabel('Access token').fill(FAKE_META_TOKEN);
    // No account assigned to the system user either: the same plain refusal as before.
    await connect.getByRole('button', { name: 'Find my numbers' }).click();
    await expect(connect).toContainText('This access token reaches no WhatsApp account.');

    meta.assignedWabas = [FAKE_WABA_ID];
    await connect.getByRole('button', { name: 'Find my numbers' }).click();
    await expect(connect.getByRole('checkbox')).toHaveCount(2);
    await expect(connect).not.toContainText('reaches no WhatsApp account');
});

test('the same number as a phone line and on WhatsApp shares one agent, with one memory, picked on Numbers', async ({
    page,
    db,
}) => {
    const desk = await db.insertVoiceAgent(E2E_USER, { name: 'Front desk', callType: VoiceAgentCallType.INBOUND });
    await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: FAKE_WHATSAPP_NUMBER.phone,
        providerNumberId: '1293384261075731499',
        apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
        texmlAppId: 'texml-1',
        inboundAgentId: new ObjectId(desk),
    });
    const whatsappId = await insertWhatsAppNumber(db);

    // One row for the number: its Telnyx line and its WhatsApp, each with its own agent picker.
    await open(page, PHONE_NUMBERS_URL);
    await expect(page.getByTestId('voice-number-row')).toHaveCount(1);
    await expectSlots(page, FAKE_WHATSAPP_NUMBER.phone, { answers: 'Front desk' });
    await chooseSlotAgent(page, FAKE_WHATSAPP_NUMBER.phone, 'Front desk');
    await expect(page.getByTestId('number-shared-agent')).toHaveText(
        'Front desk answers its calls and its WhatsApp, with one memory of each person.',
    );

    const numbers = await db.getVoiceNumbers(E2E_USER);
    expect(numbers.find((n) => n._id.toString() === whatsappId)?.inboundAgentId?.toString()).toBe(desk);
    expect(meta.subscription?.callback_url).toContain(`app=${FAKE_META_APP_ID}`);

    // Its card says both, and both filters list it.
    await open(page, VOICE_AGENTS_URL);
    const card = page.getByTestId('voice-agent-card');
    await expect(card).toContainText(`Answers ${FAKE_WHATSAPP_NUMBER.phone}`);
    await expect(card).toContainText(`WhatsApp ${FAKE_WHATSAPP_NUMBER.phone}`);
    for (const filter of ['Calls', 'WhatsApp']) {
        await page.getByRole('tab', { name: filter }).click();
        await expect(page.getByText('Front desk')).toBeVisible();
    }
    await page.getByRole('tab', { name: 'No number' }).click();
    await expect(page.getByText('Every agent is on a number.')).toBeVisible();
});

test('an agent is duplicated from its menu: same prompt and voice, no numbers', async ({ page, db }) => {
    const desk = await db.insertVoiceAgent(E2E_USER, {
        name: 'Front desk',
        callType: VoiceAgentCallType.INBOUND,
        prompt: 'You are Maya at Sunrise Dental.',
        voice: 'kore',
    });
    await page.goto(voiceAgentUrl(desk));
    await waitForHydration(page, '#agent-prompt');
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    const dialog = page.getByRole('dialog', { name: 'Duplicate Front desk' });
    await expect(dialog.getByLabel('Name')).toHaveValue('Front desk (copy)');
    await dialog.getByRole('button', { name: 'Duplicate' }).click();
    await page.waitForURL((url) => /\/voice-agent\/agents\/[a-f0-9]{24}/.test(url.pathname) && !url.pathname.endsWith(desk));

    const [source, copy] = await db.getVoiceAgents(E2E_USER);
    expect(source._id.toString()).toBe(desk);
    expect(copy).toMatchObject({
        name: 'Front desk (copy)',
        prompt: source.prompt,
        voice: 'kore',
        callType: VoiceAgentCallType.INBOUND,
    });
});

test('a team member takes a chat over, replies through Meta, and hands it back to the AI', async ({ page, db }) => {
    const desk = await db.insertVoiceAgent(E2E_USER, {
        name: 'Chat desk',
        callType: VoiceAgentCallType.INBOUND,
    });
    const numberId = await insertWhatsAppNumber(db, desk);
    const now = Date.now();
    const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000);
    const [chatId] = await db.insertVoiceCalls(E2E_USER, [
        {
            agentId: new ObjectId(desk),
            numberId: new ObjectId(numberId),
            channel: VoiceCallChannel.WHATSAPP,
            direction: VoiceCallDirection.INBOUND,
            from: `+${PERSON}`,
            to: FAKE_WHATSAPP_NUMBER.phone,
            callerPhone: `+${PERSON}`,
            voice: 'sulafat',
            startedAt: at(4),
            endedAt: at(1),
            durationSec: 0,
            endedBy: 'chat_open',
            turns: [
                { role: 'caller', text: 'Hi, is Dr. Rao in on Saturday?', at: at(4) },
                { role: 'agent', text: 'Dr. Rao sees patients Saturday 10 to 2. Shall I book you?', at: at(4) },
                { role: 'caller', text: 'I want to talk to a real person about my bill', at: at(1) },
            ],
            chat: {
                open: true,
                lastMessageAt: at(1),
                tokens: { textIn: 900, textOut: 60 },
                needsHuman: { since: at(1), reason: 'billing question' },
                unread: 1,
                name: 'Ravi',
            },
        } as never,
    ]);

    await open(page, WHATSAPP_URL);
    const thread = page.getByRole('button', { name: /Ravi/ });
    await expect(thread).toContainText('Waiting');
    // The filters are tabs: "AI" has nothing waiting, "Waiting" has Ravi.
    await page.getByRole('tab', { name: 'AI', exact: true }).click();
    await expect(page.getByText('Nothing here right now.')).toBeVisible();
    await page.getByRole('tab', { name: /^Waiting/ }).click();
    // On a wide screen the chat list and the chat sit side by side, with a handle to drag the list wider.
    const chats = page.getByRole('complementary', { name: 'Conversations' });
    const before = (await chats.boundingBox())!.width;
    const handle = page.getByRole('separator', { name: 'Resize the chat list' });
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await chats.boundingBox())!.width).toBeGreaterThan(before);
    await thread.click();
    // The AI's messages say "AI (<agent>)"; nobody types here until someone takes the chat over.
    await expect(page.getByText('AI (Chat desk)', { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel('Message')).toHaveCount(0);
    await page.getByRole('button', { name: 'Take over' }).click();
    await expect(page.getByRole('button', { name: 'Hand back to AI' })).toBeVisible();
    // The signed-in owner is "you", never their own name.
    await expect(page.getByText('You’re answering. The AI is paused for this chat.')).toBeVisible();

    await page.getByLabel('Message').fill('Hi Ravi, this is Priya from billing. Let me check that for you.');
    await page.getByLabel('Send').click();
    await expect.poll(() => meta.sent).toEqual([
        { to: PERSON, type: 'text', text: 'Hi Ravi, this is Priya from billing. Let me check that for you.' },
    ]);
    await expect(page.getByText('Hi Ravi, this is Priya from billing. Let me check that for you.', { exact: true })).toBeVisible();

    const [chat] = await db.getVoiceCalls(E2E_USER);
    expect(chat._id.toString()).toBe(chatId);
    expect(chat.chat?.human?.name).toBeTruthy();
    expect(chat.chat?.needsHuman ?? null).toBeNull();
    expect(chat.turns.at(-1)).toMatchObject({ role: 'human', text: expect.stringContaining('Priya') });

    await page.getByRole('button', { name: 'Hand back to AI' }).click();
    await expect(page.getByRole('button', { name: 'Take over' })).toBeVisible();
    await expect(page.getByLabel('Message')).toHaveCount(0);
    expect((await db.getVoiceCalls(E2E_USER))[0].chat?.human ?? null).toBeNull();
});
