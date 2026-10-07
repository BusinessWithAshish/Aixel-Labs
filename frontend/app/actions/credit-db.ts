import 'server-only';

import { getCollection, MongoCollections, MongoObjectId, type TenantDoc, type UserDoc } from '@aixellabs/backend/db';
import { isCreditsRefillDue, normalizeCredits, type UserCreditsState } from '@/helpers/credits';

type RefillFields = Pick<UserDoc, '_id' | 'credits' | 'isAdmin' | 'tenantId' | 'creditsRefilledAt'>;

/**
 * Tops a member's balance back up to their tenant's `defaultCredits` once per
 * refill period, lazily — on the first balance read after it falls due, so no
 * scheduler is involved. Returns the balance after any refill.
 *
 * The update is conditional on `creditsRefilledAt` being what was just read,
 * so two requests arriving together refill once.
 */
async function refillCreditsIfDue(user: RefillFields): Promise<number> {
    const balance = normalizeCredits(user.credits);
    if (user.isAdmin === true || !isCreditsRefillDue(user.creditsRefilledAt)) return balance;

    const tenants = await getCollection<TenantDoc>(MongoCollections.TENANTS);
    const tenant = await tenants.findOne({ _id: user.tenantId }, { projection: { defaultCredits: 1 } });
    const allowance = normalizeCredits(tenant?.defaultCredits);
    if (allowance <= 0) return balance;

    const users = await getCollection<UserDoc>(MongoCollections.USERS);
    const updated = await users.findOneAndUpdate(
        {
            _id: user._id,
            creditsRefilledAt: user.creditsRefilledAt ?? { $exists: false },
        },
        { $set: { credits: Math.max(balance, allowance), creditsRefilledAt: new Date() } },
        { returnDocument: 'after', projection: { credits: 1 } },
    );
    if (updated) return normalizeCredits(updated.credits);

    // Another request refilled first — read what it left.
    const current = await users.findOne({ _id: user._id }, { projection: { credits: 1 } });
    return normalizeCredits(current?.credits);
}

export async function getUserCreditsState(userId: string | MongoObjectId): Promise<UserCreditsState> {
    const oid = typeof userId === 'string' ? new MongoObjectId(userId) : userId;
    const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
    const user = await usersCollection.findOne(
        { _id: oid },
        { projection: { credits: 1, isAdmin: 1, tenantId: 1, creditsRefilledAt: 1 } },
    );
    if (!user) {
        throw new Error('User not found');
    }
    return {
        credits: await refillCreditsIfDue(user),
        exempt: user.isAdmin === true,
    };
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
