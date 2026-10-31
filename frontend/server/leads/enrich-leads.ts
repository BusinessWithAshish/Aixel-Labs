import 'server-only';

import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    type Lead,
    type LeadDoc,
    type UserLeadDoc,
    type UserLeadListDoc,
} from '@aixellabs/backend/db';
import { LEAD_GENERATION_SUB_MODULES, LeadSource } from '@aixellabs/backend/db/types';
import type { CRAWL_RESPONSE } from '@aixellabs/backend/crawl/types';
import { assertAndDebitCredits } from '@/app/actions/credit-db';
import { computeLeadGenCreditCost, getCreditCostPerItem } from '@/helpers/credits';
import { generateLeads } from '@/helpers/lead-gen-api';
import {
    ENRICH_BATCH_SIZE,
    extractLeadWebsite,
    groupTargetsByDomain,
    websiteDedupeKey,
} from '@/helpers/lead-website';
import { assertValidObjectId, toObjectId } from '@/helpers/server-action-helpers';

export type EnrichmentTarget = {
    leadId: string;
    domain: string;
};

export type ResolveEnrichmentTargetsInput = {
    listIds?: string[];
    leadIds?: string[];
};

export type EnrichLeadsResult = {
    /** Leads whose website the crawl returned a profile for. */
    matchedCount: number;
    patchedCount: number;
    remainingCredits: number;
    creditsExempt: boolean;
};

/** The websites to enrich, read from leads this user owns. Skips Crawl / already-enriched / no website. */
export async function resolveOwnedEnrichmentTargets(
    uid: MongoObjectId,
    input: ResolveEnrichmentTargetsInput,
): Promise<EnrichmentTarget[]> {
    const listIds = (input.listIds ?? []).filter(Boolean);
    const leadIds = (input.leadIds ?? []).filter(Boolean);
    if (!listIds.length && !leadIds.length) {
        throw new Error('Select at least one list or lead');
    }

    const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);
    let memberships: UserLeadDoc[];

    if (leadIds.length) {
        const leadOids = leadIds.map((id) => toObjectId(id, 'Lead ID'));
        memberships = await userLeadsCollection.find({ userId: uid, leadId: { $in: leadOids } }).toArray();
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
        memberships = await userLeadsCollection.find({ userId: uid, listId: { $in: ownedListIds } }).toArray();
    }

    if (!memberships.length) {
        return [];
    }

    const uniqueLeadIds = [...new Set(memberships.map((m) => m.leadId.toString()))].map((id) =>
        toObjectId(id, 'Lead ID'),
    );
    const leadsCollection = await getCollection<LeadDoc>(MongoCollections.LEADS);
    const leadDocs = await leadsCollection.find({ _id: { $in: uniqueLeadIds } }).toArray();

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
}

/**
 * Crawls the websites of leads this user owns (one batch), charges CRAWL credits × websites found,
 * then `$set: { enriched }`. Websites and results both come from the server, never the browser,
 * because `leads` is shared across tenants. Does not create leads or change memberships.
 */
export async function enrichOwnedLeads(
    uid: MongoObjectId,
    leadIds: string[],
    credits: { balance: number; spendable: number; exempt: boolean },
    signal: AbortSignal,
): Promise<EnrichLeadsResult> {
    const byDomain = groupTargetsByDomain(await resolveOwnedEnrichmentTargets(uid, { leadIds }));
    const affordable = credits.exempt
        ? ENRICH_BATCH_SIZE
        : Math.floor(credits.spendable / getCreditCostPerItem(LEAD_GENERATION_SUB_MODULES.CRAWL));
    const domainKeys = [...byDomain.keys()].slice(0, Math.min(ENRICH_BATCH_SIZE, affordable));
    if (!domainKeys.length) {
        throw new Error(byDomain.size ? 'Insufficient credits' : 'No matching leads to enrich');
    }

    const crawl = await generateLeads({
        subModule: LEAD_GENERATION_SUB_MODULES.CRAWL,
        body: { domains: domainKeys.map((key) => byDomain.get(key)![0]!.domain) },
        signal,
    });
    if (!crawl.success) {
        throw new Error(crawl.error ?? 'Crawl failed');
    }

    const profiles = new Map<string, CRAWL_RESPONSE>();
    for (const profile of (crawl.data ?? []) as CRAWL_RESPONSE[]) {
        const key = websiteDedupeKey(profile.domain);
        if (key) profiles.set(key, profile);
    }
    const findProfile = (targetKey: string): CRAWL_RESPONSE | undefined => {
        const exact = profiles.get(targetKey);
        if (exact) return exact;
        for (const [profileKey, profile] of profiles) {
            if (targetKey.endsWith(`.${profileKey}`)) return profile;
        }
        return undefined;
    };

    const patches: { leadId: string; enriched: CRAWL_RESPONSE }[] = [];
    for (const key of domainKeys) {
        const profile = findProfile(key);
        if (!profile) continue;
        for (const target of byDomain.get(key) ?? []) {
            patches.push({ leadId: target.leadId, enriched: profile });
        }
    }
    if (!patches.length || signal.aborted) {
        return { matchedCount: 0, patchedCount: 0, remainingCredits: credits.balance, creditsExempt: credits.exempt };
    }

    const websites = new Set(patches.map((patch) => websiteDedupeKey(patch.enriched.domain || patch.enriched.id)));
    const remainingCredits = await assertAndDebitCredits(
        uid,
        computeLeadGenCreditCost(LEAD_GENERATION_SUB_MODULES.CRAWL, websites.size),
    );

    const leadsCollection = await getCollection<LeadDoc>(MongoCollections.LEADS);
    let patchedCount = 0;
    for (const patch of patches) {
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

    return { matchedCount: patches.length, patchedCount, remainingCredits, creditsExempt: credits.exempt };
}
