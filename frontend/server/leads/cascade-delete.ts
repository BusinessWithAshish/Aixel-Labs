import 'server-only';

import {
    getCollection,
    MongoCollections,
    type UserLeadDoc,
    type UserLeadListDoc,
} from '@aixellabs/backend/db';
import type { ObjectId } from 'mongodb';

type DeleteResult = { deletedUserLeads: number; deletedLeadLists: number };

/**
 * Cascade-deletes all `user_leads` and `lead_lists` owned by the given user IDs.
 * The two `deleteMany` calls run in parallel — they touch disjoint collections.
 * Shared `leads` documents are intentionally preserved (multi-tenant dedup).
 *
 * Returns per-collection deleted counts so callers can surface them in API
 * responses (e.g. `DeleteTenantResult`).
 */
export async function deleteUserOwnedLeadData(userIds: ObjectId[]): Promise<DeleteResult> {
    if (userIds.length === 0) {
        return { deletedUserLeads: 0, deletedLeadLists: 0 };
    }

    const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);
    const leadListsCollection = await getCollection<UserLeadListDoc>(MongoCollections.LEAD_LISTS);

    const filter = { userId: { $in: userIds } };
    const [userLeadsResult, leadListsResult] = await Promise.all([
        userLeadsCollection.deleteMany(filter),
        leadListsCollection.deleteMany(filter),
    ]);

    return {
        deletedUserLeads: userLeadsResult.deletedCount,
        deletedLeadLists: leadListsResult.deletedCount,
    };
}
