'use server';

import { Lead, LeadDoc, MongoCollections, MongoObjectId, UserLead, getCollection } from '@aixellabs/backend/db';
import {
    type LeadData,
    LeadSource,
    LEAD_GENERATION_SUB_MODULES,
    Modules,
    UserLeadDoc,
    UserLeadListDoc,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import {
    assertRequiredTrimmedString,
    assertValidObjectId,
    requireUserObjectId,
    runAuthenticatedAction,
    toObjectId,
} from '@/helpers/server-action-helpers';
import { buildLeadListNameFromPreset, getLeadSoruceFromSubModule } from '@/helpers/lead-gen-api';
import { computeLeadGenCreditCost, getCreditCostPerItem } from '@/helpers/credits';
import { assertAndDebitCredits, getUserCreditsState } from '@/app/actions/credit-db';
import { createUserLeadList } from './user-lead-lists-actions';
import { getAppSession } from '@/server/auth';
import { hasSubModuleAccess } from '@/helpers/module-access-helpers';
import { ensureUserLeadIndexes } from '@/server/leads/indexes';

export type CreateUserLeadsResult = {
    leads: UserLead[];
    /** Balance after debit (admins keep their stored balance; never charged). */
    remainingCredits: number;
    /** Admins are outside the credits system — UI must not show cost/exhausted messaging. */
    creditsExempt: boolean;
};

export type CreateUserLeadsOptions = {
    /** Form preset name used as the lead list title base. Required. */
    listName: string;
};

/** Debit + Mongo save for already-scraped leads. Scrape happens via `LEAD_GEN_SCRAPE_API_ROUTE`. */
export async function createUserLeads(
    subModule: LEAD_GENERATION_SUB_MODULES,
    scrapedLeads: LeadData[],
    options: CreateUserLeadsOptions,
): Promise<ALApiResponse<CreateUserLeadsResult>> {
    assertRequiredTrimmedString(options.listName, 'listName');
    const listName = options.listName.trim();

    return runAuthenticatedAction(async function createUserLeads(userId: string) {
        const uid = requireUserObjectId(userId);
        const session = await getAppSession();
        if (!session?.user) {
            throw new Error('Unauthorized');
        }

        const { credits: availableCredits, exempt } = await getUserCreditsState(uid);
        if (!exempt) {
            if (!hasSubModuleAccess(session.user.moduleAccess, Modules.LEAD_GENERATION, subModule)) {
                throw new Error('Unauthorized: no access to this lead generation module');
            }
            if (availableCredits < 1) {
                throw new Error('Insufficient credits');
            }
        }

        if (!scrapedLeads.length) {
            throw new Error('Failed to generate leads');
        }

        const uniqueLeads = [
            ...new Map(scrapedLeads.filter((lead) => lead.id != null).map((lead) => [lead.id!, lead])).values(),
        ];
        if (!uniqueLeads.length) {
            throw new Error('[CRITICAL] No leads to save');
        }

        // Cap to what the balance can cover (e.g. 250 credits + 255 leads → keep 250).
        // Debit before creating a list so a failed charge cannot leave an orphan list.
        const costPerItem = getCreditCostPerItem(subModule);
        const balance = availableCredits;
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

        const userLeadListResponse = await createUserLeadList({
            name: buildLeadListNameFromPreset(listName),
        });
        if (!userLeadListResponse.success || !userLeadListResponse.data) {
            throw new Error('Failed to create user lead list');
        }

        const listId = new MongoObjectId(userLeadListResponse.data._id);
        const now = new Date();
        await ensureUserLeadIndexes();
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

export type EnrichmentTarget = {
    leadId: string;
    domain: string;
};

export type ResolveEnrichmentTargetsInput = {
    listIds?: string[];
    leadIds?: string[];
};

/** Owned lists only. Skips Crawl / already-enriched / no website. */
export const resolveEnrichmentTargets = async (
    input: ResolveEnrichmentTargetsInput,
): Promise<ALApiResponse<EnrichmentTarget[]>> => {
    return runAuthenticatedAction(async function resolveEnrichmentTargets(userId: string) {
        const uid = requireUserObjectId(userId);
        const listIds = (input.listIds ?? []).filter(Boolean);
        const leadIds = (input.leadIds ?? []).filter(Boolean);
        if (!listIds.length && !leadIds.length) {
            throw new Error('Select at least one list or lead');
        }

        const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);
        let memberships: UserLeadDoc[];

        if (leadIds.length) {
            const leadOids = leadIds.map((id) => toObjectId(id, 'Lead ID'));
            memberships = await userLeadsCollection
                .find({ userId: uid, leadId: { $in: leadOids } })
                .toArray();
        } else {
            const listOids = listIds.map((id) => {
                assertValidObjectId(id, 'List ID');
                return toObjectId(id, 'List ID');
            });
            const listsCollection = await getCollection<UserLeadListDoc>(MongoCollections.LEAD_LISTS);
            const ownedLists = await listsCollection
                .find({ _id: { $in: listOids }, userId: uid })
                .project({ _id: 1 })
                .toArray();
            const ownedListIds = ownedLists.map((l) => l._id!);
            if (!ownedListIds.length) {
                throw new Error('No matching lists found');
            }
            memberships = await userLeadsCollection
                .find({ userId: uid, listId: { $in: ownedListIds } })
                .toArray();
        }

        if (!memberships.length) {
            return [];
        }

        const uniqueLeadIds = [...new Set(memberships.map((m) => m.leadId.toString()))].map(
            (id) => toObjectId(id, 'Lead ID'),
        );
        const leadsCollection = await getCollection<LeadDoc>(MongoCollections.LEADS);
        const leadDocs = await leadsCollection.find({ _id: { $in: uniqueLeadIds } }).toArray();

        const { extractLeadWebsite } = await import('@/helpers/lead-website');
        const targets: EnrichmentTarget[] = [];
        for (const leadDoc of leadDocs) {
            const lead: Lead = {
                _id: leadDoc._id.toString(),
                source: leadDoc.source,
                sourceId: leadDoc.sourceId,
                data: leadDoc.data,
                ...(leadDoc.enriched ? { enriched: leadDoc.enriched } : {}),
            };
            const domain = extractLeadWebsite(lead);
            if (!domain) continue;
            targets.push({ leadId: lead._id!, domain });
        }
        return targets;
    });
};

export type ApplyLeadEnrichmentPatch = {
    leadId: string;
    enriched: import('@aixellabs/backend/crawl/types').CRAWL_RESPONSE;
};

export type ApplyLeadEnrichmentResult = {
    patchedCount: number;
    remainingCredits: number;
    creditsExempt: boolean;
};

/**
 * Debit CRAWL credits × unique domains in this batch, then `$set: { enriched }` on owned leads.
 * Does not create leads or change memberships.
 */
export const applyLeadEnrichment = async (
    patches: ApplyLeadEnrichmentPatch[],
): Promise<ALApiResponse<ApplyLeadEnrichmentResult>> => {
    return runAuthenticatedAction(async function applyLeadEnrichment(userId: string) {
        const uid = requireUserObjectId(userId);
        const session = await getAppSession();
        if (!session?.user) {
            throw new Error('Unauthorized');
        }

        if (!patches.length) {
            throw new Error('No enrichment patches to apply');
        }

        const { credits: availableCredits, exempt } = await getUserCreditsState(uid);
        if (!exempt) {
            if (
                !hasSubModuleAccess(
                    session.user.moduleAccess,
                    Modules.LEAD_GENERATION,
                    LEAD_GENERATION_SUB_MODULES.CRAWL,
                )
            ) {
                throw new Error('Unauthorized: no access to Crawl');
            }
        }

        const { websiteDedupeKey } = await import('@/helpers/lead-website');
        const uniqueDomainKeys = new Set(
            patches.map((p) => websiteDedupeKey(p.enriched.domain || p.enriched.id)).filter(Boolean),
        );
        const uniqueDomainCount = uniqueDomainKeys.size || patches.length;
        const cost = computeLeadGenCreditCost(LEAD_GENERATION_SUB_MODULES.CRAWL, uniqueDomainCount);
        if (!exempt && availableCredits < cost) {
            throw new Error(`Insufficient credits: need ${cost}, have ${availableCredits}`);
        }

        // Verify ownership via any user_leads membership
        const leadOids = patches.map((p) => toObjectId(p.leadId, 'Lead ID'));
        const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);
        const owned = await userLeadsCollection
            .find({ userId: uid, leadId: { $in: leadOids } })
            .project({ leadId: 1 })
            .toArray();
        const ownedSet = new Set(owned.map((o) => o.leadId.toString()));
        const ownedPatches = patches.filter((p) => ownedSet.has(p.leadId));
        if (!ownedPatches.length) {
            throw new Error('No matching leads to enrich');
        }

        const remainingCredits = await assertAndDebitCredits(uid, cost);
        const leadsCollection = await getCollection<LeadDoc>(MongoCollections.LEADS);

        let patchedCount = 0;
        for (const patch of ownedPatches) {
            const result = await leadsCollection.updateOne(
                {
                    _id: toObjectId(patch.leadId, 'Lead ID'),
                    source: { $ne: LeadSource.CRAWL },
                    enriched: { $exists: false },
                },
                { $set: { enriched: patch.enriched } },
            );
            if (result.modifiedCount > 0) {
                patchedCount += 1;
            }
        }

        return { patchedCount, remainingCredits, creditsExempt: exempt };
    });
};
