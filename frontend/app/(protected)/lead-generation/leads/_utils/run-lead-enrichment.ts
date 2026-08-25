'use client';

import type { ALApiResponse } from '@aixellabs/backend/api/types';
import type { CRAWL_RESPONSE } from '@aixellabs/backend/crawl/types';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import {
    applyLeadEnrichment,
    resolveEnrichmentTargets,
    type EnrichmentTarget,
} from '@/app/actions/user-lead-actions';
import { LEAD_GEN_SCRAPE_API_ROUTE } from '@/config/app-config';
import {
    ENRICH_BATCH_SIZE,
    ENRICH_BULK_DOMAIN_CAP,
    ENRICH_SELECTED_DOMAIN_CAP,
    websiteDedupeKey,
} from '@/helpers/lead-website';
import appApiClient, { isAbortOrCancel } from '@/lib/app-api-client';
import { getCreditCostPerItem } from '@/helpers/credits';
import { toast } from 'sonner';

export type RunLeadEnrichmentMode = 'selected' | 'bulk';

export type RunLeadEnrichmentOptions = {
    leadIds?: string[];
    listIds?: string[];
    mode: RunLeadEnrichmentMode;
    signal?: AbortSignal;
};

export type RunLeadEnrichmentResult = {
    patched: number;
    skippedCap: number;
    batches: number;
    remainingCredits?: number;
    creditsExempt?: boolean;
};

function capForMode(mode: RunLeadEnrichmentMode): number {
    return mode === 'selected' ? ENRICH_SELECTED_DOMAIN_CAP : ENRICH_BULK_DOMAIN_CAP;
}

function groupTargetsByDomain(targets: EnrichmentTarget[]): Map<string, EnrichmentTarget[]> {
    const map = new Map<string, EnrichmentTarget[]>();
    for (const target of targets) {
        const key = websiteDedupeKey(target.domain);
        if (!key) continue;
        const list = map.get(key) ?? [];
        list.push(target);
        map.set(key, list);
    }
    return map;
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
}

/**
 * Client orchestrator: resolve → scrape BFF batches → applyLeadEnrichment (server action).
 * Mongo mutations live in `user-lead-actions`; this only sequences UI + HTTP + toasts.
 */
export async function runLeadEnrichment(
    options: RunLeadEnrichmentOptions,
): Promise<RunLeadEnrichmentResult | null> {
    const { mode, signal } = options;
    const resolveRes = await resolveEnrichmentTargets({
        leadIds: options.leadIds,
        listIds: options.listIds,
    });
    if (!resolveRes.success || !resolveRes.data) {
        toast.error(resolveRes.error ?? 'Failed to resolve enrichment targets');
        return null;
    }

    const byDomain = groupTargetsByDomain(resolveRes.data);
    const domainKeys = [...byDomain.keys()];
    if (!domainKeys.length) {
        toast.message('Nothing to enrich', {
            description:
                'Selected leads need a website URL (Maps/Facebook/LinkedIn website, Instagram bio link, or Search result URL). Already enriched and Crawl leads are skipped.',
        });
        return { patched: 0, skippedCap: 0, batches: 0 };
    }

    const cap = capForMode(mode);
    const cappedKeys = domainKeys.slice(0, cap);
    const skippedCap = Math.max(0, domainKeys.length - cappedKeys.length);
    const costPer = getCreditCostPerItem(LEAD_GENERATION_SUB_MODULES.CRAWL);
    const estimatedCost = cappedKeys.length * costPer;

    toast.info(`Enriching ${cappedKeys.length} website(s)…`, {
        description:
            skippedCap > 0
                ? `Estimated ${estimatedCost} credit(s). ${skippedCap} more left — run Enrich again.`
                : `Estimated ${estimatedCost} credit(s).`,
    });

    const batches = chunk(cappedKeys, ENRICH_BATCH_SIZE);
    let patched = 0;
    let remainingCredits: number | undefined;
    let creditsExempt: boolean | undefined;

    for (let i = 0; i < batches.length; i++) {
        if (signal?.aborted) {
            toast.message('Enrichment stopped', {
                description: `Applied ${patched} lead(s) before cancel.`,
            });
            break;
        }

        const batchKeys = batches[i]!;
        const domains = batchKeys.map((key) => byDomain.get(key)![0]!.domain);

        let scrapeRes: ALApiResponse<CRAWL_RESPONSE[]>;
        try {
            scrapeRes = await appApiClient.post<CRAWL_RESPONSE[]>(
                LEAD_GEN_SCRAPE_API_ROUTE,
                {
                    subModule: LEAD_GENERATION_SUB_MODULES.CRAWL,
                    body: { domains },
                },
                { signal },
            );
        } catch (error) {
            if (isAbortOrCancel(error) || signal?.aborted) {
                toast.message('Enrichment stopped', {
                    description: `Applied ${patched} lead(s) before cancel.`,
                });
                break;
            }
            toast.error(error instanceof Error ? error.message : 'Crawl scrape failed');
            break;
        }

        if (!scrapeRes.success || !scrapeRes.data?.length) {
            toast.error(scrapeRes.error ?? `Crawl batch ${i + 1} failed`);
            break;
        }

        const profileByKey = new Map<string, CRAWL_RESPONSE>();
        for (const profile of scrapeRes.data) {
            const profileKey = websiteDedupeKey(profile.domain);
            if (profileKey) profileByKey.set(profileKey, profile);
        }

        const findProfile = (targetKey: string): CRAWL_RESPONSE | undefined => {
            const exact = profileByKey.get(targetKey);
            if (exact) return exact;
            for (const [profileKey, profile] of profileByKey) {
                if (targetKey === profileKey || targetKey.endsWith(`.${profileKey}`)) {
                    return profile;
                }
            }
            return undefined;
        };

        const patches: { leadId: string; enriched: CRAWL_RESPONSE }[] = [];
        for (const key of batchKeys) {
            const profile = findProfile(key);
            if (!profile) continue;
            for (const target of byDomain.get(key) ?? []) {
                patches.push({ leadId: target.leadId, enriched: profile });
            }
        }

        if (!patches.length) {
            toast.message(`Crawl batch ${i + 1} returned no matching profiles`, {
                description: 'Domains may have failed to crawl — try again or pick different leads.',
            });
            continue;
        }

        const applyRes = await applyLeadEnrichment(patches);
        if (!applyRes.success || !applyRes.data) {
            toast.error(applyRes.error ?? 'Failed to save enrichment');
            break;
        }

        patched += applyRes.data.patchedCount;
        remainingCredits = applyRes.data.remainingCredits;
        creditsExempt = applyRes.data.creditsExempt;
    }

    if (patched > 0) {
        toast.success(`Enriched ${patched} lead(s)`, {
            description:
                skippedCap > 0
                    ? `${skippedCap} website(s) remaining — run Enrich again to continue.`
                    : undefined,
        });
    }

    return { patched, skippedCap, batches: batches.length, remainingCredits, creditsExempt };
}
