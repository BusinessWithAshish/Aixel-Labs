import 'server-only';

import {
    getCollection,
    MongoCollections,
    type MongoObjectId,
    type VoiceCalendarConnectionDoc,
    type VoiceNumberDoc,
} from '@aixellabs/backend/db';
import { deleteCalendarSession, deleteConnectedAccount } from '@/server/voice-agent/composio';
import { providerOf, type OwnedNumberDoc } from '@/server/voice-agent/number-provider';

const OWNED_VOICE_COLLECTIONS = [
    MongoCollections.VOICE_AGENTS,
    MongoCollections.VOICE_NUMBERS,
    MongoCollections.VOICE_CALLS,
    MongoCollections.VOICE_BOOKINGS,
    MongoCollections.VOICE_CALENDAR_CONNECTIONS,
    MongoCollections.VOICE_SETTINGS,
    MongoCollections.VOICE_CAMPAIGNS,
    MongoCollections.VOICE_CAMPAIGN_CONTACTS,
    MongoCollections.VOICE_CALLER_MEMORIES,
] as const;

/**
 * Deletes everything voice the given users own, like `deleteUserOwnedLeadData` does for leads.
 * First, best effort, it undoes what we set up outside our database: each number's routing in the
 * customer's provider account goes back to how it was, and each connected booking app is removed
 * from Composio. A provider or Composio that refuses is logged and does not stop the delete.
 */
export async function deleteUserOwnedVoiceData(userIds: MongoObjectId[]): Promise<void> {
    if (userIds.length === 0) return;
    const filter = { userId: { $in: userIds } };

    const numbers = await getCollection<VoiceNumberDoc>(MongoCollections.VOICE_NUMBERS);
    for (const doc of await numbers.find(filter).toArray()) {
        try {
            await providerOf(doc).release(doc as OwnedNumberDoc);
        } catch (error) {
            console.warn(`voice cascade: could not release number ${doc.phoneNumber}`, error);
        }
    }

    const connections = await getCollection<VoiceCalendarConnectionDoc>(MongoCollections.VOICE_CALENDAR_CONNECTIONS);
    for (const doc of await connections.find(filter).toArray()) {
        try {
            await deleteConnectedAccount(doc.connectedAccountId);
            if (doc.composioSessionId) await deleteCalendarSession(doc.composioSessionId);
        } catch (error) {
            console.warn(`voice cascade: could not remove connected app ${doc.connectedAccountId}`, error);
        }
    }

    await Promise.all(
        OWNED_VOICE_COLLECTIONS.map(async (name) => (await getCollection(name)).deleteMany(filter)),
    );
}
