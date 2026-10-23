import 'server-only';

import type { Filter, UpdateFilter } from 'mongodb';
import {
    getCollection,
    MongoCollections,
    type MongoObjectId,
    type VoiceAccountDoc,
    type VoiceCalendarConnectionDoc,
    type VoiceNumberDoc,
} from '@aixellabs/backend/db';
import { ensureVoiceAgentIndexes } from '@/server/voice-agent/indexes';

/**
 * One `voice_accounts` doc per owner holds their Gemini key and two lists: `numbers` and
 * `calendars` (connected booking apps). Each list item keeps its own `_id`, which calls,
 * campaigns and the UI use, and is read and written here, positionally, never as a whole list.
 */
type Lists = { numbers: VoiceNumberDoc; calendars: VoiceCalendarConnectionDoc };
type ListKey = keyof Lists;

/** A list item with its owner's ids, as the code that used one doc per item expects. */
export type Owned<T> = T & { tenantId: MongoObjectId; userId: MongoObjectId };

export type VoiceAccountOwner = { tenantId: MongoObjectId; userId: MongoObjectId };

/** Keys without the sealed keys (the other lists are not needed). */
export const NO_SEALED = { 'keys.keySealed': 0, numbers: 0, calendars: 0 } as const;

export async function voiceAccountsCollection() {
    await ensureVoiceAgentIndexes();
    return getCollection<VoiceAccountDoc>(MongoCollections.VOICE_ACCOUNTS);
}

/** Creates the owner's account doc when it does not exist yet. */
export async function ensureVoiceAccount(owner: VoiceAccountOwner): Promise<void> {
    const accounts = await voiceAccountsCollection();
    const now = new Date();
    await accounts.updateOne(
        { userId: owner.userId },
        { $setOnInsert: { tenantId: owner.tenantId, userId: owner.userId, createdAt: now, updatedAt: now } },
        { upsert: true },
    );
}

function prefixed(key: ListKey, fields: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(fields).map(([field, value]) => [`${key}.$.${field}`, value]));
}

/** `{ [key]: { $elemMatch: match } }`, and the owner when given. */
function itemFilter(key: ListKey, match: Record<string, unknown>, userId?: MongoObjectId): Filter<VoiceAccountDoc> {
    return { ...(userId ? { userId } : {}), [key]: { $elemMatch: match } } as Filter<VoiceAccountDoc>;
}

/** The first item matching `match` (fields of the item), in the owner's account when `userId` is given. */
export async function findItem<K extends ListKey>(
    key: K,
    match: Record<string, unknown>,
    userId?: MongoObjectId,
): Promise<Owned<Lists[K]> | null> {
    const accounts = await voiceAccountsCollection();
    const doc = await accounts.findOne(itemFilter(key, match, userId), {
        projection: { tenantId: 1, userId: 1, [`${key}.$`]: 1 },
    });
    const item = (doc?.[key] as Lists[K][] | undefined)?.[0];
    return doc && item ? { ...item, tenantId: doc.tenantId, userId: doc.userId } : null;
}

/** All of the owner's items, newest first. */
export async function listItems<K extends ListKey>(key: K, userId: MongoObjectId): Promise<Owned<Lists[K]>[]> {
    const accounts = await voiceAccountsCollection();
    const doc = await accounts.findOne({ userId }, { projection: { tenantId: 1, userId: 1, [key]: 1 } });
    const items = (doc?.[key] as Lists[K][] | undefined) ?? [];
    return items
        .map((item) => ({ ...item, tenantId: doc!.tenantId, userId: doc!.userId }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Items matching `match` in any account (owner ids left off), e.g. which owner has a phone number. */
export async function findItemsAnywhere<K extends ListKey>(
    key: K,
    match: Record<string, unknown>,
): Promise<Owned<Lists[K]>[]> {
    const accounts = await voiceAccountsCollection();
    const docs = await accounts.find(itemFilter(key, match), { projection: { tenantId: 1, userId: 1, [key]: 1 } }).toArray();
    return docs.flatMap((doc) =>
        ((doc[key] as Lists[K][] | undefined) ?? []).map((item) => ({ ...item, tenantId: doc.tenantId, userId: doc.userId })),
    );
}

/**
 * Updates the item matching `match` (its `_id`, plus any field it must still have, which makes
 * the update a compare-and-set). Bumps the item's `updatedAt`. Returns whether one matched.
 */
export async function updateItem(
    key: ListKey,
    match: Record<string, unknown>,
    update: { set?: Record<string, unknown>; unset?: string[] },
): Promise<boolean> {
    const accounts = await voiceAccountsCollection();
    const now = new Date();
    const $update: UpdateFilter<VoiceAccountDoc> = {
        $set: { ...prefixed(key, { ...update.set, updatedAt: now }), updatedAt: now },
    };
    if (update.unset?.length) $update.$unset = prefixed(key, Object.fromEntries(update.unset.map((f) => [f, ""]))) as never;
    const result = await accounts.updateOne(itemFilter(key, match), $update);
    return result.matchedCount === 1;
}

/**
 * Adds an item to the owner's list, creating the account if needed. `unlessMatch` (fields of an
 * item) keeps the list free of a duplicate: when an item matches it, nothing is added and false is
 * returned. A duplicate in another owner's list throws MongoDB's duplicate key error (unique index).
 */
export async function pushItem<K extends ListKey>(
    key: K,
    owner: VoiceAccountOwner,
    item: Lists[K],
    unlessMatch?: Record<string, unknown>,
): Promise<boolean> {
    await ensureVoiceAccount(owner);
    const accounts = await voiceAccountsCollection();
    const filter = {
        userId: owner.userId,
        ...(unlessMatch ? { [key]: { $not: { $elemMatch: unlessMatch } } } : {}),
    } as Filter<VoiceAccountDoc>;
    const result = await accounts.updateOne(filter, {
        $push: { [key]: item } as never,
        $set: { updatedAt: new Date() },
    });
    return result.modifiedCount === 1;
}

/** Removes the owner's items matching `match` (fields of an item). */
export async function pullItems(key: ListKey, userId: MongoObjectId, match: Record<string, unknown>): Promise<void> {
    const accounts = await voiceAccountsCollection();
    await accounts.updateOne({ userId }, { $pull: { [key]: match } as never, $set: { updatedAt: new Date() } });
}

/** How many numbers the owner has (for `VOICE_NUMBER_LIMITS.maxPerOwner`). */
export async function countNumbers(userId: MongoObjectId): Promise<number> {
    const accounts = await voiceAccountsCollection();
    const [row] = await accounts
        .aggregate<{ n: number }>([{ $match: { userId } }, { $project: { n: { $size: { $ifNull: ['$numbers', []] } } } }])
        .toArray();
    return row?.n ?? 0;
}
