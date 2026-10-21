import 'server-only';

import {
    MongoObjectId,
    VoiceCalendarConnectionStatus,
    type VoiceBookingDestination,
    type VoiceCalendarConnection,
    type VoiceCalendarConnectionDoc,
} from '@aixellabs/backend/db';
import {
    ComposioSessionGone,
    createCalendarSession,
    deleteCalendarSession,
    executeSessionTool,
    type ComposioToolRunner,
} from '@/server/voice-agent/composio';
import { findItem, updateItem, type Owned } from '@/server/voice-agent/accounts';

/** One of the owner's connected booking apps (`voice_accounts.calendars`, see `server/voice-agent/composio.ts`). */
export type OwnedCalendarConnection = Owned<VoiceCalendarConnectionDoc>;

export function mapCalendarConnectionDoc(doc: OwnedCalendarConnection): VoiceCalendarConnection {
    return {
        _id: doc._id.toString(),
        tenantId: doc.tenantId.toString(),
        userId: doc.userId.toString(),
        provider: doc.provider,
        connectedAccountId: doc.connectedAccountId,
        authConfigId: doc.authConfigId,
        status: doc.status,
        label: doc.label ?? null,
        statusReason: doc.statusReason ?? null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
    };
}

/** An ACTIVE connection of this owner for the destination's provider, else a user-facing error. */
export async function assertUsableDestination(
    userId: MongoObjectId,
    destination: VoiceBookingDestination,
): Promise<OwnedCalendarConnection> {
    const doc = await findItem('calendars', { connectedAccountId: destination.connectedAccountId }, userId);
    if (!doc) throw new Error('That connected app was not found. Connect it again.');
    if (doc.provider !== destination.provider) throw new Error('That calendar belongs to a different app');
    if (doc.status !== VoiceCalendarConnectionStatus.ACTIVE) {
        throw new Error('That connected app needs to be connected again before bookings can go there');
    }
    return doc;
}

/**
 * Stores the connection's session id, only over the one it was read with (the engine writes it
 * too); false when someone else stored one first.
 */
async function storeSessionId(doc: OwnedCalendarConnection, sessionId: string): Promise<boolean> {
    return updateItem(
        'calendars',
        { _id: doc._id, composioSessionId: doc.composioSessionId ?? null },
        { set: { composioSessionId: sessionId } },
    );
}

/**
 * Runs Composio tools on one of the owner's connections, in its session: the stored one, else a
 * new one pinned to the account (stored on the doc). When Composio says that session is gone,
 * one made since by the engine is used if there is one, else a new one, and the tool is run once
 * more (nothing ran the first time).
 */
export function connectionToolRunner(doc: OwnedCalendarConnection): ComposioToolRunner {
    let current = doc;
    let sessionId: string | null = doc.composioSessionId ?? null;

    const renew = async (dead: string | null): Promise<string> => {
        const fresh = await findItem('calendars', { _id: doc._id });
        if (fresh) current = fresh;
        if (fresh?.composioSessionId && fresh.composioSessionId !== dead) return fresh.composioSessionId;
        const created = await createCalendarSession({
            userId: doc.userId.toString(),
            provider: doc.provider,
            authConfigId: doc.authConfigId,
            connectedAccountId: doc.connectedAccountId,
        });
        if (!(await storeSessionId(current, created))) {
            // Another request made one meanwhile: use that, and leave no second session behind.
            const winner = (await findItem('calendars', { _id: doc._id }))?.composioSessionId;
            if (winner && winner !== dead) {
                await deleteCalendarSession(created).catch(() => undefined);
                return winner;
            }
        }
        current = { ...current, composioSessionId: created };
        return created;
    };

    return async (slug, args = {}) => {
        sessionId ??= await renew(null);
        try {
            return await executeSessionTool(sessionId, slug, args);
        } catch (error) {
            if (!(error instanceof ComposioSessionGone)) throw error;
            sessionId = await renew(sessionId);
            return executeSessionTool(sessionId, slug, args);
        }
    };
}
