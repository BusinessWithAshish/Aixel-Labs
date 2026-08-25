import type { Lead, LeadData } from '@aixellabs/backend/db/types';
import { LeadSource } from '@aixellabs/backend/db/types';
import { CRAWL } from '@aixellabs/backend/crawl/constants';

/**
 * Pure lead-website helpers + enrich caps (no I/O, no Mongo, no toasts).
 * Website extraction for enrichment targeting — mutations live in `user-lead-actions`.
 */
/** Unique domains per enrich click — selected leads. */
export const ENRICH_SELECTED_DOMAIN_CAP = 100;
/** Unique domains per enrich click — whole list / selected lists. */
export const ENRICH_BULK_DOMAIN_CAP = 250;
/** Domains per scrape HTTP call (matches crawl API max). */
export const ENRICH_BATCH_SIZE = CRAWL.MAX_DOMAINS;

/** Social / app hosts — skip when picking an Instagram bio website for crawl. */
const NON_BUSINESS_HOST_SUFFIXES = [
    'instagram.com',
    'facebook.com',
    'fb.com',
    'fb.me',
    'youtube.com',
    'youtu.be',
    'twitter.com',
    'x.com',
    'tiktok.com',
    'linkedin.com',
    'wa.me',
    'api.whatsapp.com',
    'whatsapp.com',
    't.me',
    'linktr.ee',
    'g.co',
    'maps.google.com',
    'goo.gl',
];

/** Hostname key for deduping targets (client-safe, no Node crypto). */
export function websiteDedupeKey(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    try {
        const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        return new URL(withScheme).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return trimmed.toLowerCase();
    }
}

function isNonBusinessHost(hostKey: string): boolean {
    return NON_BUSINESS_HOST_SUFFIXES.some(
        (suffix) => hostKey === suffix || hostKey.endsWith(`.${suffix}`),
    );
}

/** Prefer a crawlable business site over social / messenger links. */
function firstBusinessWebsite(urls: string[]): string | null {
    for (const raw of urls) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const key = websiteDedupeKey(trimmed);
        if (!key || !key.includes('.')) continue;
        if (isNonBusinessHost(key)) continue;
        return trimmed;
    }
    return null;
}

function pickWebsiteFromData(source: LeadSource, data: LeadData): string | null {
    if (!data || typeof data !== 'object') return null;

    if (source === LeadSource.CRAWL) return null;

    if (
        source === LeadSource.GOOGLE_MAPS ||
        source === LeadSource.GOOGLE_MAPS_ADVANCED ||
        source === LeadSource.FACEBOOK
    ) {
        const website = 'website' in data ? data.website : null;
        return typeof website === 'string' && website.trim() ? website.trim() : null;
    }

    if (source === LeadSource.INSTAGRAM) {
        const urls: string[] = [];
        if ('websites' in data && Array.isArray(data.websites)) {
            for (const w of data.websites) {
                if (typeof w === 'string' && w.trim()) urls.push(w);
            }
        }
        if ('bio_links' in data && Array.isArray(data.bio_links)) {
            for (const link of data.bio_links) {
                if (
                    link &&
                    typeof link === 'object' &&
                    'url' in link &&
                    typeof link.url === 'string' &&
                    link.url.trim()
                ) {
                    urls.push(link.url);
                }
            }
        }
        return firstBusinessWebsite(urls);
    }

    if (source === LeadSource.GOOGLE_ADVANCED_SEARCH) {
        const url =
            ('url' in data && typeof data.url === 'string' && data.url) ||
            ('id' in data && typeof data.id === 'string' && data.id) ||
            null;
        return url?.trim() || null;
    }

    if (source === LeadSource.LINKEDIN) {
        if ('website' in data && typeof data.website === 'string' && data.website.trim()) {
            return data.website.trim();
        }
        return null;
    }

    return null;
}

/** Website/URL to crawl for this lead, or null if not enrichable from source data. */
export function extractLeadWebsite(lead: Pick<Lead, 'source' | 'data' | 'enriched'>): string | null {
    if (lead.source === LeadSource.CRAWL) return null;
    if (lead.enriched) return null;
    return pickWebsiteFromData(lead.source, lead.data);
}

export function isLeadEnrichable(lead: Pick<Lead, 'source' | 'data' | 'enriched'>): boolean {
    return extractLeadWebsite(lead) != null;
}
