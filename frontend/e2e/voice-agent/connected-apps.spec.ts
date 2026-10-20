import { ObjectId } from 'mongodb';
import type { Page } from '@playwright/test';
import {
    VOICE_AGENT_SUB_MODULES,
    VoiceAgentCallType,
    VoiceBookingStatus,
    VoiceCalendarConnectionStatus,
    VoiceCalendarProvider,
    VoiceCallChannel,
    type VoiceAgentBookingTool,
} from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';
import type { E2eDb } from '../support/db';
import { expect, test } from '../support/fixtures';
import { E2E_BASE_URL, E2E_COMPOSIO_API_KEY, USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';
import { openVoiceAgent, voiceAgentUrl, waitForHydration } from '../support/voice-agents';
import { CAL_EVENT_TYPES, FAKE_ACCESS_TOKEN, FakeComposio } from './fake-composio';

/**
 * Connected apps: the owner connects their own Google Calendar (Outlook, Cal.com, Calendly)
 * through Composio's managed auth, an agent books into it, and Bookings cancels there too. Every
 * Composio tool runs in a session with the direct tools preset (one per connection, stored on it);
 * the Connect Link comes from a session too, and the legacy direct endpoints are never used.
 * Composio is a local fake (`fake-composio.ts`); the engine's side (free/busy, creating the
 * event, the mirror doc) is covered by the engine's tests/calendars_unit.py and calendars_e2e.py
 * against a Python fake, and the mirror doc it writes is seeded here exactly as it writes it.
 */
test.use({ storageState: USER_STORAGE_STATE, timezoneId: 'Asia/Kolkata' });

const BOOKINGS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS];
const OPEN = { open: '09:00', close: '18:00' };
const BOOKING: VoiceAgentBookingTool = {
    enabled: true,
    timezone: 'Asia/Kolkata',
    slotMinutes: 30,
    maxDaysAhead: 30,
    hours: { mon: OPEN, tue: OPEN, wed: OPEN, thu: OPEN, fri: OPEN, sat: OPEN },
};

let composio: FakeComposio;

test.beforeAll(async () => {
    composio = await FakeComposio.start();
});

test.afterEach(() => {
    // Nothing may fall back to Composio's legacy direct execution or its non-session connect link.
    expect(composio.find('POST', /\/tools\/execute\/|\/connected_accounts\/link$/)).toHaveLength(0);
});

test.afterAll(async () => {
    await composio.stop();
});

test.beforeEach(async ({ db }) => {
    await db.resetUser(E2E_USER);
    await db.resetVoiceAgents(E2E_USER);
    await db.resetVoiceBookings(E2E_USER);
    await db.resetVoiceCalendarConnections(E2E_USER);
    composio.requests.length = 0;
    composio.runs.length = 0;
    // Each test starts with no Composio sessions: earlier tests' pinned sessions outlive their
    // (reset) connection docs, and assertions count what is left.
    composio.sessions.clear();
    composio.failTool.clear();
    composio.refuseNext = false;
    composio.calEventTypes = [...CAL_EVENT_TYPES];
});

/** Text that must never show while coming back from Composio (the old callback flashed it). */
const NOT_FOUND = /No data found|not found|could not be found/i;

/**
 * Records, across full page loads, whether the page ever said "not found" and whether it said what
 * it was connecting (`window.sessionStorage`, so Composio's redirect and ours do not lose it).
 */
async function watchCallback(page: Page): Promise<() => Promise<{ notFound: boolean; connecting: string[] }>> {
    await page.addInitScript((pattern) => {
        const notFound = new RegExp(pattern, 'i');
        const check = () => {
            const text = document.body?.innerText ?? '';
            if (notFound.test(text)) sessionStorage.setItem('e2e-not-found', text.slice(0, 300));
            const connecting = text.match(/Connecting [A-Za-z. ]+…/);
            if (connecting) sessionStorage.setItem('e2e-connecting', connecting[0]);
        };
        new MutationObserver(check).observe(document, { childList: true, subtree: true, characterData: true });
    }, NOT_FOUND.source);
    return async () =>
        page.evaluate(() => ({
            notFound: !!sessionStorage.getItem('e2e-not-found'),
            connecting: [sessionStorage.getItem('e2e-connecting') ?? ''].filter(Boolean),
        }));
}

