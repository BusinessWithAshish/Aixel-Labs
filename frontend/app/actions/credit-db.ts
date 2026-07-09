import 'server-only';

import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    type UserDoc,
} from '@aixellabs/backend/db';
import { normalizeCredits } from '@/helpers/credits';

export async function getUserCredits(userId: string | MongoObjectId): Promise<number> {
    const oid = typeof userId === 'string' ? new MongoObjectId(userId) : userId;
    const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
    const user = await usersCollection.findOne({ _id: oid }, { projection: { credits: 1 } });
    if (!user) {
        throw new Error('User not found');
    }
    return normalizeCredits(user.credits);
}

/**
 * Atomically deducts `cost` credits when the user has enough balance.
 * Missing `credits` is treated as 0 (debit fails unless cost is 0).
 */
export async function assertAndDebitCredits(
    userId: string | MongoObjectId,
    cost: number,
): Promise<number> {
    if (!Number.isInteger(cost) || cost < 0) {
        throw new Error('Credit cost must be a non-negative integer');
    }
    if (cost === 0) {
        return getUserCredits(userId);
    }

    const oid = typeof userId === 'string' ? new MongoObjectId(userId) : userId;
    const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);

    const updated = await usersCollection.findOneAndUpdate(
        { _id: oid, credits: { $gte: cost } },
        { $inc: { credits: -cost } },
        { returnDocument: 'after', projection: { credits: 1 } },
    );

    if (!updated) {
        const current = await getUserCredits(oid);
        throw new Error(
            current < cost
                ? `Insufficient credits: need ${cost}, have ${current}`
                : 'Insufficient credits',
        );
    }

    return normalizeCredits(updated.credits);
}
