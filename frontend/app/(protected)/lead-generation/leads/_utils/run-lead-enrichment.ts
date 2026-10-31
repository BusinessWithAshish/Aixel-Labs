'use client';

import type { ALApiResponse } from '@aixellabs/backend/api/types';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { resolveEnrichmentTargets } from '@/app/actions/user-lead-actions';
import type { EnrichLeadsResult } from '@/server/leads/enrich-leads';
import { LEAD_GEN_ENRICH_API_ROUTE } from '@/config/app-config';
import {
    ENRICH_BATCH_SIZE,
    ENRICH_BULK_DOMAIN_CAP,
    ENRICH_SELECTED_DOMAIN_CAP,
    groupTargetsByDomain,
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

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
}

/**
 * Client orchestrator: resolve → enrich route batches, which crawl, charge and save on the server.
 * This only sequences UI + HTTP + toasts.
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
        const leadIds = batchKeys.flatMap((key) => (byDomain.get(key) ?? []).map((target) => target.leadId));

        let enrichRes: ALApiResponse<EnrichLeadsResult>;
        try {
            enrichRes = await appApiClient.post<EnrichLeadsResult>(LEAD_GEN_ENRICH_API_ROUTE, { leadIds }, { signal });
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

        if (!enrichRes.success || !enrichRes.data) {
            toast.error(enrichRes.error ?? `Crawl batch ${i + 1} failed`);
            break;
        }

        if (!enrichRes.data.matchedCount) {
            toast.message(`Crawl batch ${i + 1} returned no matching profiles`, {
                description: 'Domains may have failed to crawl — try again or pick different leads.',
            });
            continue;
        }

        patched += enrichRes.data.patchedCount;
        remainingCredits = enrichRes.data.remainingCredits;
        creditsExempt = enrichRes.data.creditsExempt;
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
