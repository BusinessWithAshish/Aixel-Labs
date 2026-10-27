import { ObjectId } from 'mongodb';
import { VoiceAgentCallType, VoiceAgentChannel, VoiceCallChannel, VoiceCallDirection, VoiceProvider } from '@aixellabs/backend/db/types';
import { WHATSAPP_AGENTS_URL, WHATSAPP_NUMBERS_URL, WHATSAPP_URL } from '@/helpers/voice-routes';
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
import { numberRow } from './phone-numbers-page';

/**
 * The WhatsApp section (its inbox, agents and numbers) against a fake Meta Graph API: connecting the customer's
 * own Meta app, the same number as a phone line, a phone agent copied for WhatsApp, and a team member taking a
 * chat over and replying through Meta. The engine's side (webhooks in, the AI's replies, calls) is in
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

test('a WhatsApp number connects with the customer’s own Meta app: chats on, calls wait for Meta, all under WhatsApp', async ({
    page,
    db,
}) => {
    test.setTimeout(120_000);
    await db.insertVoiceAgent(E2E_USER, { name: 'Phone desk', callType: VoiceAgentCallType.INBOUND });

    await open(page, WHATSAPP_NUMBERS_URL);
    await page.getByRole('button', { name: 'Connect a WhatsApp number' }).first().click();
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
    await expect(numberRow(page, '+1 347-370-3925').or(numberRow(page, FAKE_WHATSAPP_NUMBER.phone))).toHaveCount(1);
    // Importing changes nothing at Meta.
    expect(meta.subscription).toBeNull();

    // A WhatsApp agent, made in the WhatsApp section, answers it.
    await open(page, WHATSAPP_AGENTS_URL);
    await expect(page.getByText('Phone desk')).toHaveCount(0);
    await page.getByRole('button', { name: 'New WhatsApp agent' }).first().click();
    const create = page.getByRole('dialog');
    await create.getByLabel('Name').fill('Chat desk');
    await create.getByRole('button', { name: /create/i }).click();
    await page.waitForURL(/\/voice-agent\/agents\/[a-f0-9]{24}/);
    const [, chatDesk] = await db.getVoiceAgents(E2E_USER);
    expect(chatDesk.channel).toBe(VoiceAgentChannel.WHATSAPP);
    expect(chatDesk.callType).toBe(VoiceAgentCallType.INBOUND);

    await waitForHydration(page, '#agent-prompt');
    // A WhatsApp agent: only a WhatsApp number picker, and the test is a chat (no number needed).
    await expect(page.getByTestId('agent-numbers')).toHaveCount(0);
    await expect(page.getByTestId('call-blockers').first()).toContainText('It is not on a WhatsApp number yet.');
    await page.locator('#agent-prompt').fill('You are Maya, the front desk of Sunrise Dental. Answer in one short sentence.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Chat with this agent' })).toBeEnabled();
    const select = page.getByTestId('agent-whatsapp-numbers-select');
    await select.click();
    await page.getByRole('option', { name: /347/ }).click();
    await expect(select).toContainText('347');

    // Meta now sends the app's webhooks to the engine, the app is on the WhatsApp account, and calling was asked
    // for and refused (a new business is below the 2,000 limit): chats work, the row says why calls do not.
    await expect.poll(() => meta.subscription?.callback_url ?? '').toContain(`/whatsapp?app=${FAKE_META_APP_ID}&sig=`);
    expect(meta.subscription?.fields).toEqual(['calls', 'messages']);
    expect(meta.wabaSubscribed).toBe(true);
    await open(page, WHATSAPP_NUMBERS_URL);
    await expect(page.getByTestId('number-use')).toContainText('Chats are on. Calls are off');
    await expect(page.getByTestId('number-use')).toContainText('2,000');

    // Meta raises the limit: turning AI answering on again turns calls on.
    meta.refuseCalling = false;
    await page.goto(voiceAgentUrl(chatDesk._id.toString()));
    await waitForHydration(page, '#agent-prompt');
    await select.click();
    await page.getByRole('option', { name: 'No number' }).click();
    await expect(select).not.toContainText('347');
    await select.click();
    await page.getByRole('option', { name: /347/ }).click();
    await expect.poll(() => meta.calling.get(FAKE_WHATSAPP_NUMBER.id)?.status).toBe('ENABLED');
    await open(page, WHATSAPP_NUMBERS_URL);
    await expect(page.getByTestId('number-use')).toContainText('Chats and WhatsApp calls are on');

    // The phone side never shows it.
    await open(page, PHONE_NUMBERS_URL);
    await expect(page.getByTestId('voice-number-row')).toHaveCount(0);
    await open(page, VOICE_AGENTS_URL);
    await expect(page.getByText('Chat desk')).toHaveCount(0);
    await expect(page.getByText('Phone desk')).toBeVisible();
});

test('the same number as a phone line and on WhatsApp shares one agent, with one memory, in one click', async ({ page, db }) => {
    const desk = await db.insertVoiceAgent(E2E_USER, { name: 'Front desk', callType: VoiceAgentCallType.INBOUND });
    await db.insertVoiceNumber(E2E_USER, {
        phoneNumber: FAKE_WHATSAPP_NUMBER.phone,
        providerNumberId: '1293384261075731499',
        apiKeySealed: sealForE2e(FAKE_TELNYX_KEY),
        texmlAppId: 'texml-1',
        inboundAgentId: new ObjectId(desk),
    });
    const whatsappId = await insertWhatsAppNumber(db);

    await open(page, WHATSAPP_NUMBERS_URL);
    const twin = page.getByTestId('number-twin');
    await expect(twin).toContainText('Also your Telnyx phone line, answered by Front desk.');
    await twin.getByRole('button', { name: 'Use Front desk here too (one memory)' }).click();
    await expect(page.getByTestId('number-use')).toContainText('Front desk');
    await expect(twin.getByRole('button')).toHaveCount(0);

    const [agent] = await db.getVoiceAgents(E2E_USER);
    expect(agent.channel).toBe(VoiceAgentChannel.BOTH);
    const numbers = await db.getVoiceNumbers(E2E_USER);
    expect(numbers.find((n) => n._id.toString() === whatsappId)?.inboundAgentId?.toString()).toBe(desk);
    expect(meta.subscription?.callback_url).toContain(`app=${FAKE_META_APP_ID}`);

    // Both sides list it; the phone line points at its WhatsApp twin.
    await open(page, WHATSAPP_AGENTS_URL);
    await expect(page.getByText('Front desk')).toBeVisible();
    await open(page, PHONE_NUMBERS_URL);
    await expect(page.getByTestId('number-twin')).toContainText('Also on WhatsApp, answered by Front desk.');
    await open(page, VOICE_AGENTS_URL);
    await expect(page.getByText('Front desk')).toBeVisible();
});

test('a phone agent is duplicated as a WhatsApp agent: same prompt and voice, its own numbers', async ({ page, db }) => {
    const desk = await db.insertVoiceAgent(E2E_USER, {
        name: 'Front desk',
        callType: VoiceAgentCallType.INBOUND,
        prompt: 'You are Maya at Sunrise Dental.',
        voice: 'kore',
    });
    await page.goto(voiceAgentUrl(desk));
    await waitForHydration(page, '#agent-prompt');
    await page.getByRole('button', { name: 'Duplicate' }).click();
    const dialog = page.getByRole('dialog', { name: 'Duplicate Front desk' });
    await expect(dialog.getByLabel('Name')).toHaveValue('Front desk (WhatsApp)');
    await expect(dialog.getByRole('radio', { name: /^WhatsApp/ })).toBeChecked();
    await dialog.getByRole('button', { name: 'Duplicate' }).click();
    await page.waitForURL((url) => /\/voice-agent\/agents\/[a-f0-9]{24}/.test(url.pathname) && !url.pathname.endsWith(desk));

    const [source, copy] = await db.getVoiceAgents(E2E_USER);
    expect(source._id.toString()).toBe(desk);
    expect(copy).toMatchObject({ name: 'Front desk (WhatsApp)', channel: VoiceAgentChannel.WHATSAPP, prompt: source.prompt, voice: 'kore' });

    await open(page, WHATSAPP_AGENTS_URL);
    await expect(page.getByText('Front desk (WhatsApp)')).toBeVisible();
    await open(page, VOICE_AGENTS_URL);
    await expect(page.getByText('Front desk (WhatsApp)')).toHaveCount(0);
});

test('a team member takes a chat over, replies through Meta, and hands it back to the AI', async ({ page, db }) => {
    const desk = await db.insertVoiceAgent(E2E_USER, {
        name: 'Chat desk',
        callType: VoiceAgentCallType.INBOUND,
        channel: VoiceAgentChannel.WHATSAPP,
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
    await expect(thread).toContainText('Needs you');
    await thread.click();
    await page.getByRole('button', { name: 'Take over' }).click();
    await expect(page.getByRole('button', { name: 'Hand back to AI' })).toBeVisible();

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
    expect((await db.getVoiceCalls(E2E_USER))[0].chat?.human ?? null).toBeNull();
});
