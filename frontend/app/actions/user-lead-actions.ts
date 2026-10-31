'use server';

import { Lead, LeadDoc, MongoCollections, MongoObjectId, UserLead, getCollection } from '@aixellabs/backend/db';
import { UserLeadDoc, UserLeadListDoc } from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import {
    assertRequiredTrimmedString,
    assertValidObjectId,
    requireUserObjectId,
    runAuthenticatedAction,
    toObjectId,
} from '@/helpers/server-action-helpers';
import { ensureUserLeadIndexes } from '@/server/leads/indexes';
import {
    resolveOwnedEnrichmentTargets,
    type EnrichmentTarget,
    type ResolveEnrichmentTargetsInput,
} from '@/server/leads/enrich-leads';

export const getUserLeadsForList = async (listId: string): Promise<ALApiResponse<Lead[]>> => {
    assertRequiredTrimmedString(listId, 'List ID');
    assertValidObjectId(listId, 'List ID');

    return runAuthenticatedAction(async function getUserLeadsForList(userId: string) {
        const uid = requireUserObjectId(userId);
        const lid = toObjectId(listId, 'List ID');

        const listsCollection = await getCollection<UserLeadListDoc>(MongoCollections.LEAD_LISTS);
        const listDoc = await listsCollection.findOne({ _id: lid, userId: uid });
        if (!listDoc) {
            throw new Error('List not found');
        }

        const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);
        const userLeadDocs = await userLeadsCollection.find({ userId: uid, listId: lid }).toArray();
        if (!userLeadDocs.length) {
            return [];
        }

        const leadIds = userLeadDocs.map((userLeadDoc) => userLeadDoc.leadId);
        const leadsCollection = await getCollection<LeadDoc>(MongoCollections.LEADS);
        const leadDocs = await leadsCollection.find({ _id: { $in: leadIds } }).toArray();

        return leadDocs.map((leadDoc) => ({
            _id: leadDoc._id.toString(),
            source: leadDoc.source,
            sourceId: leadDoc.sourceId,
            data: leadDoc.data,
            ...(leadDoc.enriched ? { enriched: leadDoc.enriched } : {}),
        }));
    });
};

/** Removes lead memberships from one list only (other lists keep their copies). */
export const deleteUserLeads = async (
    listId: string,
    leadIds: string[],
): Promise<ALApiResponse<boolean>> => {
    assertRequiredTrimmedString(listId, 'List ID');
    assertValidObjectId(listId, 'List ID');

    return runAuthenticatedAction(async function deleteUserLeads(userId: string) {
        const uid = requireUserObjectId(userId);
        const lid = toObjectId(listId, 'List ID');
        const leadOids = leadIds.map((id) => toObjectId(id, 'Lead ID'));
        const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);
        await userLeadsCollection.deleteMany({
            userId: uid,
            listId: lid,
            leadId: { $in: leadOids },
        });
        return true;
    });
};

/** Copies selected leads into a new list (does not remove them from existing lists). */
export const createUserLeadListFromLeadIds = async (input: {
    name: string;
    leadIds: string[];
}): Promise<ALApiResponse<{ listId: string; copiedCount: number }>> => {
    const name = input.name?.trim() ?? '';
    if (!name) throw new Error('Name is required');
    if (!input.leadIds.length) throw new Error('Select at least one lead');

    return runAuthenticatedAction(async function createUserLeadListFromLeadIds(userId: string) {
        const uid = requireUserObjectId(userId);
        const leadOids = input.leadIds.map((id) => toObjectId(id, 'Lead ID'));
        const now = new Date();

        await ensureUserLeadIndexes();
        const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);
        const owned = await userLeadsCollection
            .find({ userId: uid, leadId: { $in: leadOids } })
            .project({ leadId: 1 })
            .toArray();
        const ownedLeadIdStrings = new Set(owned.map((doc) => doc.leadId.toString()));
        const leadsToCopy = leadOids.filter((oid) => ownedLeadIdStrings.has(oid.toString()));
        if (!leadsToCopy.length) {
            throw new Error('No matching leads to copy');
        }

        const listsCollection = await getCollection<UserLeadListDoc>(MongoCollections.LEAD_LISTS);
        const listInsert = await listsCollection.insertOne({
            userId: uid,
            name,
            createdAt: now,
            updatedAt: now,
        });
        const newListId = listInsert.insertedId;

        let copiedCount = 0;
        for (const leadId of leadsToCopy) {
            const result = await userLeadsCollection.updateOne(
                { userId: uid, leadId, listId: newListId },
                {
                    $set: { updatedAt: now },
                    $setOnInsert: {
                        userId: uid,
                        leadId,
                        listId: newListId,
                        createdAt: now,
                    },
                },
                { upsert: true },
            );
            if (result.upsertedCount > 0 || result.modifiedCount > 0) {
                copiedCount += 1;
            }
        }

        return {
            listId: newListId.toString(),
            copiedCount,
        };
    });
};

/** Owned lists only. Skips Crawl / already-enriched / no website. */
export const resolveEnrichmentTargets = async (
    input: ResolveEnrichmentTargetsInput,
): Promise<ALApiResponse<EnrichmentTarget[]>> =>
    runAuthenticatedAction(async function resolveEnrichmentTargets(userId: string) {
        return resolveOwnedEnrichmentTargets(requireUserObjectId(userId), input);
    });
