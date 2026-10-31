import 'server-only';

import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    type LeadDoc,
    type UserLead,
    type UserLeadDoc,
} from '@aixellabs/backend/db';
import type { LeadData, LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { assertAndDebitCredits, getUserCreditsState } from '@/app/actions/credit-db';
import { createUserLeadList } from '@/app/actions/user-lead-lists-actions';
import { computeLeadGenCreditCost, DAILY_LIMIT_MESSAGE, getCreditCostPerItem, NO_CREDITS_MESSAGE } from '@/helpers/credits';
import { buildLeadListNameFromPreset, getLeadSoruceFromSubModule } from '@/helpers/lead-gen-api';
import { ensureUserLeadIndexes } from '@/server/leads/indexes';

export type CreateUserLeadsResult = {
    leads: UserLead[];
    /** Balance after debit (admins keep their stored balance; never charged). */
    remainingCredits: number;
    /** Admins are outside the credits system — UI must not show cost/exhausted messaging. */
    creditsExempt: boolean;
    /** This run used up today's cap, so the next one has to wait for tomorrow. */
    dailyLimitReached: boolean;
};

/**
 * Debit + Mongo save, for leads this server just scraped. Never takes leads from a browser: they go
 * into `leads`, which every tenant shares. Called by `POST /api/lead-gen/scrape`, which checks access.
 */
export async function saveScrapedLeads(
    uid: MongoObjectId,
    subModule: LEAD_GENERATION_SUB_MODULES,
    scrapedLeads: LeadData[],
    listName: string,
): Promise<CreateUserLeadsResult> {
    const { credits: availableCredits, spendable, dailyRemaining = 0, exempt } = await getUserCreditsState(uid);
    if (!exempt && availableCredits < 1) {
        throw new Error(NO_CREDITS_MESSAGE);
    }
    if (!exempt && spendable < 1) {
        throw new Error(DAILY_LIMIT_MESSAGE);
    }

    const uniqueLeads = [
        ...new Map(scrapedLeads.filter((lead) => lead.id != null).map((lead) => [lead.id!, lead])).values(),
    ];
    if (!uniqueLeads.length) {
        throw new Error('[CRITICAL] No leads to save');
    }

    // Cap to what the balance and today's cap can cover (e.g. 250 credits + 255 leads → keep 250).
    // Debit before creating a list so a failed charge cannot leave an orphan list.
    const costPerItem = getCreditCostPerItem(subModule);
    const balance = spendable;
    const maxItems = exempt ? uniqueLeads.length : Math.floor(balance / costPerItem);
    const leads = uniqueLeads.slice(0, Math.max(0, maxItems));
    if (!leads.length) {
        throw new Error(`Insufficient credits: need at least ${costPerItem}, have ${balance}`);
    }

    const cost = computeLeadGenCreditCost(subModule, leads.length);
    const remainingCredits = await assertAndDebitCredits(uid, cost);

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

    return {
        leads: userLeads,
        remainingCredits,
        creditsExempt: exempt,
        dailyLimitReached: !exempt && dailyRemaining - cost <= 0,
    };
}
