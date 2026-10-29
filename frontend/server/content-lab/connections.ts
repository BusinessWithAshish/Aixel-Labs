import 'server-only';

import {
    ContentLabConnectionStatus,
    type ContentLabConnectedAccount,
    type ContentLabConnection,
    type ContentLabConnectionDoc,
    type ContentLabConnectPlatform,
    type MongoObjectId,
} from '@aixellabs/backend/db';
import { VoiceCalendarConnectionStatus } from '@aixellabs/backend/db/types';
import { contentLabProfilesCollection } from '@/server/content-lab/collections';
import {
    ComposioSessionGone,
    createToolkitSession,
    ensureToolkitAuthConfig,
    executeSessionTool,
    isRecord,
    toolkitSessionConfig,
    type Json,
} from '@/server/voice-agent/composio';

/**
 * The user's own YouTube / Instagram accounts, connected through Composio the same way voice agents
 * connect booking apps (design and env: server/voice-agent/composio.ts): Composio `user_id` = our user's
 * `_id`, Composio-managed auth, and every tool run in a direct-tools-preset session pinned to the account.
 * The connection lives on the Content Lab profile (`ContentLabProfileDoc.connections`).
 *
 * Read-only for now: a session allows only the tools below. Auto-posting will add its own tools (and a
 * new consent) and mark the connection's `access` with "publish".
 *
 * `COMPOSIO_AUTH_CONFIG_YOUTUBE` / `COMPOSIO_AUTH_CONFIG_INSTAGRAM` (optional) name an auth config made in
 * the Composio dashboard with Aixel Labs' own Google / Meta app; without them a Composio-managed one is
 * found or made through the API.
 */

type ToolkitSpec = { toolkit: string; label: string; tools: string[]; authConfigEnv: string };

export const CONTENT_LAB_TOOLKITS: Record<ContentLabConnectPlatform, ToolkitSpec> = {
    youtube: {
        toolkit: 'youtube',
        label: 'YouTube',
        tools: ['YOUTUBE_LIST_CHANNELS'],
        authConfigEnv: 'COMPOSIO_AUTH_CONFIG_YOUTUBE',
    },
    instagram: {
        toolkit: 'instagram',
        label: 'Instagram',
        tools: ['INSTAGRAM_GET_USER_INFO'],
        authConfigEnv: 'COMPOSIO_AUTH_CONFIG_INSTAGRAM',
    },
};

/** The auth config a platform connects with: the dashboard one from env, else Composio-managed. */
export async function contentLabAuthConfig(platform: ContentLabConnectPlatform): Promise<string> {
    const spec = CONTENT_LAB_TOOLKITS[platform];
    const fromEnv = process.env[spec.authConfigEnv]?.trim();
    if (fromEnv) return fromEnv;
    return ensureToolkitAuthConfig(spec.toolkit, `Aixel Content Lab: ${spec.label}`);
}

/** A session for one platform of `userId`, pinned to `connectedAccountId` when given (else only for a Connect Link). */
export function createContentLabSession(input: {
    userId: MongoObjectId;
    platform: ContentLabConnectPlatform;
    authConfigId: string;
    connectedAccountId?: string | null;
}): Promise<string> {
    const spec = CONTENT_LAB_TOOLKITS[input.platform];
    return createToolkitSession(
        toolkitSessionConfig({
            userId: input.userId.toString(),
            toolkit: spec.toolkit,
            tools: spec.tools,
            authConfigId: input.authConfigId,
            connectedAccountId: input.connectedAccountId,
        }),
    );
}

export function toContentLabConnectionStatus(status: VoiceCalendarConnectionStatus): ContentLabConnectionStatus {
    if (status === VoiceCalendarConnectionStatus.ACTIVE) return ContentLabConnectionStatus.ACTIVE;
    if (status === VoiceCalendarConnectionStatus.PENDING) return ContentLabConnectionStatus.PENDING;
    return ContentLabConnectionStatus.FAILED;
}