/** Every logo in `scope` is the app's own mark, loaded. */
async function expectLogos(scope: ReturnType<Page['locator']>, files: string[]): Promise<void> {
    for (const file of files) {
        const logo = scope.locator(`img[src="/brand-logos/${file}.svg"]`).first();
        await expect(logo).toBeVisible();
        await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    }
}

async function agentWithBooking(db: E2eDb, booking: VoiceAgentBookingTool | null = BOOKING): Promise<string> {
    const agentId = await db.insertVoiceAgent(E2E_USER, { name: 'Front desk', callType: VoiceAgentCallType.INBOUND });
    await db.setVoiceAgentTools(agentId, { booking, webhooks: [] });
    return agentId;
}

async function userId(db: E2eDb): Promise<string> {
    return (await db.getUser(E2E_USER))._id.toString();
}

/** The direct tools preset session body (server/voice-agent/composio.ts sessionConfig). */
function presetSession(uid: string, toolkit: string, tools: string[], extra: Record<string, unknown> = {}) {
    return {
        user_id: uid,
        toolkits: { enable: [toolkit] },
        tools: { [toolkit]: { enable: tools } },
        manage_connections: { enable: false },
        workbench: { enable: false },
        preload: { tools: 'all' },
        search: { enable: false },
        execute: { enable_multi_execute: false },
        multi_account: { enable: false },
        ...extra,
    };
}

const GOOGLE_TOOLS = [
    'GOOGLECALENDAR_FREE_BUSY_QUERY',
    'GOOGLECALENDAR_CREATE_EVENT',
    'GOOGLECALENDAR_DELETE_EVENT',
    'GOOGLECALENDAR_LIST_CALENDARS',
];

async function pick(page: Page, triggerId: string, option: string | RegExp): Promise<void> {
    await page.locator(`#${triggerId}`).click();
    await page.getByRole('option', { name: option }).click();
}

