import 'server-only';

import {
    VoiceCalendarConnectionStatus,
    VoiceCalendarProvider,
    type VoiceBookingExternal,
} from '@aixellabs/backend/db/types';
import { voiceCalendarProviderLabel } from '@/helpers/voice-calendar-providers';

/**
 * Customers' own booking apps, through Composio (REST v3.1, project API key).
 *
 * How it fits together (the engine side is calendars.py / tools.py in backend/voice):
 *
 * - **Who**: Composio `user_id` = our user's `_id` as a string. Every connected account and
 *   every session is created under it, and a session is pinned to one connected account, so
 *   one user can never act on another's account.
 * - **Auth**: Composio's own managed auth. One auth config per toolkit
 *   (`use_composio_managed_auth`), created through the API the first time anyone connects
 *   that app, then reused. No Aixel Labs Google/Microsoft OAuth app; the consent screen
 *   names Composio.
 * - **Sessions, not direct execution**: Composio calls `POST /tools/execute/{slug}` its legacy
 *   interface (https://docs.composio.dev/docs/sessions-vs-direct-execution). Tools run in a
 *   session with the direct tools preset (https://docs.composio.dev/docs/configuring-sessions#direct-tools-preset):
 *   `POST /tool_router/session` with one toolkit, exactly `CALENDAR_TOOLS` for it, and the
 *   connection manager, sandbox, search and multi-execute off (`sessionConfig()`, the body the
 *   SDKs send for `SessionPreset.DIRECT_TOOLS`), then `POST /tool_router/session/{id}/execute`
 *   `{tool_slug, arguments}` (the session pins the account; Composio refuses an `account` field
 *   while multi-account is off, 400 code 4300); `result_type` (`completed` / `failed` / `input_required`)
 *   decides, never `error` alone. One session per connection, its id on
 *   the connection in voice_accounts.calendars (`composioSessionId`): sessions persist on Composio's side and
 *   do not expire, so both the app and the engine reuse it, and make a new one only when there
 *   is none or Composio says it is gone (`ComposioSessionGone`).
 * - **Connect**: `POST /tool_router/session/{id}/link` (what `session.authorize()` calls; the
 *   docs' way for an app's own connect button, https://docs.composio.dev/docs/authentication/manually-authenticating)
 *   on a session made for that attempt, with in-chat auth off. The owner signs in on the
 *   hosted Connect Link and Composio sends the browser back to our callback page with
 *   `status` + `connected_account_id`. We only trust that id when it matches the attempt we
 *   stored (voice_accounts.calendars, PENDING) and Composio lists it under the owner's
 *   `user_id`; the callback polls until Composio says ACTIVE, then makes the connection's own
 *   session pinned to that account (a session that pins an account for a toolkit cannot make
 *   links for it, so the link session is deleted then).
 * - **Use**: the agent's booking `destination` names the provider, the connected account and
 *   the calendar (Cal.com / Calendly: the event type). The engine reads free/busy and creates
 *   events in the connection's session; the app lists calendars, cancels events and disconnects.
 *
 * `COMPOSIO_API_KEY` (server env only, never sent to the browser; a scoped project key needs the
 * "Session management" and "Session tool execution" permissions, plus auth configs and connected
 * accounts) and `COMPOSIO_API_BASE` (default https://backend.composio.dev/api/v3.1; a local fake in e2e).
 */

const DEFAULT_API_BASE = 'https://backend.composio.dev/api/v3.1';
const TIMEOUT_MS = 15_000;

/** Composio toolkit slug per provider. */
export const COMPOSIO_TOOLKITS: Record<VoiceCalendarProvider, string> = {
    [VoiceCalendarProvider.GOOGLE_CALENDAR]: 'googlecalendar',
    [VoiceCalendarProvider.OUTLOOK]: 'outlook',
    [VoiceCalendarProvider.CAL_COM]: 'cal',
    [VoiceCalendarProvider.CALENDLY]: 'calendly',
};

/**
 * Every tool slug the app or the engine runs, per provider: a connection's session allows exactly
 * these. The same list as TOOLS in the engine's calendars.py (it makes sessions too); keep them equal.
 */
