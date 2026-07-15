import { LeadSource } from '@aixellabs/backend/db/types';
import { LINKEDIN_COMPANY_SIZE_ENUM } from '@aixellabs/backend/linkedin/constants';
import {
    GMAPS_ENRICHMENT_DEFAULTS,
    GMAPS_MIN_RATING_OPTIONS,
    type GMAPS_ENRICHMENT,
} from '@aixellabs/backend/gmaps/filters';

// ─── Source type ────────────────────────────────────────────────────────────

export type FilterSource = LeadSource.GOOGLE_MAPS | LeadSource.LINKEDIN | LeadSource.INSTAGRAM;

/** Alias: Google Maps sheet filters share the API enrichment SSOT. */
export type GoogleMapsFilters = GMAPS_ENRICHMENT;

export const INSTAGRAM_ACCOUNT_TYPE = {
    ANY: 'ANY',
    BUSINESS: 'BUSINESS',
    PROFESSIONAL: 'PROFESSIONAL',
    JOINED_RECENTLY: 'JOINED_RECENTLY',
    PRIVATE: 'PRIVATE',
    VERIFIED: 'VERIFIED',
} as const;

export type InstagramAccountType = (typeof INSTAGRAM_ACCOUNT_TYPE)[keyof typeof INSTAGRAM_ACCOUNT_TYPE];

export type InstagramFilters = {
    accountFilter: InstagramAccountType;
    minFollowers?: number;
    maxFollowers?: number;
    minFollowing?: number;
    maxFollowing?: number;
    minPosts?: number;
    maxPosts?: number;
    requireEmail: boolean;
    requirePhone: boolean;
    requireWebsite: boolean;
};

export type LinkedInFilters = {
    industryContains: string;
    countryContains: string;
    companySizes: string[];
    minEmployees?: number;
    maxEmployees?: number;
    minFollowers?: number;
    maxFollowers?: number;
    requireHiring: boolean;
    requireWebsite: boolean;
    minFundingRounds?: number;
};

export type LeadFilterState = {
    sources: FilterSource[];
    googleMaps: GoogleMapsFilters;
    instagram: InstagramFilters;
    linkedin: LinkedInFilters;
};

// ─── Defaults ───────────────────────────────────────────────────────────────

export const LEAD_FILTER_DEFAULTS: LeadFilterState = {
    sources: [],
    googleMaps: { ...GMAPS_ENRICHMENT_DEFAULTS },
    instagram: {
        accountFilter: INSTAGRAM_ACCOUNT_TYPE.ANY,
        minFollowers: undefined,
        maxFollowers: undefined,
        minFollowing: undefined,
        maxFollowing: undefined,
        minPosts: undefined,
        maxPosts: undefined,
        requireEmail: false,
        requirePhone: false,
        requireWebsite: false,
    },
    linkedin: {
        industryContains: '',
        countryContains: '',
        companySizes: [],
        minEmployees: undefined,
        maxEmployees: undefined,
        minFollowers: undefined,
        maxFollowers: undefined,
        requireHiring: false,
        requireWebsite: false,
        minFundingRounds: undefined,
    },
};

// ─── Option arrays ─────────────────────────────────────────────────────────

export const GMAPS_MIN_RATING_SELECT_OPTIONS = GMAPS_MIN_RATING_OPTIONS.map((o) => ({
    value: String(o.value),
    label: o.label,
}));

export const INSTAGRAM_ACCOUNT_OPTIONS: { value: InstagramAccountType; label: string }[] = [
    { value: INSTAGRAM_ACCOUNT_TYPE.ANY, label: 'Any' },
    { value: INSTAGRAM_ACCOUNT_TYPE.BUSINESS, label: 'Business' },
    { value: INSTAGRAM_ACCOUNT_TYPE.PROFESSIONAL, label: 'Professional' },
    { value: INSTAGRAM_ACCOUNT_TYPE.JOINED_RECENTLY, label: 'Joined recently' },
    { value: INSTAGRAM_ACCOUNT_TYPE.PRIVATE, label: 'Private' },
    { value: INSTAGRAM_ACCOUNT_TYPE.VERIFIED, label: 'Verified' },
];

export const LINKEDIN_COMPANY_SIZE_OPTIONS: { value: string; label: string }[] = Object.values(
    LINKEDIN_COMPANY_SIZE_ENUM,
).map((v) => ({ value: v, label: v }));

// ─── Source metadata (public image assets) ───────────────────────────────────

export type SourceMeta = { label: string; imageSrc: string };

export const SOURCE_META: Record<FilterSource, SourceMeta> = {
    [LeadSource.GOOGLE_MAPS]: { label: 'Google Maps', imageSrc: '/google-maps.svg' },
    [LeadSource.LINKEDIN]: { label: 'LinkedIn', imageSrc: '/linkedin-logo-svg.png' },
    [LeadSource.INSTAGRAM]: { label: 'Instagram', imageSrc: '/instagram-logo.svg' },
};

export const FILTERABLE_SOURCES: FilterSource[] = [LeadSource.GOOGLE_MAPS, LeadSource.LINKEDIN, LeadSource.INSTAGRAM];

export const SOURCE_FILTER_OPTIONS: { value: FilterSource; label: string }[] = FILTERABLE_SOURCES.map((s) => ({
    value: s,
    label: SOURCE_META[s].label,
}));

/** When false, LinkedIn source + field controls are hidden in the sheet; matchers still apply LinkedIn filters from stored state. */
export const SHOW_LINKEDIN_FILTERS_UI = false;

/**
 * Migrate legacy sheet state (`minStarRatings: string[]`) to enrichment SSOT.
 * Safe to call on every read — already-new shapes pass through Zod defaults.
 */
export function migrateGoogleMapsFilters(raw: unknown): GoogleMapsFilters {
    if (typeof raw !== 'object' || raw === null) {
        return { ...GMAPS_ENRICHMENT_DEFAULTS };
    }

    const record = raw as Record<string, unknown>;

    if (Array.isArray(record.minStarRatings)) {
        const stars = (record.minStarRatings as unknown[])
            .map((s) => Number(s))
            .filter((n) => Number.isFinite(n) && n > 0);
        return {
            minRating: stars.length > 0 ? Math.min(...stars) : 0,
            minReviews: typeof record.minReviews === 'number' ? record.minReviews : 0,
            maxReviews: typeof record.maxReviews === 'number' ? record.maxReviews : null,
            requirePhone: record.requirePhone === true,
            requireWebsite: record.requireWebsite === true,
            categoryContains: typeof record.categoryContains === 'string' ? record.categoryContains : '',
        };
    }

    return {
        minRating: typeof record.minRating === 'number' ? record.minRating : 0,
        minReviews: typeof record.minReviews === 'number' ? record.minReviews : 0,
        maxReviews: typeof record.maxReviews === 'number' ? record.maxReviews : null,
        requirePhone: record.requirePhone === true,
        requireWebsite: record.requireWebsite === true,
        categoryContains: typeof record.categoryContains === 'string' ? record.categoryContains : '',
    };
}

export function normalizeLeadFilterState(state: LeadFilterState): LeadFilterState {
    return {
        ...state,
        googleMaps: migrateGoogleMapsFilters(state.googleMaps),
    };
}