test('connect Google Calendar: Connect Link, back to the agent booking into it, pick another calendar', async ({
    page,
    db,
}) => {
    const agentId = await agentWithBooking(db);
    const uid = await userId(db);
    const callbackSeen = await watchCallback(page);
    await openVoiceAgent(page, agentId);

    const apps = page.getByTestId('connected-apps');
    await expect(apps.getByText('Your own calendars and booking apps')).toBeVisible();
    await expectLogos(page.getByTestId('connect-app-buttons'), ['google-calendar', 'outlook', 'cal-com', 'calendly']);
    // CRMs are announced, not connectable yet.
    const crm = page.getByTestId('connect-crm-soon');
    await expect(crm).toContainText('Connect your own CRM');
    await expect(crm).toContainText('Coming soon');
    await expect(crm.getByRole('button')).toHaveCount(0);
    await expectLogos(crm, ['highlevel', 'hubspot', 'salesforce']);
    await expect(page.locator('#booking-destination')).toHaveText('Built-in calendar');
    await apps.getByRole('button', { name: 'Connect Google Calendar', exact: true }).click();

    // Composio's page sends the browser back; the callback says what it is doing, checks it and
    // returns to the agent, without ever showing a "not found" page on the way.
    await page.waitForURL(`**${voiceAgentUrl(agentId)}?connected=*`, { timeout: 30_000 }).catch(() => undefined);
    await expect(page).toHaveURL(new RegExp(`${voiceAgentUrl(agentId)}$`), { timeout: 30_000 });
    await expect(page.getByText('Google Calendar connected as ravi@example.com')).toBeVisible();
    await expect(page.getByText("Bookings now go to Ravi's calendar.")).toBeVisible();
    expect(await callbackSeen()).toEqual({ notFound: false, connecting: ['Connecting Google Calendar…'] });
    await expect(page.getByTestId('voice-agent-tools')).toBeInViewport();

    // One Composio-managed auth config for the toolkit; the link comes from a session made for this
    // attempt (that config, no account pinned, in-chat auth off), back to our callback.
    const [created] = composio.find('POST', '/api/v3.1/auth_configs');
    expect(created.body).toEqual({
        toolkit: { slug: 'googlecalendar' },
        auth_config: { type: 'use_composio_managed_auth', name: 'Aixel voice agents: Google Calendar' },
    });
    const authConfigId = composio.authConfigs[0].id;
    const sessions = composio.find('POST', '/api/v3.1/tool_router/session');
    expect(sessions[0].body).toEqual(
        presetSession(uid, 'googlecalendar', GOOGLE_TOOLS, { auth_configs: { googlecalendar: authConfigId } }),
    );
    const [link] = composio.find('POST', /^\/api\/v3\.1\/tool_router\/session\/trs_[a-f0-9]+\/link$/);
    expect(link.body).toEqual({
        toolkit: 'googlecalendar',
        callback_url: `${E2E_BASE_URL}/voice-agent/agents/connected-apps/callback?agent=${agentId}&app=GOOGLE_CALENDAR`,
    });
    const linkSession = link.path.split('/')[5]; // /api/v3.1/tool_router/session/<id>/link
    expect(
        composio.requests.filter((r) => !r.path.startsWith('/link/')).every((r) => r.apiKey === E2E_COMPOSIO_API_KEY),
    ).toBe(true);

    // Once ACTIVE: the connection's own session, pinned to the new account; the link's session is deleted.
    const accountId = [...composio.accounts.values()].find((a) => a.userId === uid)?.id ?? 'missing';
    expect(sessions[1].body).toEqual(
        presetSession(uid, 'googlecalendar', GOOGLE_TOOLS, {
            connected_accounts: { googlecalendar: [accountId] },
            auth_configs: { googlecalendar: authConfigId },
        }),
    );
    expect(composio.find('DELETE', `/api/v3.1/tool_router/session/${linkSession}`)).toHaveLength(1);
    expect(composio.sessions.has(linkSession)).toBe(false);
    const [connection] = await db.getVoiceCalendarConnections(E2E_USER);
    expect(connection).toMatchObject({
        provider: VoiceCalendarProvider.GOOGLE_CALENDAR,
        status: VoiceCalendarConnectionStatus.ACTIVE,
        label: 'ravi@example.com',
        connectedAccountId: accountId,
        authConfigId,
    });
    const pinned = connection.composioSessionId ?? 'missing';
    expect(composio.sessions.get(pinned)?.account).toBe(accountId);
    // The label is the account's email (Google's main calendar id), read in that session at once;
    // Composio's own made-up name for the account is never shown.
    expect(composio.toolRuns('GOOGLECALENDAR_LIST_CALENDARS')[0]).toMatchObject({
        session_id: pinned,
        connected_account_id: accountId,
    });
    const row = apps.getByTestId('connected-app-GOOGLE_CALENDAR');
    await expect(row).toContainText('Connected');
    await expect(row).toContainText('ravi@example.com');
    await expect(apps).not.toContainText('quiet-otter');
    await expectLogos(row, ['google-calendar']);
    // Another account of the same app is offered as such.
    await expect(apps.getByRole('button', { name: 'Connect another Google Calendar account', exact: true })).toBeVisible();
    await expect(apps.getByRole('button', { name: 'Connect Outlook', exact: true })).toBeVisible();

    // The agent booked into the built-in calendar, so it was pointed at the new account's main
    // calendar on the server and saved: nothing for the owner to do.
    await expect(page.locator('#booking-destination')).toHaveText('Google Calendar (ravi@example.com)');
    await expect(page.locator('#booking-calendar')).toHaveText(/Ravi's calendar/);
    await expect(page.getByTestId('booking-tool').getByText('Unsaved changes')).toHaveCount(0);
    expect((await db.getVoiceAgentDoc(agentId)).tools?.booking?.destination).toEqual({
        provider: VoiceCalendarProvider.GOOGLE_CALENDAR,
        connectedAccountId: accountId,
        calendarId: 'primary',
        calendarName: "Ravi's calendar",
    });
    await expectLogos(page.locator('#booking-destination'), ['google-calendar']);
    // The owner picks another calendar and saves.
    await pick(page, 'booking-calendar', /^Clinic/);
    await page.getByRole('button', { name: 'Save booking' }).click();
    await expect(page.getByText('Booking settings saved')).toBeVisible();
    await expect
        .poll(async () => (await db.getVoiceAgentDoc(agentId)).tools?.booking?.destination)
        .toEqual({
            provider: VoiceCalendarProvider.GOOGLE_CALENDAR,
            connectedAccountId: connection.connectedAccountId,
            calendarId: 'clinic@group.calendar.google.com',
            calendarName: 'Clinic',
        });
    // Every calendar list ran in the connection's session (no new one made for it), and no run named
    // an account: the session pins it, and Composio refuses `account` without multi-account.
    const listed = composio.toolRuns('GOOGLECALENDAR_LIST_CALENDARS');
    expect(listed.every((r) => r.session_id === pinned && r.user_id === uid)).toBe(true);
    expect(composio.find('POST', '/api/v3.1/tool_router/session')).toHaveLength(2);
    expect(composio.find('POST', /\/execute$/).every((r) => r.body && !('account' in r.body))).toBe(true);

    // Neither Composio's key, its session id nor the account's tokens ever reach the browser.
    const html = await page.content();
    expect(html).not.toContain(FAKE_ACCESS_TOKEN);
    expect(html).not.toContain(E2E_COMPOSIO_API_KEY);
    expect(html).not.toContain(pinned);

    // After a reload: still there. Back to the built-in calendar removes the destination.
    await openVoiceAgent(page, agentId);
    await expect(page.locator('#booking-destination')).toHaveText('Google Calendar (ravi@example.com)');
    await expect(page.locator('#booking-calendar')).toHaveText(/Clinic/);
    await pick(page, 'booking-destination', 'Built-in calendar');
    await expect(page.locator('#booking-calendar')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save booking' }).click();
    await expect(page.getByText('Booking settings saved')).toBeVisible();
    await expect.poll(async () => (await db.getVoiceAgentDoc(agentId)).tools?.booking?.destination).toBeUndefined();

    // A second account of the same app reuses Google's auth config.
    await apps.getByRole('button', { name: 'Connect another Google Calendar account', exact: true }).click();
    await expect(page.getByText('Google Calendar connected as ravi@example.com')).toBeVisible({ timeout: 30_000 });
    expect(composio.find('POST', '/api/v3.1/auth_configs')).toHaveLength(1);
    expect(await callbackSeen()).toMatchObject({ notFound: false });
});

test('the callback refuses an account this user did not start, and a refused consent', async ({ page, db }) => {
    const agentId = await agentWithBooking(db);
    // Someone else's connection id pasted into our callback.
    composio.seedAccount({ id: 'ca_someone_else', userId: new ObjectId().toString(), toolkit: 'googlecalendar' });
    await page.goto(
        `/voice-agent/agents/connected-apps/callback?status=success&connected_account_id=ca_someone_else&agent=${agentId}`,
    );
    const error = page.getByTestId('connected-app-callback-error');
    await expect(error).toContainText('This connection was not started from your account');
    await expect(error.getByRole('link', { name: 'Back to the agent' })).toHaveAttribute('href', voiceAgentUrl(agentId));
    expect(await db.getVoiceCalendarConnections(E2E_USER)).toHaveLength(0);

    // The owner closes Composio's consent screen.
    await openVoiceAgent(page, agentId);
    composio.refuseNext = true;
    await page.getByRole('button', { name: 'Connect Outlook', exact: true }).click();
    await expect(page.getByTestId('connected-app-callback-error')).toContainText('Outlook was not connected', {
        timeout: 30_000,
    });
    const [failed] = await db.getVoiceCalendarConnections(E2E_USER);
    expect(failed.status).toBe(VoiceCalendarConnectionStatus.FAILED);
    // No session is kept for it: the link's one is deleted, none pinned.
    expect(failed.composioSessionId ?? null).toBeNull();
    expect(composio.sessions.size).toBe(0);
    await page.getByRole('link', { name: 'Back to the agent' }).click();
    await waitForHydration(page, '#booking-destination');
    // Listed as not connected, with a retry and a remove; not offered as a destination.
    const outlook = page.getByTestId('connected-app-OUTLOOK');
    await expect(outlook).toContainText('Not connected');
    await expect(outlook.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(outlook.getByRole('button', { name: 'Remove Outlook' })).toBeVisible();
    await page.locator('#booking-destination').click();
    await expect(page.getByRole('option')).toHaveText(['Built-in calendar']);
    await page.keyboard.press('Escape');

    // Trying again and succeeding replaces the failed attempt.
    await outlook.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Outlook connected as ravi@example.com')).toBeVisible({ timeout: 30_000 });
    expect((await db.getVoiceCalendarConnections(E2E_USER)).map((c) => c.status)).toEqual([
        VoiceCalendarConnectionStatus.ACTIVE,
    ]);
    await expect(page.locator('#booking-destination')).toHaveText('Outlook (ravi@example.com)');
    await expect(page.locator('#booking-calendar')).toHaveText(/Calendar/);
});

test('disconnect: gone from Composio, and the agent books into the built-in calendar again', async ({ page, db }) => {
    const uid = await userId(db);
    composio.seedAccount({ id: 'ca_cal_e2e', userId: uid, toolkit: 'cal', label: 'ravi' });
    await db.insertVoiceCalendarConnection(E2E_USER, {
        provider: VoiceCalendarProvider.CAL_COM,
        connectedAccountId: 'ca_cal_e2e',
        label: 'ravi',
    });
    const agentId = await agentWithBooking(db, {
        ...BOOKING,
        destination: {
            provider: VoiceCalendarProvider.CAL_COM,
            connectedAccountId: 'ca_cal_e2e',
            calendarId: '1234',
            calendarName: '30 min consultation',
        },
    });
    await openVoiceAgent(page, agentId);
    await expect(page.locator('#booking-destination')).toHaveText('Cal.com (ravi)');
    await expect(page.getByText('Event type', { exact: true })).toBeVisible();
    await expect(page.locator('#booking-calendar')).toHaveText(/30 min consultation/);
    await expect(page.getByTestId('booking-destination')).toContainText('Callers are asked for an email address.');

    await page.getByRole('button', { name: 'Disconnect Cal.com (ravi)' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
    await expect(page.getByText('Cal.com disconnected; one agent books into the built-in calendar again')).toBeVisible();
    expect(composio.find('DELETE', '/api/v3.1/connected_accounts/ca_cal_e2e')).toHaveLength(1);
    // The session the event type list made (the seeded connection had none yet) is deleted with it.
    const [made] = composio.find('POST', '/api/v3.1/tool_router/session');
    expect(made.body).toMatchObject({ user_id: uid, connected_accounts: { cal: ['ca_cal_e2e'] } });
    expect(composio.toolRuns('CAL_LIST_EVENT_TYPES')[0]?.connected_account_id).toBe('ca_cal_e2e');
    expect(composio.find('DELETE', /^\/api\/v3\.1\/tool_router\/session\/trs_/)).toHaveLength(1);
    expect(composio.sessions.size).toBe(0);
    expect(await db.getVoiceCalendarConnections(E2E_USER)).toHaveLength(0);
    expect((await db.getVoiceAgentDoc(agentId)).tools?.booking?.destination ?? null).toBeNull();
    await expect(page.locator('#booking-destination')).toHaveText('Built-in calendar');
    await expect(page.getByTestId('connected-apps-list')).toHaveCount(0);
});

test('Bookings: a booking in Google Calendar says so, and cancelling cancels it there', async ({ page, db }) => {
    const uid = await userId(db);
    composio.seedAccount({ id: 'ca_google_e2e', userId: uid, toolkit: 'googlecalendar' });
    // Its session was deleted on Composio's side since: the first cancel makes a new one and stores it.
    await db.insertVoiceCalendarConnection(E2E_USER, {
        provider: VoiceCalendarProvider.GOOGLE_CALENDAR,
        connectedAccountId: 'ca_google_e2e',
        composioSessionId: 'trs_e2e_deleted',
    });
    const agentId = await agentWithBooking(db);
    const start = new Date(Date.now() + 3 * 86_400_000);
    start.setUTCHours(8, 30, 0, 0);
    const external = {
        provider: VoiceCalendarProvider.GOOGLE_CALENDAR,
        eventId: 'evt_e2e_1',
        connectedAccountId: 'ca_google_e2e',
        calendarId: 'primary',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
    };
    const seed = {
        agentId: new ObjectId(agentId),
        callId: null,
        channel: VoiceCallChannel.PHONE,
        end: new Date(start.getTime() + 30 * 60_000),
        timezone: 'Asia/Kolkata',
        customerPhone: '+15557770000',
        notes: null,
        status: VoiceBookingStatus.BOOKED,
    };
    // Exactly what the engine's book_appointment writes after creating the Google event.
    const [ravi, asha] = await db.insertVoiceBookings(E2E_USER, [
        { ...seed, start, customerName: 'Ravi Kumar', external },
        {
            ...seed,
            start: new Date(start.getTime() + 3_600_000),
            end: new Date(start.getTime() + 5_400_000),
            customerName: 'Asha',
            external: { ...external, eventId: 'evt_e2e_2' },
        },
    ]);

    await page.goto(BOOKINGS_URL);
    await waitForHydration(page, '#bookings-agent-filter');
    const card = page.locator(`#booking-${ravi}`);
    await expect(card.getByTestId('booking-external')).toContainText('In Google Calendar');
    await expect(card.getByRole('link', { name: 'Meeting link' })).toHaveAttribute('href', external.meetingUrl);

    await card.getByRole('button', { name: 'Cancel booking' }).click();
    await page.getByRole('dialog', { name: 'Cancel this booking?' }).getByRole('button', { name: 'Cancel booking' }).click();
    await expect(card).toContainText('Cancelled');
    const [run] = composio.toolRuns('GOOGLECALENDAR_DELETE_EVENT');
    const [renewed] = await db.getVoiceCalendarConnections(E2E_USER);
    expect(renewed.composioSessionId).toMatch(/^trs_[a-f0-9]+$/);
    expect(run).toEqual({
        session_id: renewed.composioSessionId,
        user_id: uid,
        connected_account_id: 'ca_google_e2e',
        arguments: { event_id: 'evt_e2e_1', calendar_id: 'primary', send_updates: 'all' },
    });
    // Composio was asked whether the stored session is really gone before a new one was made.
    expect(composio.find('GET', '/api/v3.1/tool_router/session/trs_e2e_deleted')).toHaveLength(1);
    expect(composio.find('POST', '/api/v3.1/tool_router/session')).toHaveLength(1);
    expect((await db.getVoiceBookings(E2E_USER)).find((b) => b._id.toString() === ravi)?.status).toBe(
        VoiceBookingStatus.CANCELLED,
    );

    // Google refuses: nothing changes here, and the owner is told why.
    composio.failTool.set('GOOGLECALENDAR_DELETE_EVENT', '403 Forbidden: insufficient permissions for this calendar');
    const other = page.locator(`#booking-${asha}`);
    await other.getByRole('button', { name: 'Cancel booking' }).click();
    await page.getByRole('dialog', { name: 'Cancel this booking?' }).getByRole('button', { name: 'Cancel booking' }).click();
    await expect(page.getByText(/Could not cancel it in Google Calendar \(403 Forbidden/)).toBeVisible();
    // ...through the same session: no new one.
    expect(composio.find('POST', '/api/v3.1/tool_router/session')).toHaveLength(1);
    expect((await db.getVoiceBookings(E2E_USER)).find((b) => b._id.toString() === asha)?.status).toBe(
        VoiceBookingStatus.BOOKED,
    );
});

test('Cal.com with several event types: offered on the agent, the owner chooses which one', async ({ page, db }) => {
    composio.calEventTypes = [
        { id: 1234, title: '30 min consultation', lengthInMinutes: 30 },
        { id: 5678, title: 'First visit', lengthInMinutes: 60 },
    ];
    const agentId = await agentWithBooking(db);
    await openVoiceAgent(page, agentId);
    await page.getByRole('button', { name: 'Connect Cal.com', exact: true }).click();
    await expect(page.getByText('Cal.com connected as ravi@example.com')).toBeVisible({ timeout: 30_000 });

    // Nothing saved for it: which event type is the owner's call. The agent offers Cal.com, asks for one.
    expect((await db.getVoiceAgentDoc(agentId)).tools?.booking?.destination ?? null).toBeNull();
    await expect(page.locator('#booking-destination')).toHaveText('Cal.com (ravi@example.com)');
    await expect(page.locator('#booking-calendar')).toHaveText('Choose an event type');
    await expect(page.getByTestId('booking-error')).toHaveText('Choose the event type bookings go to');
    await expect(page.getByRole('button', { name: 'Save booking' })).toBeDisabled();
    await expectLogos(page.locator('#booking-destination'), ['cal-com']);

    await pick(page, 'booking-calendar', /^First visit/);
    await page.getByRole('button', { name: 'Save booking' }).click();
    await expect(page.getByText('Booking settings saved')).toBeVisible();
    expect((await db.getVoiceAgentDoc(agentId)).tools?.booking?.destination).toMatchObject({
        provider: VoiceCalendarProvider.CAL_COM,
        calendarId: '5678',
        calendarName: 'First visit',
    });
});

test('an older connection labelled with Composio’s made-up name shows the account’s email', async ({ page, db }) => {
    const uid = await userId(db);
    composio.seedAccount({ id: 'ca_google_old', userId: uid, toolkit: 'googlecalendar', label: 'owner@clinic.example' });
    await db.insertVoiceCalendarConnection(E2E_USER, {
        provider: VoiceCalendarProvider.GOOGLE_CALENDAR,
        connectedAccountId: 'ca_google_old',
        label: 'googlecalendar_trench-flue',
    });
    const agentId = await agentWithBooking(db);
    await openVoiceAgent(page, agentId);
    const row = page.getByTestId('connected-app-GOOGLE_CALENDAR');
    await expect(row).toContainText('owner@clinic.example');
    await expect(row).not.toContainText('trench-flue');
    expect((await db.getVoiceCalendarConnections(E2E_USER))[0].label).toBe('owner@clinic.example');

    // Read once: the next visit asks Composio nothing.
    const runs = composio.toolRuns('GOOGLECALENDAR_LIST_CALENDARS').length;
    await openVoiceAgent(page, agentId);
    await expect(row).toContainText('owner@clinic.example');
    expect(composio.toolRuns('GOOGLECALENDAR_LIST_CALENDARS')).toHaveLength(runs);
});

test('phone width: connected apps and the destination picker fit without sideways scrolling', async ({ page, db }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const uid = await userId(db);
    composio.seedAccount({ id: 'ca_google_m', userId: uid, toolkit: 'googlecalendar' });
    await db.insertVoiceCalendarConnection(E2E_USER, {
        provider: VoiceCalendarProvider.GOOGLE_CALENDAR,
        connectedAccountId: 'ca_google_m',
        label: 'a-rather-long-address.for-a-clinic@example.com',
    });
    const agentId = await agentWithBooking(db);
    await openVoiceAgent(page, agentId);
    await pick(page, 'booking-destination', /Google Calendar/);
    await expect(page.locator('#booking-calendar')).toHaveText(/Ravi's calendar/);
    // A long account name is cut short inside the picker, not pushed past the card.
    const within = await page.locator('#booking-destination').evaluate((el) => {
        const card = el.closest('[data-testid="voice-agent-tools"]')?.getBoundingClientRect();
        return !!card && el.getBoundingClientRect().right <= card.right;
    });
    expect(within).toBe(true);
    await page.getByTestId('connected-apps').scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
});
