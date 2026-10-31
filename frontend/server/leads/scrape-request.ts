import 'server-only';

import type { ZodType } from 'zod';
import { CRAWL_REQUEST_SCHEMA } from '@aixellabs/backend/crawl/schemas';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { FACEBOOK_REQUEST_SCHEMA } from '@aixellabs/backend/facebook/schemas';
import { GMAPS_REQUEST_SCHEMA } from '@aixellabs/backend/gmaps';
import { GMAPS_ADVANCED_REQUEST_SCHEMA } from '@aixellabs/backend/gmaps/advanced/schemas';
import { GSEARCH_REQUEST_SCHEMA } from '@aixellabs/backend/gsearch/schemas';
import { INSTAGRAM_REQUEST_SCHEMA } from '@aixellabs/backend/instagram/schemas';
import {
    LINKEDIN_BY_COMPANY_REQUEST_SCHEMA,
    LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA,
    LINKEDIN_SEARCH_TYPE,
} from '@aixellabs/backend/linkedin/schemas';
import { getCreditCostPerItem } from '@/helpers/credits';

/** Longest request body a form can reasonably send; caps the keyword and filter lists the schemas leave open. */
export const MAX_SCRAPE_BODY_BYTES = 64 * 1024;
/** One request runs one search per city, up to 10 pages each. */
export const MAX_GMAPS_CITIES = 25;
const GSEARCH_RESULTS_PER_PAGE = 20;

type ScrapeBody = Record<string, unknown>;

function requestSchema(subModule: LEAD_GENERATION_SUB_MODULES, body: unknown): ZodType<ScrapeBody, unknown> | null {
    switch (subModule) {
        case LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS:
            return GMAPS_REQUEST_SCHEMA;
        case LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS_ADVANCED:
            return GMAPS_ADVANCED_REQUEST_SCHEMA;
        case LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH:
            return GSEARCH_REQUEST_SCHEMA;
        case LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH:
            return INSTAGRAM_REQUEST_SCHEMA;
        case LEAD_GENERATION_SUB_MODULES.FACEBOOK:
            return FACEBOOK_REQUEST_SCHEMA;
        case LEAD_GENERATION_SUB_MODULES.LINKEDIN:
            return (body as ScrapeBody | null)?.searchType === LINKEDIN_SEARCH_TYPE.COMPANY
                ? LINKEDIN_BY_COMPANY_REQUEST_SCHEMA
                : LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA;
        case LEAD_GENERATION_SUB_MODULES.CRAWL:
            return CRAWL_REQUEST_SCHEMA;
        default:
            return null;
    }
}

/** The body parsed with the backend's own schema, plus the limits it leaves to the product; else why not. */
export function parseScrapeBody(
    subModule: LEAD_GENERATION_SUB_MODULES,
    body: unknown,
): { body: ScrapeBody } | { error: string } {
    const parsed = requestSchema(subModule, body)?.safeParse(body);
    if (!parsed?.success) return { error: 'Invalid request body' };

    if (subModule === LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS) {
        const { cities, urls } = parsed.data as { cities?: unknown[]; urls?: unknown[] };
        if ((cities?.length ?? 0) > MAX_GMAPS_CITIES || (urls?.length ?? 0) > MAX_GMAPS_CITIES) {
            return { error: `Pick at most ${MAX_GMAPS_CITIES} cities per search` };
        }
    }
    return { body: parsed.data };
}

function capArray(values: unknown, max: number): unknown {
    return Array.isArray(values) ? values.slice(0, max) : values;
}

/** Asks for no more than the balance can pay for, so a nearly empty balance cannot buy a full-size scrape. */
export function capScrapeBodyToCredits(
    subModule: LEAD_GENERATION_SUB_MODULES,
    body: ScrapeBody,
    credits: number,
): ScrapeBody {
    const maxItems = Math.floor(credits / getCreditCostPerItem(subModule));

    switch (subModule) {
        case LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS_ADVANCED:
            return { ...body, urls: capArray(body.urls, maxItems) };
        case LEAD_GENERATION_SUB_MODULES.CRAWL:
            return { ...body, domains: capArray(body.domains, maxItems) };
        case LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH:
            return {
                ...body,
                pages: Math.min(Number(body.pages) || 1, Math.max(1, Math.ceil(maxItems / GSEARCH_RESULTS_PER_PAGE))),
            };
        default:
            return { ...body, limit: Math.min(Number(body.limit) || maxItems, maxItems) };
    }
}
