'use server';

import { headers } from 'next/headers';
import {
    getCollection,
    MongoCollections,
    VOICE_AGENT_SUB_MODULES,
    VoiceCalendarConnectionStatus,
    VoiceCalendarProvider,
    MongoObjectId,
    type VoiceAgentDoc,
    type VoiceBookingDestination,
    type VoiceCalendarConnection,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { assertValidObjectId, runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import { defaultBookingTarget, voiceCalendarProviderLabel } from '@/helpers/voice-calendar-providers';
import { CONNECTED_APP_CALLBACK_URL } from '@/helpers/voice-routes';
import { findItem, listItems, pullItems, pushItem, updateItem } from '@/server/voice-agent/accounts';
import {
    assertUsableDestination,
    connectionToolRunner,
    mapCalendarConnectionDoc,
    type OwnedCalendarConnection,
} from '@/server/voice-agent/calendar-connections';
import {
    COMPOSIO_TOOLKITS,
    createCalendarSession,
    createConnectLink,
    deleteCalendarSession,
    deleteConnectedAccount,
    describeProviderAccount,
    ensureManagedAuthConfig,
    getOwnedConnectedAccount,
    isComposioConfigured,
    listProviderCalendars,
    type ProviderAccount,
    type ProviderCalendar,
} from '@/server/voice-agent/composio';
import { requireVoiceOwner } from '@/server/voice-agent/owner-scope';

/**
 * Connected apps: the owner's own Google Calendar / Outlook / Cal.com / Calendly, connected
 * with Composio's managed auth and shared by all their agents (design: server/voice-agent/composio.ts).
 */

const SUB_MODULE = VOICE_AGENT_SUB_MODULES.AGENTS;
/** How long the callback waits for Composio to finish activating the account. */
const CONFIRM_TRIES = 8;
const CONFIRM_WAIT_MS = 750;
const STALE_ATTEMPT_MS = 24 * 60 * 60 * 1000;
const PROVIDERS = Object.values(VoiceCalendarProvider);

export type VoiceConnectedApps = {
    /** False when the server has no COMPOSIO_API_KEY: the section explains instead of offering buttons. */
    configured: boolean;
    /** Active ones and ones that need connecting again, newest first (abandoned attempts are left out). */
    connections: VoiceCalendarConnection[];
};

/** Best effort: a session left behind costs nothing but clutter in Composio. */
async function dropSession(sessionId: string | null | undefined): Promise<void> {
    if (!sessionId) return;
    try {
        await deleteCalendarSession(sessionId);
    } catch (error) {
        console.warn(`voice connected apps: could not delete Composio session ${sessionId}`, error);
    }
}

function assertProvider(provider: string): asserts provider is VoiceCalendarProvider {
    if (!PROVIDERS.includes(provider as VoiceCalendarProvider)) throw new Error('Pick one of the listed apps');
}

/** Who the account is and what it can book into, read in its session; null when that fails now. */
async function describeConnection(doc: OwnedCalendarConnection): Promise<ProviderAccount | null> {
    try {
        return await describeProviderAccount(doc.provider, connectionToolRunner(doc));
    } catch (error) {
        console.warn(`voice connected apps: could not read ${doc.connectedAccountId} from Composio`, error);
        return null;
    }
}

/** Composio's own made-up account name ("googlecalendar_trench-flue"), which older connections were labelled with. */
function hasComposioWordId(doc: OwnedCalendarConnection): boolean {
    return new RegExp(`^${COMPOSIO_TOOLKITS[doc.provider]}_[a-z]+(-[a-z]+)*$`).test(doc.label ?? '');
}

/**
 * Active connections with no account label yet (made before labels were read, or the read failed
 * then) get it now. An account that names nobody is stored as '' so it is not asked again.
 */
async function backfillLabels(docs: OwnedCalendarConnection[]): Promise<OwnedCalendarConnection[]> {
    return Promise.all(
        docs.map(async (doc) => {
            const stale = doc.label == null || hasComposioWordId(doc);
            if (doc.status !== VoiceCalendarConnectionStatus.ACTIVE || !stale) return doc;
            const account = await describeConnection(doc);
            if (!account) return { ...doc, label: null };
            const label = account.label ?? '';
            await updateItem('calendars', { _id: doc._id }, { set: { label } });
            return { ...doc, label };
        }),
    );
}

/**
 * Points an agent of this owner at a new connection when it has booking settings and books into
 * the built-in calendar: the main calendar, or the only event type. Null when nothing changed.
 */
async function bookIntoConnection(
    ownerId: MongoObjectId,
    agentId: string,
    doc: OwnedCalendarConnection,
    calendars: ProviderCalendar[],
): Promise<VoiceBookingDestination | null> {
    const target = defaultBookingTarget(doc.provider, calendars);
    if (!target) return null;
    const destination: VoiceBookingDestination = {
        provider: doc.provider,
        connectedAccountId: doc.connectedAccountId,
        calendarId: target.id,
        calendarName: target.name,
    };
    const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
    const result = await agents.updateOne(
        {
            _id: toObjectId(agentId, 'Agent ID'),
            userId: ownerId,
            'tools.booking': { $type: 'object' },
            'tools.booking.destination': null,
        },
        { $set: { 'tools.booking.destination': destination, updatedAt: new Date() } },
    );
    return result.modifiedCount === 1 ? destination : null;
}

/** https://e2e.localhost:3103 etc., from the request (tenant subdomains differ per workspace). */
async function requestOrigin(): Promise<string> {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (!host) throw new Error('Could not work out this site’s address');
    const proto = h.get('x-forwarded-proto') ?? (/^(localhost|127\.|[^.]+\.localhost)/.test(host) ? 'http' : 'https');
    return `${proto.split(',')[0].trim()}://${host}`;
}

export const listVoiceConnectedApps = async (): Promise<ALApiResponse<VoiceConnectedApps>> =>
    runAuthenticatedAction(async function listVoiceConnectedApps(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const docs = (await listItems('calendars', owner.userId))
            .filter((doc) => doc.status !== VoiceCalendarConnectionStatus.PENDING)
            .slice(0, 50);
        const labelled = await backfillLabels(docs);
        return { configured: isComposioConfigured(), connections: labelled.map(mapCalendarConnectionDoc) };
    });

/**
 * Starts connecting an app: a Composio Connect Link the browser goes to next, made in a session
 * for this attempt (Composio-managed auth config, in-chat auth off). `agentId` is where the owner
 * is sent back to afterwards; `app` only lets the callback say what it is connecting.
 */
export const startVoiceAppConnection = async (
    provider: string,
    agentId?: string | null,
): Promise<ALApiResponse<{ redirectUrl: string }>> => {
    assertProvider(provider);
    if (agentId) assertValidObjectId(agentId, 'Agent ID');

    return runAuthenticatedAction(async function startVoiceAppConnection(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        if (!isComposioConfigured()) throw new Error('Connected apps are not set up on this server yet');
        const callback = new URL(CONNECTED_APP_CALLBACK_URL, await requestOrigin());
        if (agentId) callback.searchParams.set('agent', agentId);
        callback.searchParams.set('app', provider);
        const authConfigId = await ensureManagedAuthConfig(provider);
        const sessionId = await createCalendarSession({ userId: owner.userId.toString(), provider, authConfigId });
        let link;
        try {
            link = await createConnectLink({ sessionId, provider, callbackUrl: callback.toString() });
        } catch (error) {
            await dropSession(sessionId);
            throw error;
        }
        const now = new Date();
        // Attempts abandoned at Composio's page stay PENDING; a day on, nobody is coming back to them.
        await pullItems('calendars', owner.userId, {
            status: VoiceCalendarConnectionStatus.PENDING,
            createdAt: { $lt: new Date(now.getTime() - STALE_ATTEMPT_MS) },
        });
        await pushItem('calendars', owner, {
            _id: new MongoObjectId(),
            provider,
            connectedAccountId: link.connectedAccountId,
            authConfigId,
            composioSessionId: sessionId,
            status: VoiceCalendarConnectionStatus.PENDING,
            label: null,
            statusReason: null,
            createdAt: now,
            updatedAt: now,
        });
        return { redirectUrl: link.redirectUrl };
    });
};

export type VoiceAppConnectionResult = {
    connection: VoiceCalendarConnection;
    providerLabel: string;
    /** Where the agent it was connected from books now, when it booked into the built-in calendar before. */
    destination: VoiceBookingDestination | null;
};

/**
 * The callback: the connected account Composio named must be one this owner started, and
 * Composio must list it under them. Waits (briefly) for it to become ACTIVE, then gives the
 * connection its own session pinned to that account (the link's session is deleted; if it cannot
 * be made now, the first tool run makes it), reads who the account is (its label) and, when the
 * owner came from an agent that books into the built-in calendar, points that agent at it.
 */
export const confirmVoiceAppConnection = async (
    connectedAccountId: string,
    composioStatus?: string | null,
    agentId?: string | null,
): Promise<ALApiResponse<VoiceAppConnectionResult>> => {
    if (agentId) assertValidObjectId(agentId, 'Agent ID');

    return runAuthenticatedAction(async function confirmVoiceAppConnection(userId) {
        if (!/^[A-Za-z0-9_-]{3,100}$/.test(connectedAccountId ?? '')) throw new Error('That link is not a connection');
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const doc = await findItem('calendars', { connectedAccountId }, owner.userId);
        if (!doc) throw new Error('This connection was not started from your account. Try connecting again.');
        const providerLabel = voiceCalendarProviderLabel(doc.provider);
        if (doc.status === VoiceCalendarConnectionStatus.ACTIVE) {
            return { connection: mapCalendarConnectionDoc(doc), providerLabel, destination: null };
        }

        let state = await getOwnedConnectedAccount(owner.userId.toString(), connectedAccountId);
        for (
            let i = 1;
            i < CONFIRM_TRIES && state?.status === VoiceCalendarConnectionStatus.PENDING && composioStatus !== 'failed';
            i++
        ) {
            await new Promise((resolve) => setTimeout(resolve, CONFIRM_WAIT_MS));
            state = await getOwnedConnectedAccount(owner.userId.toString(), connectedAccountId);
        }
        const status = state?.status ?? VoiceCalendarConnectionStatus.FAILED;
        let composioSessionId = doc.composioSessionId ?? null;
        if (status !== VoiceCalendarConnectionStatus.PENDING) {
            let pinned: string | null = null;
            if (status === VoiceCalendarConnectionStatus.ACTIVE) {
                try {
                    pinned = await createCalendarSession({
                        userId: owner.userId.toString(),
                        provider: doc.provider,
                        authConfigId: doc.authConfigId,
                        connectedAccountId,
                    });
                } catch (error) {
                    console.warn(`voice connected apps: no Composio session for ${connectedAccountId} yet`, error);
                }
            }
            await dropSession(composioSessionId);
            composioSessionId = pinned;
        }
        await updateItem(
            'calendars',
            { _id: doc._id },
            {
                set: {
                    status,
                    composioSessionId,
                    label: state?.label ?? null,
                    statusReason: state ? state.statusReason : 'Composio does not list this connection under your account',
                },
            },
        );
        const updated = await findItem('calendars', { _id: doc._id }, owner.userId);
        if (!updated) throw new Error('Connection not found');
        if (status === VoiceCalendarConnectionStatus.PENDING) {
            throw new Error(`${providerLabel} has not finished connecting yet. Refresh this page in a moment.`);
        }
        if (status !== VoiceCalendarConnectionStatus.ACTIVE) {
            throw new Error(`${providerLabel} was not connected${state?.statusReason ? `: ${state.statusReason}` : '.'}`);
        }

        // Earlier attempts at this app that never connected are superseded by this one.
        await pullItems('calendars', owner.userId, { provider: doc.provider, status: VoiceCalendarConnectionStatus.FAILED });
        const account = await describeConnection(updated);
        if (!account) return { connection: mapCalendarConnectionDoc(updated), providerLabel, destination: null };
        const label = account.label ?? updated.label ?? '';
        await updateItem('calendars', { _id: doc._id }, { set: { label } });
        const destination = agentId ? await bookIntoConnection(owner.userId, agentId, updated, account.calendars) : null;
        return { connection: mapCalendarConnectionDoc({ ...updated, label }), providerLabel, destination };
    });
};

/** The calendars (Google, Outlook) or event types (Cal.com, Calendly) on one of the owner's connections. */
export const listVoiceAppCalendars = async (connectionId: string): Promise<ALApiResponse<ProviderCalendar[]>> => {
    assertValidObjectId(connectionId, 'Connection ID');

    return runAuthenticatedAction(async function listVoiceAppCalendars(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const doc = await findItem('calendars', { _id: toObjectId(connectionId, 'Connection ID') }, owner.userId);
        if (!doc) throw new Error('Connected app not found');
        await assertUsableDestination(owner.userId, {
            provider: doc.provider,
            connectedAccountId: doc.connectedAccountId,
            calendarId: '-',
            calendarName: '-',
        });
        try {
            return await listProviderCalendars(doc.provider, connectionToolRunner(doc));
        } catch (error) {
            const why = error instanceof Error ? error.message : 'unknown error';
            throw new Error(`Could not load your ${voiceCalendarProviderLabel(doc.provider)} calendars (${why})`);
        }
    });
};

/**
 * Disconnects an app: removed from Composio (and its tokens with it, and its session), and every
 * agent that booked into it goes back to the built-in calendar.
 */
export const disconnectVoiceApp = async (connectionId: string): Promise<ALApiResponse<{ agentsReset: number }>> => {
    assertValidObjectId(connectionId, 'Connection ID');

    return runAuthenticatedAction(async function disconnectVoiceApp(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const doc = await findItem('calendars', { _id: toObjectId(connectionId, 'Connection ID') }, owner.userId);
        if (!doc) throw new Error('Connected app not found');
        await deleteConnectedAccount(doc.connectedAccountId);
        await dropSession(doc.composioSessionId);
        await pullItems('calendars', owner.userId, { _id: doc._id });
        const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
        const reset = await agents.updateMany(
            { userId: owner.userId, 'tools.booking.destination.connectedAccountId': doc.connectedAccountId },
            { $set: { 'tools.booking.destination': null, updatedAt: new Date() } },
        );
        return { agentsReset: reset.modifiedCount };
    });
};
