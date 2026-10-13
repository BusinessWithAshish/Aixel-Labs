import 'server-only';

import { getCollection, MongoCollections, MongoObjectId, type UserDoc } from '@aixellabs/backend/db';
import {
    DAILY_FREE_CREDITS,
    getNextCreditsRefillAt,
    isCreditsRefillDue,
    normalizeCredits,
    type UserCreditsState,
} from '@/helpers/credits';

type RefillFields = Pick<UserDoc, '_id' | 'credits' | 'creditsRefilledAt'>;
type RefilledBalance = { credits: number; refilledAt: Date };

/**
 * Tops a member's balance back up to `DAILY_FREE_CREDITS` once per refill
 * period, lazily — on the first balance read after it falls due, so no
 * scheduler is involved. Returns the balance after any refill and when that
 * refill happened.
 *
 * The update is conditional on `creditsRefilledAt` being what was just read,
 * so two requests arriving together refill once.
 */
async function refillCreditsIfDue(user: RefillFields): Promise<RefilledBalance> {
    const balance = normalizeCredits(user.credits);
    if (user.creditsRefilledAt && !isCreditsRefillDue(user.creditsRefilledAt)) {
        return { credits: balance, refilledAt: user.creditsRefilledAt };
    }

    const refilledAt = new Date();
    const users = await getCollection<UserDoc>(MongoCollections.USERS);
    const updated = await users.findOneAndUpdate(
        {
            _id: user._id,
            creditsRefilledAt: user.creditsRefilledAt ?? { $exists: false },
        },
        { $set: { credits: Math.max(balance, DAILY_FREE_CREDITS), creditsRefilledAt: refilledAt } },
        { returnDocument: 'after', projection: { credits: 1 } },
    );
    if (updated) return { credits: normalizeCredits(updated.credits), refilledAt };

    // Another request refilled first — read what it left.
    const current = await users.findOne({ _id: user._id }, { projection: { credits: 1, creditsRefilledAt: 1 } });
    return { credits: normalizeCredits(current?.credits), refilledAt: current?.creditsRefilledAt ?? refilledAt };
}

export async function getUserCreditsState(userId: string | MongoObjectId): Promise<UserCreditsState> {
    const oid = typeof userId === 'string' ? new MongoObjectId(userId) : userId;
    const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
    const user = await usersCollection.findOne(
        { _id: oid },
        { projection: { credits: 1, isAdmin: 1, creditsRefilledAt: 1 } },
    );
    if (!user) {
        throw new Error('User not found');
    }
    if (user.isAdmin === true) {
        return { credits: normalizeCredits(user.credits), exempt: true };
    }

    const { credits, refilledAt } = await refillCreditsIfDue(user);
    return { credits, exempt: false, refillsAt: getNextCreditsRefillAt(refilledAt) };
}

export async function getUserCredits(userId: string | MongoObjectId): Promise<number> {
    return (await getUserCreditsState(userId)).credits;
}

/**
 * Atomically deducts `cost` credits when the user has enough balance.
 * Admins are never charged. Missing `credits` is treated as 0.
 */
export async function assertAndDebitCredits(userId: string | MongoObjectId, cost: number): Promise<number> {
    if (!Number.isInteger(cost) || cost < 0) {
        throw new Error('Credit cost must be a non-negative integer');
    }

    const oid = typeof userId === 'string' ? new MongoObjectId(userId) : userId;
    const state = await getUserCreditsState(oid);
    if (state.exempt || cost === 0) {
        return state.credits;
    }

    const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
    const updated = await usersCollection.findOneAndUpdate(
        { _id: oid, credits: { $gte: cost }, isAdmin: { $ne: true } },
        { $inc: { credits: -cost } },
        { returnDocument: 'after', projection: { credits: 1 } },
    );

    if (!updated) {
        const current = await getUserCredits(oid);
        throw new Error(current < cost ? `Insufficient credits: need ${cost}, have ${current}` : 'Insufficient credits');
    }

    return normalizeCredits(updated.credits);
}
