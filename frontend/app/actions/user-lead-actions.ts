'use server';

import { Lead, LeadDoc, MongoCollections, MongoObjectId, UserLead, getCollection } from '@aixellabs/backend/db';
import { LEAD_GENERATION_SUB_MODULES, Modules, UserLeadDoc, UserLeadListDoc } from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import {
    assertRequiredTrimmedString,
    assertValidObjectId,
    requireUserObjectId,
    runAuthenticatedAction,
    toObjectId,
} from '@/helpers/server-action-helpers';
import { buildDefaultLeadListName, generateLeads, getLeadSoruceFromSubModule } from '@/helpers/lead-gen-api';
import { computeLeadGenCreditCost, getCreditCostPerItem } from '@/helpers/credits';
import { assertAndDebitCredits, getUserCreditsState } from '@/app/actions/credit-db';
import { createUserLeadList } from './user-lead-lists-actions';
import { getAppSession } from '@/server/auth';
import { hasSubModuleAccess } from '@/helpers/module-access-helpers';

export type CreateUserLeadsResult = {
    leads: UserLead[];
    /** Balance after debit (admins keep their stored balance; never charged). */
    remainingCredits: number;
    /** Admins are outside the credits system — UI must not show cost/exhausted messaging. */
    creditsExempt: boolean;
};

export async function createUserLeads<TRequest>(
    subModule: LEAD_GENERATION_SUB_MODULES,
    body: TRequest,
): Promise<ALApiResponse<CreateUserLeadsResult>> {
    return runAuthenticatedAction(async function createUserLeads(userId: string) {
        const uid = requireUserObjectId(userId);
        const session = await getAppSession();
        if (!session?.user) {
            throw new Error('Unauthorized');
        }

        const { credits: availableCredits, exempt } = await getUserCreditsState(uid);
        if (!exempt) {
            if (
                !hasSubModuleAccess(session.user.moduleAccess, Modules.LEAD_GENERATION, subModule)
            ) {
                throw new Error('Unauthorized: no access to this lead generation module');
            }
            if (availableCredits < 1) {
                throw new Error('Insufficient credits');
            }
        }

        const leadsResponse = await generateLeads({ subModule, body });

        if (!leadsResponse.success || !leadsResponse.data?.length) {
            throw new Error(leadsResponse.error ?? 'Failed to generate leads');
        }

        const uniqueLeads = [
            ...new Map(leadsResponse.data.filter((lead) => lead.id != null).map((lead) => [lead.id!, lead])).values(),
        ];
        if (!uniqueLeads.length) {
            throw new Error('[CRITICAL] No leads to save');
        }

        // Cap to what the balance can cover (e.g. 250 credits + 255 leads → keep 250).
        // Debit before creating a list so a failed charge cannot leave an orphan list.
        const costPerItem = getCreditCostPerItem(subModule);
        const balance = exempt ? availableCredits : (await getUserCreditsState(uid)).credits;
        const maxItems = exempt ? uniqueLeads.length : Math.floor(balance / costPerItem);
        const leads = uniqueLeads.slice(0, Math.max(0, maxItems));
        if (!leads.length) {
            throw new Error(`Insufficient credits: need at least ${costPerItem}, have ${balance}`);
        }

        const remainingCredits = await assertAndDebitCredits(
            uid,
            computeLeadGenCreditCost(subModule, leads.length),
        );

        const leadSource = getLeadSoruceFromSubModule(subModule);

        const userLeadListResponse = await createUserLeadList({ name: buildDefaultLeadListName(subModule) });
        if (!userLeadListResponse.success || !userLeadListResponse.data) {
            throw new Error('Failed to create user lead list');
        }

        const listId = new MongoObjectId(userLeadListResponse.data._id);
        const now = new Date();
        const leadsCollection = await getCollection<LeadDoc>(MongoCollections.LEADS);
        const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);

        const userLeads: UserLead[] = [];
        for (const lead of leads) {
            const sourceId = lead.id!;
            const leadDoc = await leadsCollection.findOneAndUpdate(
                { source: leadSource, sourceId },
                { $set: { data: lead }, $setOnInsert: { source: leadSource, sourceId } },
                { upsert: true, returnDocument: 'after' },
            );
            if (!leadDoc?._id) {
                throw new Error('Failed to upsert lead');
            }

            // Membership is per list: same lead may appear in multiple lists for one user.
            const userLeadDoc = await userLeadsCollection.findOneAndUpdate(
                { userId: uid, leadId: leadDoc._id, listId },
                {
                    $set: { updatedAt: now },
                    $setOnInsert: {
                        userId: uid,
                        leadId: leadDoc._id,
                        listId,
                        createdAt: now,
                    },
                },
                { upsert: true, returnDocument: 'after' },
            );
            if (!userLeadDoc?._id) {
                throw new Error('Failed to upsert user lead');
            }

            userLeads.push({
                _id: userLeadDoc._id.toString(),
                userId: uid.toString(),
                leadId: leadDoc._id.toString(),
                listId: listId.toString(),
                createdAt: userLeadDoc.createdAt,
                updatedAt: now,
            });
        }

        return { leads: userLeads, remainingCredits, creditsExempt: exempt };
    });
}

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