export function mapContentLabConnection(doc: ContentLabConnectionDoc): ContentLabConnection {
    return {
        _id: doc._id.toString(),
        platform: doc.platform,
        connectedAccountId: doc.connectedAccountId,
        status: doc.status,
        access: doc.access,
        account: doc.account,
        statusReason: doc.statusReason ?? null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
    };
}

/** The first object in a JSON value (depth first) that `match` accepts: Composio wraps provider answers differently per tool. */
function findObject(value: unknown, match: (item: Json) => boolean): Json | null {
    const stack: unknown[] = [value];
    while (stack.length) {
        const current = stack.shift();
        if (Array.isArray(current)) stack.push(...current);
        else if (isRecord(current)) {
            if (match(current)) return current;
            stack.push(...Object.values(current));
        }
    }
    return null;
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const num = (value: unknown): number | null => {
    const n = typeof value === 'string' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const bareHandle = (value: string | null) => (value ? value.replace(/^@+/, '').toLowerCase() : null);

/** Who the connected account is, read with its session's one read tool. */
export async function readConnectedAccount(
    platform: ContentLabConnectPlatform,
    sessionId: string,
): Promise<ContentLabConnectedAccount> {
    if (platform === 'youtube') {
        const data = await executeSessionTool(sessionId, 'YOUTUBE_LIST_CHANNELS', { mine: true, part: 'snippet,statistics' });
        const channel = findObject(data, (item) => typeof item.id === 'string' && isRecord(item.snippet));
        if (!channel) throw new Error('This Google account has no YouTube channel');
        const snippet = channel.snippet as Json;
        const thumbs = isRecord(snippet.thumbnails) ? snippet.thumbnails : {};
        const thumb = ['high', 'medium', 'default'].map((size) => thumbs[size]).find(isRecord);
        const handle = bareHandle(str(snippet.customUrl));
        const id = String(channel.id);
        return {
            id,
            handle,
            name: str(snippet.title),
            avatarUrl: str(thumb?.url),
            followers: isRecord(channel.statistics) ? num(channel.statistics.subscriberCount) : null,
            url: handle ? `https://www.youtube.com/@${handle}` : `https://www.youtube.com/channel/${id}`,
        };
    }
    const data = await executeSessionTool(sessionId, 'INSTAGRAM_GET_USER_INFO', {
        ig_user_id: 'me',
        fields: 'id,username,name,profile_picture_url,followers_count',
    });
    const user = findObject(data, (item) => typeof item.username === 'string');
    if (!user) throw new Error('Instagram did not say which account this is');
    const handle = bareHandle(str(user.username));
    return {
        id: str(user.id) ?? String(user.id ?? handle),
        handle,
        name: str(user.name),
        avatarUrl: str(user.profile_picture_url),
        followers: num(user.followers_count),
        url: handle ? `https://www.instagram.com/${handle}/` : null,
    };
}

/**
 * Reads the account in the connection's own session, making that session first when there is none
 * (or Composio lost it), and keeps the session id on the connection.
 */
export async function readConnectionAccount(userId: MongoObjectId, doc: ContentLabConnectionDoc): Promise<ContentLabConnectedAccount> {
    const pinned = () =>
        createContentLabSession({
            userId,
            platform: doc.platform,
            authConfigId: doc.authConfigId,
            connectedAccountId: doc.connectedAccountId,
        });
    let sessionId = doc.composioSessionId ?? (await pinned());
    try {
        return await readConnectedAccount(doc.platform, sessionId);
    } catch (error) {
        if (!(error instanceof ComposioSessionGone)) throw error;
        sessionId = await pinned();
        return await readConnectedAccount(doc.platform, sessionId);
    } finally {
        if (sessionId !== doc.composioSessionId) {
            const profiles = await contentLabProfilesCollection();
            await profiles.updateOne(
                { userId, 'connections._id': doc._id },
                { $set: { 'connections.$.composioSessionId': sessionId } },
            );
        }
    }
}
