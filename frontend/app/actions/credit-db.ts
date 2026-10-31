import 'server-only';

import { getCollection, MongoCollections, MongoObjectId, type UserDoc } from '@aixellabs/backend/db';
import {
    creditsDayKey,
    DAILY_LEAD_CAP,
    DAILY_LIMIT_MESSAGE,
    MONTHLY_FREE_CREDITS,
    getNextCreditsRefillAt,
    isCreditsRefillDue,
    normalizeCredits,
    type UserCreditsState,
} from '@/helpers/credits';

type RefillFields = Pick<UserDoc, '_id' | 'credits' | 'creditsRefilledAt'>;
type RefilledBalance = { credits: number; refilledAt: Date };

/**
 * Tops a member's balance back up to `MONTHLY_FREE_CREDITS` once per refill
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
        { $set: { credits: Math.max(balance, MONTHLY_FREE_CREDITS), creditsRefilledAt: refilledAt } },
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
        { projection: { credits: 1, isAdmin: 1, creditsRefilledAt: 1, dailyCreditsUsed: 1, dailyCreditsDay: 1 } },
    );
    if (!user) {
        throw new Error('User not found');
    }
    if (user.isAdmin === true) {
        const credits = normalizeCredits(user.credits);
        return { credits, spendable: credits, exempt: true };
    }

    const { credits, refilledAt } = await refillCreditsIfDue(user);
    const usedToday = user.dailyCreditsDay === creditsDayKey() ? normalizeCredits(user.dailyCreditsUsed) : 0;
    const dailyRemaining = Math.max(0, DAILY_LEAD_CAP - usedToday);
    return {
        credits,
        spendable: Math.min(credits, dailyRemaining),
        dailyRemaining,
        exempt: false,
        refillsAt: getNextCreditsRefillAt(refilledAt),
    };
}

/**
 * Atomically deducts `cost` credits when the user has enough balance and today's cap allows it.
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
    const today = creditsDayKey();
    const isToday = { $eq: ['$dailyCreditsDay', today] };
    const updated = await usersCollection.findOneAndUpdate(
        {
            _id: oid,
            credits: { $gte: cost },
            isAdmin: { $ne: true },
            $or: [{ dailyCreditsDay: { $ne: today } }, { dailyCreditsUsed: { $lte: DAILY_LEAD_CAP - cost } }],
        },
        [
            {
                $set: {
                    credits: { $subtract: ['$credits', cost] },
                    dailyCreditsUsed: { $cond: [isToday, { $add: [{ $ifNull: ['$dailyCreditsUsed', 0] }, cost] }, cost] },
                    dailyCreditsDay: today,
                },
            },
        ],
        { returnDocument: 'after', projection: { credits: 1 } },
    );

    if (!updated) {
        const current = await getUserCreditsState(oid);
        if (current.credits < cost) throw new Error(`Insufficient credits: need ${cost}, have ${current.credits}`);
        throw new Error(DAILY_LIMIT_MESSAGE);
    }

    return normalizeCredits(updated.credits);
}
