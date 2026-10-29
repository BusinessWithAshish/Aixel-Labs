'use server';

import { ALApiResponse } from '@aixellabs/backend/api/types';
import {
    CONTENT_LAB_CONNECT_PLATFORMS,
    CONTENT_LAB_SUB_MODULES,
    ContentLabConnectionStatus,
    MongoObjectId,
    VoiceKeyStatus,
    type ContentLabAiKeyDoc,
    type ContentLabAiKeyView,
    type ContentLabConnection,
    type ContentLabConnectionDoc,
    type ContentLabConnectPlatform,
} from '@aixellabs/backend/db';
import { CONTENT_LAB_DEFAULT_COUNTRY } from '@aixellabs/backend/content-lab/constants';
import { SubModuleUrls } from '@/config/app-config';
import { assertValidObjectId, requireUserObjectId, runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import { assertRateLimit } from '@/server/rate-limit';
import { loadContentLabAiKeyView, toContentLabAiKeyView } from '@/server/content-lab/ai-key';
import { contentLabProfilesCollection } from '@/server/content-lab/collections';
import {
    CONTENT_LAB_TOOLKITS,
    contentLabAuthConfig,
    createContentLabSession,
    mapContentLabConnection,
    readConnectionAccount,
    toContentLabConnectionStatus,
} from '@/server/content-lab/connections';
import {
    createToolkitConnectLink,
    deleteCalendarSession,
    deleteConnectedAccount,
    getOwnedConnectedAccount,
    isComposioConfigured,
} from '@/server/voice-agent/composio';
import { openSecret, sealSecret } from '@/server/voice-agent/engine';
import { checkGeminiKey, VoiceKeyError } from '@/server/voice-agent/gemini-key';
import { requestOrigin } from '@/server/voice-agent/public-url';
import { CONTENT_LAB_DEFAULT_LANGUAGE } from '@/app/(protected)/content-lab/_constants';

/**
 * Content Lab settings beyond the profile form: its own AI key (separate from Voice agent's) and the
 * user's own YouTube / Instagram accounts connected through Composio (server/content-lab/connections.ts).
 */

const SETTINGS_URL = SubModuleUrls[CONTENT_LAB_SUB_MODULES.SETTINGS];
/** How long confirming waits for Composio to finish activating the account. */
const CONFIRM_TRIES = 8;
const CONFIRM_WAIT_MS = 750;
const STALE_ATTEMPT_MS = 24 * 60 * 60 * 1000;
const NOT_SET_UP = 'Connecting accounts is not set up on this server yet. Enter a public handle instead.';

/** Creates the user's profile with the defaults when they have none yet. */
async function ensureProfile(userId: MongoObjectId): Promise<void> {
    const profiles = await contentLabProfilesCollection();
    await profiles.updateOne(
        { userId },
        {
            $setOnInsert: {
                userId,
                handles: {},
                country: CONTENT_LAB_DEFAULT_COUNTRY,
                language: CONTENT_LAB_DEFAULT_LANGUAGE,
                updatedAt: new Date(),
            },
        },
        { upsert: true },
    );
}

/** Best effort: a session left behind costs nothing but clutter in Composio. */
async function dropSession(sessionId: string | null | undefined): Promise<void> {
    if (!sessionId) return;
    try {
        await deleteCalendarSession(sessionId);
    } catch (error) {
        console.warn(`content lab connections: could not delete Composio session ${sessionId}`, error);
    }
}

function assertPlatform(platform: string): asserts platform is ContentLabConnectPlatform {
    if (!CONTENT_LAB_CONNECT_PLATFORMS.includes(platform as ContentLabConnectPlatform)) {
        throw new Error('Pick YouTube or Instagram');
    }
}

async function listConnectionDocs(userId: MongoObjectId): Promise<ContentLabConnectionDoc[]> {
    const profiles = await contentLabProfilesCollection();
    const doc = await profiles.findOne({ userId }, { projection: { connections: 1 } });
    return doc?.connections ?? [];
}

async function setConnection(userId: MongoObjectId, id: MongoObjectId, set: Partial<ContentLabConnectionDoc>): Promise<void> {
    const profiles = await contentLabProfilesCollection();
    const now = new Date();
    const fields = Object.fromEntries(Object.entries({ ...set, updatedAt: now }).map(([key, value]) => [`connections.$.${key}`, value]));
    await profiles.updateOne({ userId, 'connections._id': id }, { $set: fields });
}

// ─── AI key ──────────────────────────────────────────────────────────────────

/** Content Lab's own Gemini key, as the settings page shows it (never the key). */
export const getContentLabAiKey = async (): Promise<ALApiResponse<ContentLabAiKeyView>> =>
    runAuthenticatedAction(async function getContentLabAiKey(userId) {
        return loadContentLabAiKeyView(requireUserObjectId(userId));
    });

/** Checks the key with Google (one free request, no tokens), then stores it sealed. A key Google refuses is not stored. */
export const saveContentLabAiKey = async (apiKey: string): Promise<ALApiResponse<ContentLabAiKeyView>> =>
    runAuthenticatedAction(async function saveContentLabAiKey(userId) {
        const uid = requireUserObjectId(userId);
        assertRateLimit(`content-lab-key:${uid}`, 30);
        const key = typeof apiKey === 'string' ? apiKey.trim() : '';
        if (key.length < 20 || key.length > 200 || /\s/.test(key)) throw new Error('Paste the whole API key from Google AI Studio');
        await checkGeminiKey(key);

        const now = new Date();
        const doc: ContentLabAiKeyDoc = {
            keySealed: sealSecret(key),
            last4: key.slice(-4),
            status: VoiceKeyStatus.OK,
            statusMessage: null,
            checkedAt: now,
            savedAt: now,
        };
        await ensureProfile(uid);
        const profiles = await contentLabProfilesCollection();
        await profiles.updateOne({ userId: uid }, { $set: { 'aiKeys.gemini': doc, updatedAt: now } });
        return toContentLabAiKeyView(doc);
    });

/** Asks Google about the saved key again (a free request), e.g. after turning the API on. Only a network failure is an error. */
export const recheckContentLabAiKey = async (): Promise<ALApiResponse<ContentLabAiKeyView>> =>
    runAuthenticatedAction(async function recheckContentLabAiKey(userId) {
        const uid = requireUserObjectId(userId);
        assertRateLimit(`content-lab-key:${uid}`, 30);
        const profiles = await contentLabProfilesCollection();
        const doc = await profiles.findOne({ userId: uid }, { projection: { 'aiKeys.gemini': 1 } });
        const saved = doc?.aiKeys?.gemini;
        if (!saved) throw new Error('No key is saved');

        let status = VoiceKeyStatus.OK;
        let statusMessage: string | null = null;
        try {
            await checkGeminiKey(openSecret(saved.keySealed));
        } catch (error) {
            if (!(error instanceof VoiceKeyError) || !error.status) throw error;
            status = error.status;
            statusMessage = error.message;
        }
        const checkedAt = new Date();
        await profiles.updateOne(
            { userId: uid, 'aiKeys.gemini': { $type: 'object' } },
            { $set: { 'aiKeys.gemini.status': status, 'aiKeys.gemini.statusMessage': statusMessage, 'aiKeys.gemini.checkedAt': checkedAt } },
        );
        return toContentLabAiKeyView({ ...saved, status, statusMessage, checkedAt });
    });

/** Forgets the key: writing stops until a key is added again. */
export const removeContentLabAiKey = async (): Promise<ALApiResponse<ContentLabAiKeyView>> =>
    runAuthenticatedAction(async function removeContentLabAiKey(userId) {
        const uid = requireUserObjectId(userId);
        const profiles = await contentLabProfilesCollection();
        await profiles.updateOne({ userId: uid }, { $unset: { 'aiKeys.gemini': '' }, $set: { updatedAt: new Date() } });
        return toContentLabAiKeyView(null);
    });

// ─── Connected accounts ──────────────────────────────────────────────────────

export type ContentLabConnections = {
    /** False when the server has no COMPOSIO_API_KEY: the page offers the public handle only. */
    configured: boolean;
    /** Active ones and ones that need connecting again (unfinished attempts are left out). */
    connections: ContentLabConnection[];
};

export const listContentLabConnections = async (): Promise<ALApiResponse<ContentLabConnections>> =>
    runAuthenticatedAction(async function listContentLabConnections(userId) {
        const docs = await listConnectionDocs(requireUserObjectId(userId));
        return {
            configured: isComposioConfigured(),
            connections: docs.filter((doc) => doc.status !== ContentLabConnectionStatus.PENDING).map(mapContentLabConnection),
        };
    });

/**
 * Starts connecting the user's own account: a Composio Connect Link the browser goes to next, made in a
 * session for this attempt. Composio sends the browser back to Settings with `connected_account_id`.
 */
export const startContentLabConnection = async (platform: string): Promise<ALApiResponse<{ redirectUrl: string }>> =>
    runAuthenticatedAction(async function startContentLabConnection(userId) {
        assertPlatform(platform);
        const uid = requireUserObjectId(userId);
        if (!isComposioConfigured()) throw new Error(NOT_SET_UP);
        assertRateLimit(`content-lab-connect:${uid}`, 20);
        const callback = new URL(SETTINGS_URL, await requestOrigin());
        callback.searchParams.set('connect', platform);
        const authConfigId = await contentLabAuthConfig(platform);
        const sessionId = await createContentLabSession({ userId: uid, platform, authConfigId });
        let link;
        try {
            link = await createToolkitConnectLink({
                sessionId,
                toolkit: CONTENT_LAB_TOOLKITS[platform].toolkit,
                callbackUrl: callback.toString(),
            });
        } catch (error) {
            await dropSession(sessionId);
            throw error;
        }
        const now = new Date();
        await ensureProfile(uid);
        const profiles = await contentLabProfilesCollection();
        // Attempts abandoned at Composio's page stay PENDING; a day on, nobody is coming back to them.
        await profiles.updateOne(
            { userId: uid },
            {
                $pull: {
                    connections: { status: ContentLabConnectionStatus.PENDING, createdAt: { $lt: new Date(now.getTime() - STALE_ATTEMPT_MS) } },
                },
            },
        );
        await profiles.updateOne(
            { userId: uid },
            {
                $push: {
                    connections: {
                        _id: new MongoObjectId(),
                        platform,
                        connectedAccountId: link.connectedAccountId,
                        authConfigId,
                        composioSessionId: sessionId,
                        status: ContentLabConnectionStatus.PENDING,
                        access: ['read'],
                        account: null,
                        statusReason: null,
                        createdAt: now,
                        updatedAt: now,
                    },
                },
            },
        );
        return { redirectUrl: link.redirectUrl };
    });

/**
 * Back from Composio: the account must be one this user started connecting and Composio must list it
 * under them. Waits (briefly) for it to become ACTIVE, gives it its own session pinned to the account,
 * reads who it is, fills the profile's handle for that platform from it, and retires the platform's
 * earlier connection (a reconnect replaces it).
 */
export const confirmContentLabConnection = async (
    connectedAccountId: string,
    composioStatus?: string | null,
): Promise<ALApiResponse<ContentLabConnection>> =>
    runAuthenticatedAction(async function confirmContentLabConnection(userId) {
        if (!/^[A-Za-z0-9_-]{3,100}$/.test(connectedAccountId ?? '')) throw new Error('That link is not a connection');
        const uid = requireUserObjectId(userId);
        const docs = await listConnectionDocs(uid);
        const doc = docs.find((item) => item.connectedAccountId === connectedAccountId);
        if (!doc) throw new Error('This connection was not started from your account. Try connecting again.');
        const label = CONTENT_LAB_TOOLKITS[doc.platform].label;
        if (doc.status === ContentLabConnectionStatus.ACTIVE) return mapContentLabConnection(doc);

        let state = await getOwnedConnectedAccount(uid.toString(), connectedAccountId);
        for (let i = 1; i < CONFIRM_TRIES && state && toContentLabConnectionStatus(state.status) === ContentLabConnectionStatus.PENDING && composioStatus !== 'failed'; i++) {
            await new Promise((resolve) => setTimeout(resolve, CONFIRM_WAIT_MS));
            state = await getOwnedConnectedAccount(uid.toString(), connectedAccountId);
        }
        const status = state ? toContentLabConnectionStatus(state.status) : ContentLabConnectionStatus.FAILED;
        if (status === ContentLabConnectionStatus.PENDING) {
            throw new Error(`${label} has not finished connecting yet. Refresh this page in a moment.`);
        }
        if (status !== ContentLabConnectionStatus.ACTIVE) {
            await setConnection(uid, doc._id, {
                status,
                statusReason: state?.statusReason ?? 'this sign-in is not listed under your account',
            });
            throw new Error(`${label} was not connected${state?.statusReason ? `: ${state.statusReason}` : '.'}`);
        }

        // The link's session cannot run tools for the account; the connection gets its own, pinned one.
        await dropSession(doc.composioSessionId);
        await setConnection(uid, doc._id, { status, statusReason: null, composioSessionId: null });
        let account;
        try {
            account = await readConnectionAccount(uid, { ...doc, composioSessionId: null });
        } catch (error) {
            const why = error instanceof Error ? error.message : 'unknown error';
            await setConnection(uid, doc._id, { status: ContentLabConnectionStatus.FAILED, statusReason: why });
            throw new Error(`${label} connected, but we could not read the account: ${why}`);
        }

        const profiles = await contentLabProfilesCollection();
        const now = new Date();
        await profiles.updateOne(
            { userId: uid, 'connections._id': doc._id },
            {
                $set: {
                    'connections.$.account': account,
                    'connections.$.updatedAt': now,
                    ...(account.handle ? { [`handles.${doc.platform}`]: account.handle } : {}),
                    updatedAt: now,
                },
            },
        );
        // A reconnect replaces the platform's earlier connections (their Composio accounts go too).
        const older = docs.filter((item) => item.platform === doc.platform && !item._id.equals(doc._id));
        for (const item of older) {
            await deleteConnectedAccount(item.connectedAccountId).catch((error: unknown) =>
                console.warn(`content lab connections: could not delete ${item.connectedAccountId}`, error),
            );
            await dropSession(item.composioSessionId);
        }
        if (older.length) {
            await profiles.updateOne({ userId: uid }, { $pull: { connections: { _id: { $in: older.map((item) => item._id) } } } });
        }
        return mapContentLabConnection({ ...doc, status, statusReason: null, account, updatedAt: now });
    });

/**
 * Disconnects an account: removed from Composio (its tokens go with it). The profile's handle for that
 * platform is cleared when it was the connected account's, so My voice stops reading it.
 */
export const disconnectContentLabConnection = async (connectionId: string): Promise<ALApiResponse<{ id: string }>> => {
    assertValidObjectId(connectionId, 'Connection ID');

    return runAuthenticatedAction(async function disconnectContentLabConnection(userId) {
        const uid = requireUserObjectId(userId);
        const id = toObjectId(connectionId, 'Connection ID');
        const profiles = await contentLabProfilesCollection();
        const profile = await profiles.findOne({ userId: uid }, { projection: { connections: 1, handles: 1 } });
        const doc = profile?.connections?.find((item) => item._id.equals(id));
        if (!doc) throw new Error('Connected account not found');
        await deleteConnectedAccount(doc.connectedAccountId);
        await dropSession(doc.composioSessionId);
        const sameHandle = !!doc.account?.handle && profile?.handles?.[doc.platform] === doc.account.handle;
        await profiles.updateOne(
            { userId: uid },
            {
                $pull: { connections: { _id: id } },
                $set: { updatedAt: new Date() },
                ...(sameHandle ? { $unset: { [`handles.${doc.platform}`]: '' } } : {}),
            },
        );
        return { id: connectionId };
    });
};
