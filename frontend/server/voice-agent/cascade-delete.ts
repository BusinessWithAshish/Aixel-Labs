import 'server-only';

import { getCollection, MongoCollections, type MongoObjectId, type VoiceAccountDoc } from '@aixellabs/backend/db';
import { deleteCalendarSession, deleteConnectedAccount } from '@/server/voice-agent/composio';
import { providerOf } from '@/server/voice-agent/number-provider';

const OWNED_VOICE_COLLECTIONS = [
    MongoCollections.VOICE_ACCOUNTS,
    MongoCollections.VOICE_AGENTS,
    MongoCollections.VOICE_CALLS,
    MongoCollections.VOICE_BOOKINGS,
    MongoCollections.VOICE_CAMPAIGNS,
    MongoCollections.VOICE_CAMPAIGN_CONTACTS,
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

    const accounts = await getCollection<VoiceAccountDoc>(MongoCollections.VOICE_ACCOUNTS);
    for (const account of await accounts.find(filter).toArray()) {
        const owner = { tenantId: account.tenantId, userId: account.userId };
        for (const number of account.numbers ?? []) {
            try {
                await providerOf(number).release({ ...number, ...owner });
            } catch (error) {
                console.warn(`voice cascade: could not release number ${number.phoneNumber}`, error);
            }
        }
        for (const app of account.calendars ?? []) {
            try {
                await deleteConnectedAccount(app.connectedAccountId);
                if (app.composioSessionId) await deleteCalendarSession(app.composioSessionId);
            } catch (error) {
                console.warn(`voice cascade: could not remove connected app ${app.connectedAccountId}`, error);
            }
        }
    }

    await Promise.all(OWNED_VOICE_COLLECTIONS.map(async (name) => (await getCollection(name)).deleteMany(filter)));
}