export const CALENDAR_TOOLS: Record<VoiceCalendarProvider, string[]> = {
    [VoiceCalendarProvider.GOOGLE_CALENDAR]: [
        'GOOGLECALENDAR_FREE_BUSY_QUERY',
        'GOOGLECALENDAR_CREATE_EVENT',
        'GOOGLECALENDAR_DELETE_EVENT',
        'GOOGLECALENDAR_LIST_CALENDARS',
    ],
    [VoiceCalendarProvider.OUTLOOK]: [
        'OUTLOOK_GET_CALENDAR_VIEW',
        'OUTLOOK_CALENDAR_CREATE_EVENT',
        'OUTLOOK_CANCEL_EVENT',
        'OUTLOOK_DELETE_CALENDAR_EVENT',
        'OUTLOOK_LIST_CALENDARS',
    ],
    [VoiceCalendarProvider.CAL_COM]: [
        'CAL_GET_AVAILABLE_SLOTS_INFO',
        'CAL_POST_NEW_BOOKING_REQUEST',
        'CAL_CANCEL_BOOKING_VIA_UID',
        'CAL_LIST_EVENT_TYPES',
    ],
    [VoiceCalendarProvider.CALENDLY]: [
        'CALENDLY_LIST_EVENT_TYPE_AVAILABLE_TIMES',
        'CALENDLY_POST_INVITEE',
        'CALENDLY_CANCEL_SCHEDULED_EVENT',
        'CALENDLY_GET_USER',
        'CALENDLY_LIST_EVENT_TYPES',
    ],
};

export class ComposioError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = 'ComposioError';
    }
}

/** Composio no longer has the session (execute answered 404/410 and GET of the session agrees). */
export class ComposioSessionGone extends ComposioError {
    constructor(message: string) {
        super(message, 404);
        this.name = 'ComposioSessionGone';
    }
}

export function isComposioConfigured(): boolean {
    return !!process.env.COMPOSIO_API_KEY?.trim();
}

