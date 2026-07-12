import 'server-only';

import { getCollection, MongoCollections, type UserDoc } from '@aixellabs/backend/db';

let indexesEnsured = false;

/** Idempotent unique indexes for Firebase-linked users. */
export async function ensureUserAuthIndexes(): Promise<void> {
    if (indexesEnsured) return;

    const users = await getCollection<UserDoc>(MongoCollections.USERS);
    await Promise.all([
        users.createIndex(
            { firebaseUid: 1 },
            {
                unique: true,
                partialFilterExpression: { firebaseUid: { $type: 'string' } },
            },
        ),
        users.createIndex(
            { phoneNumber: 1 },
            {
                unique: true,
                partialFilterExpression: { phoneNumber: { $type: 'string' } },
            },
        ),
        users.createIndex({ email: 1, tenantId: 1 }, { unique: true }),
    ]);
    indexesEnsured = true;
}
