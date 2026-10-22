import { createHmac } from 'node:crypto';
import { ObjectId } from 'mongodb';
import type { Page } from '@playwright/test';
import {
    VoiceAgentCallType,
    VoiceCallChannel,
    VoiceCallDirection,
    VoiceProvider,
    type VoiceNumberDoc,
} from '@aixellabs/backend/db/types';
import { voiceCallRecordingApiRoute } from '@/config/app-config';
import type { E2eDb } from '../support/db';
import { expect, LOCAL_FETCH, test } from '../support/fixtures';
import { E2E_TWILIO_MEDIA_BASE, E2E_VOICE_ENGINE_SECRET, E2E_VOICE_ENGINE_URL, USER_STORAGE_STATE } from '../support/env';
import { waitForHydration } from '../support/voice-agents';
import { E2E_ADMIN, E2E_USER } from '../support/users';
import {
    CALL_LOGS_URL,
    ENGINE_TWILIO_TRIAL_NUMBER,
    FAKE_TWILIO_ACCOUNT_SID,
    FAKE_TWILIO_AUTH_TOKEN,
    FAKE_TWILIO_KEY_SECRET,
    FAKE_TWILIO_KEY_SID,
    FakeTwilio,
    FakeVoiceEngine,
    makeTestWav,
    sealForE2e,
    TWILIO_CUSTOMER_APP_SID,
    TWILIO_CUSTOMER_TRUNK_SID,
    TWILIO_CUSTOMER_VOICE_URL,
    type FakeTwilioNumber,
} from './fake-telephony';
import {
    LINK_UI_PENDING,
    linkNumber,
    numberRow,
    numberUse,
    openConnect,
    openPhoneNumbers,
    openRemove,
    unlinkNumber,
} from './phone-numbers-page';

/** PN…101: the customer's own webhook (GET). PN…102: their TwiML app. PN…103: their SIP trunk. PN…104: SMS only. */
const WEBHOOK_NUMBER = '+14155550101';
const APP_NUMBER = '+14155550102';
const TRUNK_NUMBER = '+14155550103';
const SMS_NUMBER = '+14155550104';
const sidOf = (n: number) => `PN${String(n).padStart(32, '0')}`;
const NUMBERS = { [WEBHOOK_NUMBER]: 101, [APP_NUMBER]: 102, [TRUNK_NUMBER]: 103, [SMS_NUMBER]: 104 } as const;

const KEY_AUTH = `Basic ${Buffer.from(`${FAKE_TWILIO_KEY_SID}:${FAKE_TWILIO_KEY_SECRET}`).toString('base64')}`;
const TOKEN_AUTH = `Basic ${Buffer.from(`${FAKE_TWILIO_ACCOUNT_SID}:${FAKE_TWILIO_AUTH_TOKEN}`).toString('base64')}`;
const ACCOUNT_PATH = `/2010-04-01/Accounts/${FAKE_TWILIO_ACCOUNT_SID}`;

/** The engine's Voice URL for a number: `/twiml`, the number id and its permanent signature. */
function engineVoiceUrl(numberId: string): string {
    const sig = createHmac('sha256', E2E_VOICE_ENGINE_SECRET).update(`number|${numberId}`).digest('hex').slice(0, 32);
    return `${E2E_VOICE_ENGINE_URL}/twiml?n=${numberId}&sig=${sig}`;
}

let twilio: FakeTwilio;
let engine: FakeVoiceEngine;
let original: FakeTwilioNumber[];