function apiBase(): string {
    return (process.env.COMPOSIO_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/+$/, '');
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(body: unknown, status: number): string {
    const error = isRecord(body) ? body.error : null;
    const message = isRecord(error) ? error.message : typeof error === 'string' ? error : null;
    return typeof message === 'string' && message ? message : `Composio answered HTTP ${status}`;
}

async function composio(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    options: { query?: Record<string, string | string[] | number | boolean>; body?: Json } = {},
): Promise<Json> {
    const key = process.env.COMPOSIO_API_KEY?.trim();
    if (!key) throw new ComposioError('Connected apps are not set up on this server yet', 503);
    const url = new URL(`${apiBase()}${path}`);
    for (const [name, value] of Object.entries(options.query ?? {})) {
        for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(name, String(item));
    }
    let response: Response;
    try {
        response = await fetch(url, {
            method,
            headers: { 'x-api-key': key, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: 'no-store',
        });
    } catch (error) {
        throw new ComposioError(
            `Could not reach Composio (${error instanceof Error ? error.message : 'network error'})`,
            502,
        );
    }
    const text = await response.text();
    let body: unknown = null;
    try {
        body = text ? JSON.parse(text) : {};
    } catch {
        body = { error: text.slice(0, 200) };
    }
    if (!response.ok) throw new ComposioError(errorMessage(body, response.status), response.status);
    return isRecord(body) ? body : { value: body };
}

// ---------------------------------------------------------------------------
// Auth configs (one Composio-managed config per toolkit)
// ---------------------------------------------------------------------------

const authConfigIds = new Map<VoiceCalendarProvider, string>();

/** The Composio-managed auth config for a provider's toolkit: found, else created. */
export async function ensureManagedAuthConfig(provider: VoiceCalendarProvider): Promise<string> {
    const cached = authConfigIds.get(provider);
    if (cached) return cached;
    const toolkit = COMPOSIO_TOOLKITS[provider];
    const list = await composio('GET', '/auth_configs', {
        query: { toolkit_slug: toolkit, is_composio_managed: true, limit: 50 },
    });
    const items = Array.isArray(list.items) ? list.items.filter(isRecord) : [];
    const existing = items.find(
        (item) =>
            item.is_composio_managed === true &&
            item.status !== 'DISABLED' &&
            isRecord(item.toolkit) &&
            item.toolkit.slug === toolkit,
    );
    let id = typeof existing?.id === 'string' ? existing.id : null;
    if (!id) {
        const created = await composio('POST', '/auth_configs', {
            body: {
                toolkit: { slug: toolkit },
                auth_config: {
                    type: 'use_composio_managed_auth',
                    name: `Aixel voice agents: ${voiceCalendarProviderLabel(provider)}`,
                },
            },
        });
        const config = isRecord(created.auth_config) ? created.auth_config : null;
        id = typeof config?.id === 'string' ? config.id : null;
        if (!id) throw new ComposioError('Composio did not return the new auth config', 502);
    }
    authConfigIds.set(provider, id);
    return id;
}

// ---------------------------------------------------------------------------
// Connected accounts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sessions (direct tools preset)
// ---------------------------------------------------------------------------

/**
 * A direct-tools-preset session for one provider of `userId`: only `CALENDAR_TOOLS`, no search,
 * no multi-execute, no in-chat auth, no sandbox; pinned to `connectedAccountId` when given (a
 * session without the pin is only for making a Connect Link). Same body as session_config() in
 * the engine's calendars.py.
 */
export function sessionConfig(input: {
    userId: string;
    provider: VoiceCalendarProvider;
    authConfigId?: string | null;
    connectedAccountId?: string | null;
}): Json {
    const toolkit = COMPOSIO_TOOLKITS[input.provider];
    return {
        user_id: input.userId,
        toolkits: { enable: [toolkit] },
        tools: { [toolkit]: { enable: CALENDAR_TOOLS[input.provider] } },
        manage_connections: { enable: false },
        workbench: { enable: false },
        preload: { tools: 'all' },
        search: { enable: false },
        execute: { enable_multi_execute: false },
        // Composio refuses preload with multi-account on (400 code 4300, seen 2026-10-18); a session
        // runs as the one account pinned below, so multi-account is not needed.
        multi_account: { enable: false },
        ...(input.connectedAccountId ? { connected_accounts: { [toolkit]: [input.connectedAccountId] } } : {}),
        ...(input.authConfigId ? { auth_configs: { [toolkit]: input.authConfigId } } : {}),
    };
}

/** A new Composio session (see `sessionConfig`); its id. */
export async function createCalendarSession(input: Parameters<typeof sessionConfig>[0]): Promise<string> {
    const body = await composio('POST', '/tool_router/session', { body: sessionConfig(input) });
    if (typeof body.session_id !== 'string' || !body.session_id) {
        throw new ComposioError('Composio did not return a session', 502);
    }
    return body.session_id;
}

/** Deletes a session; already gone counts as done. */
export async function deleteCalendarSession(sessionId: string): Promise<void> {
    try {
        await composio('DELETE', `/tool_router/session/${encodeURIComponent(sessionId)}`);
    } catch (error) {
        if (error instanceof ComposioError && (error.status === 404 || error.status === 410)) return;
        throw error;
    }
}

async function sessionGone(sessionId: string): Promise<boolean> {
    try {
        await composio('GET', `/tool_router/session/${encodeURIComponent(sessionId)}`);
        return false;
    } catch (error) {
        return error instanceof ComposioError && (error.status === 404 || error.status === 410);
    }
}

export type ComposioConnectLink = { redirectUrl: string; connectedAccountId: string };

/**
 * A hosted Connect Link for the session's user to connect one app (`session.authorize()`);
 * Composio returns the browser to `callbackUrl`. The session must not pin an account for it.
 */
export async function createConnectLink(input: {
    sessionId: string;
    provider: VoiceCalendarProvider;
    callbackUrl: string;
}): Promise<ComposioConnectLink> {
    const body = await composio('POST', `/tool_router/session/${encodeURIComponent(input.sessionId)}/link`, {
        body: { toolkit: COMPOSIO_TOOLKITS[input.provider], callback_url: input.callbackUrl },
    });
    if (typeof body.redirect_url !== 'string' || typeof body.connected_account_id !== 'string') {
        throw new ComposioError('Composio did not return a connect link', 502);
    }
    return { redirectUrl: body.redirect_url, connectedAccountId: body.connected_account_id };
}

export type ComposioAccountState = {
    id: string;
    toolkit: string | null;
    status: VoiceCalendarConnectionStatus;
    /** Who it is connected as, when Composio knows ("ravi@example.com"; often it does not). */
    label: string | null;
    statusReason: string | null;
};

function mapStatus(status: unknown): VoiceCalendarConnectionStatus {
    if (status === 'ACTIVE') return VoiceCalendarConnectionStatus.ACTIVE;
    if (status === 'INITIATED' || status === 'INITIALIZING') return VoiceCalendarConnectionStatus.PENDING;
    return VoiceCalendarConnectionStatus.FAILED;
}

/**
 * The connected account, only if Composio lists it under this user (its single-account GET no
 * longer returns user_id). Tokens in `state` never leave this function.
 */
export async function getOwnedConnectedAccount(
    userId: string,
    connectedAccountId: string,
): Promise<ComposioAccountState | null> {
    const list = await composio('GET', '/connected_accounts', {
        query: { user_ids: [userId], connected_account_ids: [connectedAccountId], limit: 5 },
    });
    const items = Array.isArray(list.items) ? list.items.filter(isRecord) : [];
    const item = items.find((i) => i.id === connectedAccountId);
    if (!item) return null;
    const val = isRecord(item.state) && isRecord(item.state.val) ? item.state.val : {};
    // Not `word_id`: that is Composio's own made-up name for the account ("googlecalendar_trench-flue").
    const label = [val.displayName, item.alias].find((v) => typeof v === 'string' && v.trim());
    return {
        id: connectedAccountId,
        toolkit: isRecord(item.toolkit) && typeof item.toolkit.slug === 'string' ? item.toolkit.slug : null,
        status: mapStatus(item.status),
        label: typeof label === 'string' ? label.trim().slice(0, 120) : null,
        statusReason: typeof item.status_reason === 'string' ? item.status_reason.slice(0, 300) : null,
    };
}

/** Removes the connection from Composio (its tokens go with it). Already gone counts as done. */
export async function deleteConnectedAccount(connectedAccountId: string): Promise<void> {
    try {
        await composio('DELETE', `/connected_accounts/${encodeURIComponent(connectedAccountId)}`);
    } catch (error) {
        if (error instanceof ComposioError && error.status === 404) return;
        throw error;
    }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/** Runs one tool in a session as its pinned account; its `data` when Composio says `completed`. */
export async function executeSessionTool(sessionId: string, slug: string, args: Json): Promise<Json> {
    let body: Json;
    try {
        body = await composio('POST', `/tool_router/session/${encodeURIComponent(sessionId)}/execute`, {
            body: { tool_slug: slug, arguments: args },
        });
    } catch (error) {
        if (
            error instanceof ComposioError &&
            (error.status === 404 || error.status === 410) &&
            (await sessionGone(sessionId))
        ) {
            throw new ComposioSessionGone(error.message);
        }
        throw error;
    }
    // A failed run can come with an empty `error`: result_type is what says whether it ran.
    if (body.result_type === 'completed') return isRecord(body.data) ? body.data : { value: body.data };
    if (body.result_type === 'input_required') {
        throw new ComposioError(`${slug} asked for an approval first; this session runs without one`, 502);
    }
    const why = typeof body.error === 'string' && body.error ? body.error : `${slug} did not succeed`;
    throw new ComposioError(why, 502);
}

/** Runs one tool on a connection (server/voice-agent/calendar-connections.ts makes these). */
export type ComposioToolRunner = (slug: string, args?: Json) => Promise<Json>;

/** Every object inside a JSON value, depth first (Composio wraps provider answers differently per tool). */
function* objects(value: unknown): Generator<Json> {
    const stack: unknown[] = [value];
    while (stack.length) {
        const current = stack.pop();
        if (Array.isArray(current)) {
            for (let i = current.length - 1; i >= 0; i--) stack.push(current[i]);
        } else if (isRecord(current)) {
            yield current;
            const values = Object.values(current);
            for (let i = values.length - 1; i >= 0; i--) stack.push(values[i]);
        }
    }
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** A calendar (Google / Outlook) or event type (Cal.com / Calendly) bookings can go into. */
export type ProviderCalendar = { id: string; name: string; primary: boolean; detail: string | null };

/** What a connected account is, read with the tools its session already has. */
export type ProviderAccount = {
    /** Who it is signed in as: the email (Google, Outlook, Calendly; Cal.com when it says), else the username. */
    label: string | null;
    /** The calendars (or event types) the owner can book into, main one first. */
    calendars: ProviderCalendar[];
};

const email = (value: unknown): string | null => {
    const s = str(value);
    return s && /^[^\s@]+@[^\s@]+$/.test(s) ? s.slice(0, 120) : null;
};

/** Who a connected account is and what it can book into: one calendar list (Calendly: plus who is connected). */
export async function describeProviderAccount(
    provider: VoiceCalendarProvider,
    run: ComposioToolRunner,
): Promise<ProviderAccount> {
    const out = new Map<string, ProviderCalendar>();
    let label: string | null = null;
    switch (provider) {
        case VoiceCalendarProvider.GOOGLE_CALENDAR: {
            const data = await run('GOOGLECALENDAR_LIST_CALENDARS', { min_access_role: 'writer' });
            for (const item of objects(data)) {
                const id = str(item.id);
                if (!id || !('accessRole' in item || 'summary' in item)) continue;
                const primary = item.primary === true;
                // The main calendar's id is the account's email address.
                if (primary) label = email(id);
                out.set(primary ? 'primary' : id, {
                    id: primary ? 'primary' : id,
                    name: str(item.summaryOverride) ?? str(item.summary) ?? id,
                    primary,
                    detail: primary ? 'Main calendar' : null,
                });
            }
            break;
        }
        case VoiceCalendarProvider.OUTLOOK: {
            const data = await run('OUTLOOK_LIST_CALENDARS', { user_id: 'me' });
            for (const item of objects(data)) {
                const id = str(item.id);
                if (!id || !('name' in item)) continue;
                const primary = item.isDefaultCalendar === true;
                const owner = isRecord(item.owner) ? email(item.owner.address) : null;
                if (owner && (primary || !label)) label = owner;
                if (item.canEdit === false) continue;
                out.set(id, {
                    id: primary ? 'primary' : id,
                    name: str(item.name) ?? id,
                    primary,
                    detail: primary ? 'Main calendar' : null,
                });
            }
            break;
        }
        case VoiceCalendarProvider.CAL_COM: {
            const data = await run('CAL_LIST_EVENT_TYPES', {});
            let username: string | null = null;
            for (const item of objects(data)) {
                // Event types list their owner (`users` / `hosts`): an email when Cal.com gives one, else a username.
                label ??= email(item.email);
                username ??= str(item.username);
                const id = typeof item.id === 'number' ? String(item.id) : null;
                const length = item.lengthInMinutes ?? item.length;
                if (!id || typeof length !== 'number' || !(str(item.title) || str(item.slug))) continue;
                out.set(id, {
                    id,
                    name: str(item.title) ?? str(item.slug) ?? id,
                    primary: false,
                    detail: `${length} minutes`,
                });
            }
            label ??= username;
            break;
        }
        case VoiceCalendarProvider.CALENDLY: {
            const me = await run('CALENDLY_GET_USER', { uuid: 'me' });
            const user = [...objects(me)].find((o) => str(o.uri)?.includes('/users/'));
            const userUri = str(user?.uri);
            if (!userUri) throw new ComposioError('Calendly did not say who is connected', 502);
            label = email(user?.email) ?? str(user?.name);
            const data = await run('CALENDLY_LIST_EVENT_TYPES', { user: userUri, active: true, count: 100 });
            for (const item of objects(data)) {
                const uri = str(item.uri);
                if (!uri?.includes('/event_types/') || !str(item.name)) continue;
                const duration = typeof item.duration === 'number' ? `${item.duration} minutes` : null;
                out.set(uri, { id: uri, name: str(item.name) ?? uri, primary: false, detail: duration });
            }
            break;
        }
    }
    const calendars = [...out.values()].sort(
        (a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name),
    );
    return { label, calendars };
}

/** The calendars (or event types) the owner can book into on a connected account. */
export async function listProviderCalendars(
    provider: VoiceCalendarProvider,
    run: ComposioToolRunner,
): Promise<ProviderCalendar[]> {
    return (await describeProviderAccount(provider, run)).calendars;
}

/** Composio errors that mean the event is already gone, which is what cancelling wants. */
function alreadyGone(error: unknown): boolean {
    return error instanceof ComposioError && /\b(404|410)\b|not ?found|already (been )?cancel|deleted/i.test(error.message);
}

/** Cancels a mirrored booking in the owner's app (and notifies the attendee where the app does). */
export async function cancelExternalBooking(external: VoiceBookingExternal, run: ComposioToolRunner): Promise<void> {
    try {
        switch (external.provider) {
            case VoiceCalendarProvider.GOOGLE_CALENDAR:
                await run('GOOGLECALENDAR_DELETE_EVENT', {
                    event_id: external.eventId,
                    calendar_id: external.calendarId || 'primary',
                    send_updates: 'all',
                });
                return;
            case VoiceCalendarProvider.OUTLOOK:
                try {
                    await run('OUTLOOK_CANCEL_EVENT', {
                        user_id: 'me',
                        event_id: external.eventId,
                        Comment: 'Cancelled from Aixel Labs.',
                    });
                } catch (error) {
                    if (alreadyGone(error)) throw error;
                    // Graph cancels only meetings the owner organises; anything else is deleted.
                    await run('OUTLOOK_DELETE_CALENDAR_EVENT', { user_id: 'me', event_id: external.eventId });
                }
                return;
            case VoiceCalendarProvider.CAL_COM:
                await run('CAL_CANCEL_BOOKING_VIA_UID', {
                    bookingUid: external.eventId,
                    cancellationReason: 'Cancelled by the business.',
                });
                return;
            case VoiceCalendarProvider.CALENDLY:
                await run('CALENDLY_CANCEL_SCHEDULED_EVENT', {
                    event_uuid: external.eventId,
                    reason: 'Cancelled by the business.',
                });
                return;
        }
    } catch (error) {
        if (alreadyGone(error)) return;
        throw error;
    }
}
