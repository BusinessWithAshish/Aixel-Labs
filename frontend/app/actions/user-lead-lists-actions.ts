'use server';

import {
    getCollection,
    LeadSource,
    MongoCollections,
    MongoObjectId,
    type UserLeadDoc,
    type UserLeadList,
    type UserLeadListDoc,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import {
    assertRequiredTrimmedString,
    assertValidObjectId,
    requireUserObjectId,
    runAuthenticatedAction,
    toObjectId,
} from '@/helpers/server-action-helpers';

const mapUserLeadListDocToUserLeadList = (
    list: UserLeadListDoc,
    leadCount = 0,
    sources: LeadSource[] = [],
): UserLeadList => {
    const { _id, userId, ...rest } = list;
    return {
        ...rest,
        _id: _id?.toString(),
        userId: userId.toString(),
        leadCount,
        sources,
    };
};

/** Derived leadCount + distinct sources, keyed by listId. */
async function getListStatsByListId(uid: MongoObjectId, listId?: MongoObjectId) {
    const rows = await (
        await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS)
    )
        .aggregate<{ _id: MongoObjectId; n: number; sources: (LeadSource | null)[] }>([
            { $match: listId ? { userId: uid, listId } : { userId: uid } },
            {
                $lookup: {
                    from: MongoCollections.LEADS,
                    localField: 'leadId',
                    foreignField: '_id',
                    as: 'lead',
                },
            },
            { $unwind: { path: '$lead', preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: '$listId',
                    n: { $sum: 1 },
                    sources: { $addToSet: '$lead.source' },
                },
            },
        ])
        .toArray();

    return new Map(
        rows.map((r) => [
            r._id.toString(),
            {
                leadCount: r.n,
                sources: r.sources.filter((s): s is LeadSource => s != null),
            },
        ]),
    );
}

export const getUserLeadLists = async (): Promise<ALApiResponse<UserLeadList[]>> =>
    runAuthenticatedAction(async function getUserLeadLists(userId) {
        const uid = requireUserObjectId(userId);
        const collection = await getCollection<UserLeadListDoc>(MongoCollections.LEAD_LISTS);
        const docs = await collection.find({ userId: uid }).sort({ createdAt: -1 }).toArray();
        const statsByListId = await getListStatsByListId(uid);

        return docs.map((doc) => {
            const stats = doc._id ? statsByListId.get(doc._id.toString()) : undefined;
            return mapUserLeadListDocToUserLeadList(doc, stats?.leadCount ?? 0, stats?.sources ?? []);
        });
    });

export const getUserLeadListById = async (listId: string): Promise<ALApiResponse<UserLeadList>> => {
    assertRequiredTrimmedString(listId, 'List ID');
    assertValidObjectId(listId, 'List ID');

    return runAuthenticatedAction(async function getUserLeadListById(userId) {
        const uid = requireUserObjectId(userId);
        const lid = toObjectId(listId, 'List ID');

        const listsCollection = await getCollection<UserLeadListDoc>(MongoCollections.LEAD_LISTS);
        const listDoc = await listsCollection.findOne({ _id: lid, userId: uid });
        if (!listDoc) {
            throw new Error('List not found');
        }

        const stats = (await getListStatsByListId(uid, lid)).get(lid.toString());
        return mapUserLeadListDocToUserLeadList(listDoc, stats?.leadCount ?? 0, stats?.sources ?? []);
    });
};

export const createUserLeadList = async (
    input: Pick<UserLeadListDoc, 'name' | 'description'>,
): Promise<ALApiResponse<UserLeadList>> => {
    const name = input.name?.trim() ?? '';
    if (!name) {
        throw new Error('Name is required');
    }

    return runAuthenticatedAction(async function createUserLeadList(userId) {
        const now = new Date();
        const uid = requireUserObjectId(userId);
        const listsCollection = await getCollection<UserLeadListDoc>(MongoCollections.LEAD_LISTS);

        const listInsert = await listsCollection.insertOne({
            userId: uid,
            name,
            ...(input.description !== undefined ? { description: input.description } : {}),
            createdAt: now,
            updatedAt: now,
        });

        const created: UserLeadListDoc = {
            _id: listInsert.insertedId,
            userId: uid,
            name,
            ...(input.description !== undefined ? { description: input.description } : {}),
            createdAt: now,
            updatedAt: now,
        };

        return mapUserLeadListDocToUserLeadList(created, 0);
    });
};

export const updateUserLeadListById = async (input: {
    listId: string;
    patch: Partial<Pick<UserLeadListDoc, 'name' | 'description'>>;
}): Promise<ALApiResponse<UserLeadList>> => {
    assertRequiredTrimmedString(input.listId, 'List ID');
    assertValidObjectId(input.listId, 'List ID');

    const { patch } = input;
    const hasPatch = patch.name !== undefined || patch.description !== undefined;

    if (!hasPatch) {
        throw new Error('No fields to update');
    }

    return runAuthenticatedAction(async function updateUserLeadListById(userId) {
        const uid = requireUserObjectId(userId);
        const collection = await getCollection<UserLeadListDoc>(MongoCollections.LEAD_LISTS);

        const $set: Partial<UserLeadListDoc> = {
            updatedAt: new Date(),
        };

        $set.name = patch.name;
        $set.description = patch.description;

        const updated = await collection.findOneAndUpdate(
            {
                _id: toObjectId(input.listId, 'List ID'),
                userId: uid,
            },
            { $set },
            { returnDocument: 'after' },
        );

        if (!updated || !updated._id) {
            throw new Error('List not found or update failed');
        }

        const stats = (await getListStatsByListId(uid, updated._id)).get(updated._id.toString());
        return mapUserLeadListDocToUserLeadList(updated, stats?.leadCount ?? 0, stats?.sources ?? []);
    });
};

export const deleteUserLeadListById = async (listId: string): Promise<ALApiResponse<boolean>> => {
    assertRequiredTrimmedString(listId, 'List ID');
    assertValidObjectId(listId, 'List ID');

    return runAuthenticatedAction(async function deleteUserLeadListById(userId) {
        const uid = requireUserObjectId(userId);
        const lid = toObjectId(listId, 'List ID');

        const listsCollection = await getCollection<UserLeadListDoc>(MongoCollections.LEAD_LISTS);
        const listResult = await listsCollection.deleteOne({ _id: lid, userId: uid });

        if (listResult.deletedCount !== 1) {
            throw new Error('List not found or deletion failed');
        }

        const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);
        await userLeadsCollection.deleteMany({ listId: lid, userId: uid });

        return true;
    });
};