async function chooseOption(page: Page, combobox: string, option: string): Promise<void> {
    await page.getByRole('combobox', { name: combobox }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
}

type Credentials = { accountSid?: string; keySid?: string; secret?: string; authToken?: string };

async function openTwilioConnect(page: Page, credentials: Credentials = {}) {
    const dialog = await openConnect(page, 'Twilio');
    await dialog.getByLabel('Account SID').fill(credentials.accountSid ?? FAKE_TWILIO_ACCOUNT_SID);
    if (credentials.authToken !== undefined) {
        await dialog.getByRole('radio', { name: 'Auth Token' }).click();
        await dialog.getByLabel('Auth Token', { exact: true }).fill(credentials.authToken);
    } else {
        await dialog.getByLabel('API key SID').fill(credentials.keySid ?? FAKE_TWILIO_KEY_SID);
        await dialog.getByLabel('API key secret').fill(credentials.secret ?? FAKE_TWILIO_KEY_SECRET);
    }
    await dialog.getByRole('button', { name: 'Find my numbers' }).click();
    return dialog;
}

async function seedAgents(db: E2eDb) {
    return {
        frontDesk: await db.insertVoiceAgent(E2E_USER, { name: 'Front desk', callType: VoiceAgentCallType.INBOUND }),
        afterHours: await db.insertVoiceAgent(E2E_USER, { name: 'After hours', callType: VoiceAgentCallType.INBOUND }),
        sales: await db.insertVoiceAgent(E2E_USER, { name: 'Sales outreach', callType: VoiceAgentCallType.OUTBOUND }),
        followUps: await db.insertVoiceAgent(E2E_USER, { name: 'Follow-ups', callType: VoiceAgentCallType.OUTBOUND }),
    };
}

async function seedTwilioNumber(db: E2eDb, phoneNumber: keyof typeof NUMBERS, fields: Partial<VoiceNumberDoc> = {}) {
    return db.insertVoiceNumber(E2E_USER, {
        provider: VoiceProvider.TWILIO,
        phoneNumber,
        providerNumberId: sidOf(NUMBERS[phoneNumber]),
        apiKeySealed: sealForE2e(FAKE_TWILIO_KEY_SECRET),
        twilio: { accountSid: FAKE_TWILIO_ACCOUNT_SID, apiKeySid: FAKE_TWILIO_KEY_SID },
        ...fields,
    });
}

async function storedNumber(db: E2eDb, phoneNumber: string): Promise<VoiceNumberDoc> {
    const stored = (await db.getVoiceNumbers(E2E_USER)).find((n) => n.phoneNumber === phoneNumber);
    if (!stored) throw new Error(`${phoneNumber} is not stored`);
    return stored;
}

function fakeNumber(phoneNumber: string): FakeTwilioNumber {
    return twilio.numbers.find((n) => n.phone_number === phoneNumber) as FakeTwilioNumber;
}

function originalOf(phoneNumber: string): FakeTwilioNumber {
    return original.find((n) => n.phone_number === phoneNumber) as FakeTwilioNumber;
}

/** Every write to the customer's account, as `<path>: <form>`. */
function writeBodies() {
    return twilio.writes().map((r) => ({ path: r.path.replace(ACCOUNT_PATH, ''), body: r.body }));
}

test.use({ storageState: USER_STORAGE_STATE });

test.beforeAll(async () => {
    twilio = await FakeTwilio.start();
    engine = await FakeVoiceEngine.start();
});

test.afterAll(async () => {
    await twilio?.stop();
    await engine?.stop();
});

test.beforeEach(async ({ db }) => {
    twilio.reset();
    original = structuredClone(twilio.numbers);
    engine.clear();
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceTelephony(E2E_USER);
});

test('connecting Twilio with an API key lists every page of numbers and imports without changing anything', async ({
    page,
    db,
}) => {
    twilio.pageSize = 3; // the fourth number is on page two
    await openPhoneNumbers(page);
    const dialog = await openTwilioConnect(page);
    await expect(dialog.getByRole('checkbox')).toHaveCount(4);
    // A messaging-only number cannot take calls: offered, but not importable.
    await expect(dialog.getByRole('checkbox', { name: SMS_NUMBER })).toBeDisabled();
    await expect(dialog.getByRole('listitem').filter({ hasText: SMS_NUMBER })).toContainText('No voice calls');
    await expect(dialog.getByRole('checkbox', { name: WEBHOOK_NUMBER })).toBeChecked();
    await dialog.getByRole('checkbox', { name: TRUNK_NUMBER }).click();
    await dialog.getByRole('button', { name: 'Import 2 numbers' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Imported 2 numbers. Nothing changed in Twilio')).toBeVisible();

    await expect(numberRow(page, WEBHOOK_NUMBER).getByTestId('number-provider')).toHaveText('Twilio');
    await expect(numberUse(page, WEBHOOK_NUMBER)).toHaveText('Not linked to an agent');
    await expect(numberRow(page, APP_NUMBER)).toHaveCount(1);
    await expect(numberRow(page, TRUNK_NUMBER)).toHaveCount(0);

    const stored = await storedNumber(db, WEBHOOK_NUMBER);
    expect(stored).toMatchObject({
        provider: VoiceProvider.TWILIO,
        providerNumberId: sidOf(101),
        inboundAgentId: null,
        outboundAgentId: null,
        twilio: { accountSid: FAKE_TWILIO_ACCOUNT_SID, apiKeySid: FAKE_TWILIO_KEY_SID },
    });
    expect(stored.twilio).not.toHaveProperty('previousRouting');
    expect(stored.apiKeySealed).toMatch(/^v1\./);
    expect(stored.apiKeySealed).not.toContain(FAKE_TWILIO_KEY_SECRET);

    // Reads only (account, then both pages, on connect and again on import), all as the API key.
    expect(twilio.writes()).toHaveLength(0);
    expect(
        twilio.requests.map((r) => `${r.method} ${r.path.replace(ACCOUNT_PATH, '')} ${r.query.Page ?? ''}`.trim()),
    ).toEqual(Array(2).fill([`GET .json`, 'GET /IncomingPhoneNumbers.json', 'GET /IncomingPhoneNumbers.json 1']).flat());
    for (const r of twilio.requests) expect(r.authorization).toBe(KEY_AUTH);
    expect(twilio.numbers).toEqual(original);

    await page.reload();
    await waitForHydration(page, '#header');
    const html = await page.content();
    expect(html).not.toContain(FAKE_TWILIO_KEY_SECRET);
    expect(html).not.toContain(stored.apiKeySealed);
    expect(html).not.toContain('apiKeySealed');
});

test('the Auth Token works instead of an API key, and a key that may not read the account still lists numbers', async ({
    page,
    db,
}) => {
    await openPhoneNumbers(page);
    let dialog = await openTwilioConnect(page, { authToken: FAKE_TWILIO_AUTH_TOKEN });
    await dialog.getByRole('checkbox', { name: APP_NUMBER }).click();
    await dialog.getByRole('checkbox', { name: TRUNK_NUMBER }).click();
    await dialog.getByRole('button', { name: 'Import 1 number' }).click();
    await expect(dialog).toBeHidden();
    const stored = await storedNumber(db, WEBHOOK_NUMBER);
    expect(stored.twilio).toEqual({ accountSid: FAKE_TWILIO_ACCOUNT_SID, apiKeySid: null });
    for (const r of twilio.requests) expect(r.authorization).toBe(TOKEN_AUTH);

    // A Restricted API key without the account permission: the numbers list is the check.
    twilio.accountReadable = false;
    twilio.clear();
    dialog = await openTwilioConnect(page);
    await expect(dialog.getByRole('listitem').filter({ hasText: WEBHOOK_NUMBER })).toContainText('Already added');
    await dialog.getByRole('button', { name: 'Import 2 numbers' }).click();
    await expect(dialog).toBeHidden();
    // The re-import of the first number switched it to the API key, and kept it once.
    expect((await db.getVoiceNumbers(E2E_USER)).map((n) => n.phoneNumber).sort()).toEqual(
        [WEBHOOK_NUMBER, APP_NUMBER, TRUNK_NUMBER].sort(),
    );
});

test('wrong or malformed Twilio credentials are refused in plain words and nothing is stored', async ({ page, db }) => {
    await openPhoneNumbers(page);
    let dialog = await openTwilioConnect(page, { secret: 'not-the-secret' });
    await expect(dialog.getByRole('alert')).toContainText('Twilio rejected these credentials');

    await page.keyboard.press('Escape');
    dialog = await openTwilioConnect(page, { accountSid: FAKE_TWILIO_KEY_SID });
    await expect(dialog.getByRole('alert')).toContainText('That is an API key SID (SK…). The Account SID starts with AC');

    await page.keyboard.press('Escape');
    twilio.account = { status: 'suspended', type: 'Full' };
    dialog = await openTwilioConnect(page);
    await expect(dialog.getByRole('alert')).toContainText('This Twilio account is suspended');
    expect(await db.getVoiceNumbers(E2E_USER)).toHaveLength(0);
    expect(twilio.writes()).toHaveLength(0);
});

test('a number whose credentials Twilio no longer accepts can still be removed', async ({ page, db }) => {
    await seedAgents(db);
    await seedTwilioNumber(db, WEBHOOK_NUMBER, { apiKeySealed: sealForE2e('a-revoked-secret') });
    await openPhoneNumbers(page);
    await (await openRemove(page, WEBHOOK_NUMBER)).getByRole('button', { name: 'Remove number' }).click();
    await expect(page.getByText('No phone numbers yet')).toBeVisible();
    expect(await db.getVoiceNumbers(E2E_USER)).toHaveLength(0);
});

test('a test call from a Twilio number goes to the engine, and a trial refusal is spelled out', async ({ page, db }) => {
    const { sales, followUps } = await seedAgents(db);
    const numberId = await seedTwilioNumber(db, WEBHOOK_NUMBER, { outboundAgentId: new ObjectId(sales) });
    await openPhoneNumbers(page);

    await numberRow(page, WEBHOOK_NUMBER).getByRole('button', { name: 'Test call' }).click();
    const dialog = page.getByRole('dialog', { name: 'Test call' });
    await expect(dialog).toContainText('On a Twilio trial account, calls only go to numbers you have verified');
    await expect(dialog.getByLabel('Your phone number')).toHaveAttribute('placeholder', '+14155550123');

    await dialog.getByLabel('Your phone number').fill(ENGINE_TWILIO_TRIAL_NUMBER);
    await dialog.getByRole('button', { name: 'Call me now' }).click();
    await expect(dialog.getByRole('alert').last()).toHaveText(
        `Twilio refused the call: The number ${ENGINE_TWILIO_TRIAL_NUMBER} is unverified. Trial accounts may only make calls to verified numbers.`,
    );
    engine.clear();

    await chooseOption(page, 'Agent that calls', 'Follow-ups (makes calls)');
    await dialog.getByLabel('Your phone number').fill('+1 415 555 0123');
    await dialog.getByRole('button', { name: 'Call me now' }).click();
    await expect(dialog.getByRole('status')).toContainText('Calling +1 415 555 0123 now');
    expect(engine.requests).toHaveLength(1);
    expect(engine.requests[0]).toMatchObject({
        method: 'POST',
        path: '/calls',
        authorization: `Bearer ${E2E_VOICE_ENGINE_SECRET}`,
        body: { numberId, to: '+14155550123', agentId: followUps },
    });
    // The app itself asks nothing of Twilio for a call: the engine places it.
    expect(twilio.requests).toHaveLength(0);
});

test.describe('call recordings in Twilio', () => {
    const CALL_SID = `CA${'7'.repeat(32)}`;
    let callId: string;

    test.beforeEach(async ({ db }) => {
        const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Front desk' });
        const numberId = await seedTwilioNumber(db, WEBHOOK_NUMBER);
        const startedAt = new Date(Date.now() - 5 * 60_000);
        [callId] = await db.insertVoiceCalls(E2E_USER, [
            {
                agentId: new ObjectId(agentId),
                numberId: new ObjectId(numberId),
                channel: VoiceCallChannel.PHONE,
                direction: VoiceCallDirection.INBOUND,
                from: '+14155550199',
                to: WEBHOOK_NUMBER,
                voice: 'sulafat',
                startedAt,
                endedAt: new Date(startedAt.getTime() + 3000),
                durationSec: 3,
                endedBy: 'goodbye',
                flags: [],
                turns: [{ role: 'agent', text: 'Hello, Front desk here.' }],
                gapsMs: [],
                providerCallId: CALL_SID,
            },
        ]);
    });

    test('the recording is fetched with the customer credentials, streamed with Range, and downloads by name', LOCAL_FETCH, async ({
        page,
    }) => {
        const audio = makeTestWav(3);
        const recordingSid = twilio.addRecording(CALL_SID, audio, 3);
        await page.goto(`${CALL_LOGS_URL}/${callId}`);
        await expect(page.getByLabel('Call recording')).toHaveAttribute('src', voiceCallRecordingApiRoute(callId));
        await expect(page.getByText('Stored in your Twilio account')).toBeVisible();
        expect(twilio.find('GET', `${ACCOUNT_PATH}/Calls/${CALL_SID}/Recordings.json`)[0]?.authorization).toBe(KEY_AUTH);

        const part = await page.request.get(voiceCallRecordingApiRoute(callId), { headers: { Range: 'bytes=0-43' } });
        expect(part.status()).toBe(206);
        expect(part.headers()['content-type']).toBe('audio/mpeg');
        expect(part.headers()['content-range']).toBe(`bytes 0-43/${audio.length}`);
        expect((await part.body()).equals(audio.subarray(0, 44))).toBe(true);

        const whole = await page.request.get(voiceCallRecordingApiRoute(callId, true));
        expect(whole.status()).toBe(200);
        expect(whole.headers()['content-disposition']).toMatch(
            /^attachment; filename="call-\d{4}-\d{2}-\d{2}-front-desk\.mp3"$/,
        );
        expect((await whole.body()).equals(audio)).toBe(true);

        // Twilio's API host got the credentials; the pre-signed media host it redirected to never did.
        const mediaLookups = twilio.find('GET', `${ACCOUNT_PATH}/Recordings/${recordingSid}.mp3`);
        expect(mediaLookups.length).toBeGreaterThan(0);
        for (const r of mediaLookups) expect(r.authorization).toBe(KEY_AUTH);
        const fetched = twilio.media.find('GET', `/media/${recordingSid}.mp3`);
        expect(fetched.length).toBeGreaterThan(0);
        for (const r of fetched) expect(r.authorization).toBeUndefined();
        expect(fetched.some((r) => r.range === 'bytes=0-43')).toBe(true);
        expect(E2E_TWILIO_MEDIA_BASE).not.toContain('127.0.0.1');

        // The page itself never holds a Twilio link or credential.
        const html = await page.content();
        expect(html).not.toContain(recordingSid);
        expect(html).not.toContain(FAKE_TWILIO_KEY_SECRET);
    });

    test('a recording still processing, or none at all, is said plainly', async ({ page }) => {
        twilio.recordings.set(CALL_SID, [
            { sid: `RE${'8'.repeat(32)}`, call_sid: CALL_SID, status: 'processing', duration: '-1', channels: 2 },
        ]);
        await page.goto(`${CALL_LOGS_URL}/${callId}`);
        await expect(page.getByTestId('no-recording')).toContainText(
            'Twilio is still processing the recording for this call',
        );

        twilio.recordings.clear();
        await page.goto(`${CALL_LOGS_URL}/${callId}`);
        await expect(page.getByTestId('no-recording')).toContainText('Twilio has no recording for this call.');
    });
});

test('a Twilio number another account already connected cannot be imported', async ({ page, db }) => {
    await db.insertVoiceNumber(E2E_ADMIN, {
        provider: VoiceProvider.TWILIO,
        phoneNumber: WEBHOOK_NUMBER,
        providerNumberId: sidOf(101),
        apiKeySealed: sealForE2e(FAKE_TWILIO_KEY_SECRET),
        twilio: { accountSid: FAKE_TWILIO_ACCOUNT_SID, apiKeySid: FAKE_TWILIO_KEY_SID },
    });
    try {
        await openPhoneNumbers(page);
        const dialog = await openTwilioConnect(page);
        await expect(dialog.getByRole('listitem').filter({ hasText: WEBHOOK_NUMBER })).toContainText(
            'Used by another account',
        );
        await expect(dialog.getByRole('checkbox', { name: WEBHOOK_NUMBER })).toBeDisabled();
    } finally {
        await db.resetVoiceTelephony(E2E_ADMIN);
    }
});

/** Twilio routing as the agent editor links and unlinks numbers (the agent's type is the number's job). */
test.describe('linking from the agent editor', () => {
    test.fixme(LINK_UI_PENDING !== null, LINK_UI_PENDING ?? '');

    test('an inbound agent points the number\'s Voice URL at the engine, saves its webhook once, and unlinking puts it back exactly', async ({
        page,
        db,
    }) => {
        const { frontDesk, afterHours, sales } = await seedAgents(db);
        const numberId = await seedTwilioNumber(db, WEBHOOK_NUMBER);

        await linkNumber(page, afterHours, WEBHOOK_NUMBER);
        expect(writeBodies()).toEqual([
            {
                path: `/IncomingPhoneNumbers/${sidOf(101)}.json`,
                body: { VoiceUrl: engineVoiceUrl(numberId), VoiceMethod: 'POST' },
            },
        ]);
        expect(fakeNumber(WEBHOOK_NUMBER)).toMatchObject({ voice_url: engineVoiceUrl(numberId), voice_method: 'POST' });
        let stored = await storedNumber(db, WEBHOOK_NUMBER);
        expect(stored.twilio?.previousRouting).toEqual({
            voiceUrl: TWILIO_CUSTOMER_VOICE_URL,
            voiceMethod: 'GET',
            voiceApplicationSid: '',
            trunkSid: '',
        });
        await openPhoneNumbers(page);
        await expect(numberUse(page, WEBHOOK_NUMBER)).toHaveText('Answers calls with After hours');

        // Another inbound agent: nothing changes at Twilio, and the saved webhook is still theirs.
        twilio.clear();
        await linkNumber(page, frontDesk, WEBHOOK_NUMBER);
        expect(twilio.requests).toHaveLength(0);
        stored = await storedNumber(db, WEBHOOK_NUMBER);
        expect(stored.inboundAgentId?.toString()).toBe(frontDesk);
        expect(stored.twilio?.previousRouting?.voiceUrl).toBe(TWILIO_CUSTOMER_VOICE_URL);

        await unlinkNumber(page, frontDesk, WEBHOOK_NUMBER);
        expect(writeBodies()).toEqual([
            {
                path: `/IncomingPhoneNumbers/${sidOf(101)}.json`,
                body: { VoiceUrl: TWILIO_CUSTOMER_VOICE_URL, VoiceMethod: 'GET' },
            },
        ]);
        expect(twilio.numbers).toEqual(original);
        stored = await storedNumber(db, WEBHOOK_NUMBER);
        expect(stored.inboundAgentId).toBeNull();
        expect(stored.twilio).toEqual({ accountSid: FAKE_TWILIO_ACCOUNT_SID, apiKeySid: FAKE_TWILIO_KEY_SID });

        // An outbound agent changes nothing in the account: the engine dials with the Calls API.
        twilio.clear();
        await linkNumber(page, sales, WEBHOOK_NUMBER);
        expect(twilio.requests).toHaveLength(0);

        // An inbound agent again: only the Voice URL moves, saving the customer's webhook afresh.
        await linkNumber(page, afterHours, WEBHOOK_NUMBER);
        expect(writeBodies()).toEqual([
            {
                path: `/IncomingPhoneNumbers/${sidOf(101)}.json`,
                body: { VoiceUrl: engineVoiceUrl(numberId), VoiceMethod: 'POST' },
            },
        ]);
        stored = await storedNumber(db, WEBHOOK_NUMBER);
        expect(stored.outboundAgentId).toBeNull();
        expect(stored.twilio?.previousRouting?.voiceUrl).toBe(TWILIO_CUSTOMER_VOICE_URL);
    });

    test('a number on a TwiML app or a SIP trunk is taken off it, and put back on it exactly', async ({ page, db }) => {
        const { afterHours } = await seedAgents(db);
        const appId = await seedTwilioNumber(db, APP_NUMBER);
        const trunkId = await seedTwilioNumber(db, TRUNK_NUMBER);

        await linkNumber(page, afterHours, APP_NUMBER);
        await linkNumber(page, afterHours, TRUNK_NUMBER);
        expect(writeBodies()).toEqual([
            {
                path: `/IncomingPhoneNumbers/${sidOf(102)}.json`,
                body: { VoiceUrl: engineVoiceUrl(appId), VoiceMethod: 'POST', VoiceApplicationSid: '' },
            },
            {
                path: `/IncomingPhoneNumbers/${sidOf(103)}.json`,
                body: { VoiceUrl: engineVoiceUrl(trunkId), VoiceMethod: 'POST', TrunkSid: '' },
            },
        ]);
        expect((await storedNumber(db, APP_NUMBER)).twilio?.previousRouting).toEqual({
            voiceUrl: '',
            voiceMethod: 'POST',
            voiceApplicationSid: TWILIO_CUSTOMER_APP_SID,
            trunkSid: '',
        });
        expect((await storedNumber(db, TRUNK_NUMBER)).twilio?.previousRouting).toEqual({
            voiceUrl: '',
            voiceMethod: 'POST',
            voiceApplicationSid: '',
            trunkSid: TWILIO_CUSTOMER_TRUNK_SID,
        });

        twilio.clear();
        await unlinkNumber(page, afterHours, APP_NUMBER);
        await unlinkNumber(page, afterHours, TRUNK_NUMBER);
        expect(fakeNumber(APP_NUMBER)).toEqual({ ...originalOf(APP_NUMBER), voice_url: '' });
        expect(fakeNumber(TRUNK_NUMBER)).toEqual({ ...originalOf(TRUNK_NUMBER), voice_url: '' });
    });

    test('Twilio refusing to take a number off its trunk is explained, and nothing is saved or changed', async ({
        page,
        db,
    }) => {
        const { afterHours } = await seedAgents(db);
        await seedTwilioNumber(db, TRUNK_NUMBER);
        twilio.refuseTrunkRemoval = true;

        await expect(linkNumber(page, afterHours, TRUNK_NUMBER)).rejects.toThrow();
        await expect(page.getByText(`Twilio would not take ${TRUNK_NUMBER} off its SIP trunk`)).toBeVisible();
        const stored = await storedNumber(db, TRUNK_NUMBER);
        expect(stored.inboundAgentId).toBeNull();
        expect(stored.twilio).not.toHaveProperty('previousRouting');
        expect(twilio.numbers).toEqual(original);
    });

    test('routing the customer changed in the Console since is left alone when the number is unlinked', async ({
        page,
        db,
    }) => {
        const { afterHours } = await seedAgents(db);
        await seedTwilioNumber(db, WEBHOOK_NUMBER);
        await linkNumber(page, afterHours, WEBHOOK_NUMBER);

        const studio = `https://webhooks.twilio.com/v1/Accounts/${FAKE_TWILIO_ACCOUNT_SID}/Flows/FW${'9'.repeat(32)}`;
        fakeNumber(WEBHOOK_NUMBER).voice_url = studio;
        twilio.clear();
        await unlinkNumber(page, afterHours, WEBHOOK_NUMBER);
        expect(twilio.writes()).toHaveLength(0);
        expect(fakeNumber(WEBHOOK_NUMBER).voice_url).toBe(studio);
        expect((await storedNumber(db, WEBHOOK_NUMBER)).twilio).not.toHaveProperty('previousRouting');
    });

    test('removing an answering Twilio number puts its voice settings back, then forgets it', async ({ page, db }) => {
        const { afterHours } = await seedAgents(db);
        await seedTwilioNumber(db, APP_NUMBER);
        await linkNumber(page, afterHours, APP_NUMBER);
        twilio.clear();

        await openPhoneNumbers(page);
        const dialog = await openRemove(page, APP_NUMBER);
        await expect(dialog).toContainText('its Twilio voice settings are put back exactly');
        await dialog.getByRole('button', { name: 'Remove number' }).click();
        await expect(page.getByText('No phone numbers yet')).toBeVisible();
        expect(writeBodies()).toEqual([
            {
                path: `/IncomingPhoneNumbers/${sidOf(102)}.json`,
                body: { VoiceUrl: '', VoiceMethod: 'POST', VoiceApplicationSid: TWILIO_CUSTOMER_APP_SID },
            },
        ]);
        expect(await db.getVoiceNumbers(E2E_USER)).toHaveLength(0);
    });
});
