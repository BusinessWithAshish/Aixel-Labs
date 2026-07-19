import 'server-only';

import { getCollection, MongoCollections, type UserLeadDoc } from '@aixellabs/backend/db';

let indexesEnsured = false;

/**
 * `user_leads` membership is per list: unique on `(userId, leadId, listId)`.
 * Drops the legacy unique `(userId, leadId)` index that blocked the same lead
 * from appearing on multiple lists (E11000 on re-scrape / similar searches).
 */
export async function ensureUserLeadIndexes(): Promise<void> {
    if (indexesEnsured) return;

    const userLeads = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);

    try {
        await userLeads.dropIndex('userId_1_leadId_1');
    } catch (error) {
        // IndexNotFound (27) — already migrated or never existed.
        const code = (error as { code?: number }).code;
        if (code !== 27) throw error;
    }

    await userLeads.createIndex({ userId: 1, leadId: 1, listId: 1 }, { unique: true });
    // List-scoped reads (e.g. getUserLeadsForList, countDocuments) and the
    // getUserLeadLists aggregation group by (userId, listId); a dedicated
    // non-unique compound index serves those without forcing a collection scan.
    await userLeads.createIndex({ userId: 1, listId: 1 });

    indexesEnsured = true;
}
