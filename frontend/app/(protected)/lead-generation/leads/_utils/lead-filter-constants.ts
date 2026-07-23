import { LeadSource } from '@aixellabs/backend/db/types';
import { LINKEDIN_COMPANY_SIZE_ENUM } from '@aixellabs/backend/linkedin/constants';
import {
    GMAPS_ENRICHMENT_DEFAULTS,
    GMAPS_MIN_RATING_OPTIONS,
    type GMAPS_ENRICHMENT,
} from '@aixellabs/backend/gmaps/filters';
import { LEAD_SORT_DEFAULTS, normalizeLeadSortState, type LeadSortState } from './lead-sort-constants';

// ─── Source type ────────────────────────────────────────────────────────────

export type FilterSource =
    | LeadSource.GOOGLE_MAPS
    | LeadSource.GOOGLE_MAPS_ADVANCED
    | LeadSource.GOOGLE_ADVANCED_SEARCH
    | LeadSource.LINKEDIN
    | LeadSource.INSTAGRAM
    | LeadSource.FACEBOOK;

/**
 * Tri-state presence filter for the leads sheet.
 * - `any` — no filter (bidirectional switch center; default)
 * - `has` — must have the field (switch right)
 * - `missing` — must not have the field (switch left)
 *
 * Legacy boolean `true` migrates to `has`; legacy `false` migrates to `any`
 * (old off meant “unset”, not “exclude”).
 */
export const TRI_STATE_FILTER = {
    ANY: 'any',
    HAS: 'has',
    MISSING: 'missing',
} as const;

export type TriStateFilter = (typeof TRI_STATE_FILTER)[keyof typeof TRI_STATE_FILTER];

export const TRI_STATE_FILTER_OPTIONS: { value: TriStateFilter; label: string }[] = [
    { value: TRI_STATE_FILTER.ANY, label: 'Default' },
    { value: TRI_STATE_FILTER.HAS, label: 'Yes' },
    { value: TRI_STATE_FILTER.MISSING, label: 'No' },
];

/** Google Maps sheet filters: enrichment SSOT + tri-state presence fields. */
export type GoogleMapsFilters = Omit<GMAPS_ENRICHMENT, 'requirePhone' | 'requireWebsite'> & {
    requirePhone: TriStateFilter;
    requireWebsite: TriStateFilter;
};

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
    requireEmail: TriStateFilter;
    requirePhone: TriStateFilter;
    requireWebsite: TriStateFilter;
};

export type FacebookFilters = {
    minFollowers?: number;
    maxFollowers?: number;
    minLikes?: number;
    maxLikes?: number;
    requireVerified: TriStateFilter;
    requireEmail: TriStateFilter;
    requirePhone: TriStateFilter;
    requireWebsite: TriStateFilter;
};

export type LinkedInFilters = {
    industryContains: string;
    countryContains: string;
    companySizes: string[];
    minEmployees?: number;
    maxEmployees?: number;
    minFollowers?: number;
    maxFollowers?: number;
    requireHiring: TriStateFilter;
    requireWebsite: TriStateFilter;
    minFundingRounds?: number;
};

export type LeadFilterState = {
    sources: FilterSource[];
    googleMaps: GoogleMapsFilters;
    instagram: InstagramFilters;
    facebook: FacebookFilters;
    linkedin: LinkedInFilters;
    sort: LeadSortState;
};

// ─── Defaults ───────────────────────────────────────────────────────────────

export const LEAD_FILTER_DEFAULTS: LeadFilterState = {
    sources: [],
    googleMaps: {
        ...GMAPS_ENRICHMENT_DEFAULTS,
        requirePhone: TRI_STATE_FILTER.ANY,
        requireWebsite: TRI_STATE_FILTER.ANY,
    },
    instagram: {
        accountFilter: INSTAGRAM_ACCOUNT_TYPE.ANY,
        minFollowers: undefined,
        maxFollowers: undefined,
        minFollowing: undefined,
        maxFollowing: undefined,
        minPosts: undefined,
        maxPosts: undefined,
        requireEmail: TRI_STATE_FILTER.ANY,
        requirePhone: TRI_STATE_FILTER.ANY,
        requireWebsite: TRI_STATE_FILTER.ANY,
    },
    facebook: {
        minFollowers: undefined,
        maxFollowers: undefined,
        minLikes: undefined,
        maxLikes: undefined,
        requireVerified: TRI_STATE_FILTER.ANY,
        requireEmail: TRI_STATE_FILTER.ANY,
        requirePhone: TRI_STATE_FILTER.ANY,
        requireWebsite: TRI_STATE_FILTER.ANY,
    },
    linkedin: {
        industryContains: '',
        countryContains: '',
        companySizes: [],
        minEmployees: undefined,
        maxEmployees: undefined,
        minFollowers: undefined,
        maxFollowers: undefined,
        requireHiring: TRI_STATE_FILTER.ANY,
        requireWebsite: TRI_STATE_FILTER.ANY,
        minFundingRounds: undefined,
    },
    sort: {
        googleMaps: { ...LEAD_SORT_DEFAULTS.googleMaps },
        instagram: { ...LEAD_SORT_DEFAULTS.instagram },
        facebook: { ...LEAD_SORT_DEFAULTS.facebook },
        linkedin: { ...LEAD_SORT_DEFAULTS.linkedin },
    },
};

/** Coerce legacy boolean / unknown stored values into TriStateFilter. */
export function migrateTriStateFilter(raw: unknown): TriStateFilter {
    if (raw === true || raw === TRI_STATE_FILTER.HAS) return TRI_STATE_FILTER.HAS;
    if (raw === TRI_STATE_FILTER.MISSING) return TRI_STATE_FILTER.MISSING;
    return TRI_STATE_FILTER.ANY;
}

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
    [LeadSource.GOOGLE_MAPS_ADVANCED]: {
        label: 'Google Maps Advanced',
        imageSrc: '/google-maps.svg',
    },
    [LeadSource.GOOGLE_ADVANCED_SEARCH]: {
        label: 'Google Advanced Search',
        imageSrc: '/google-logo.png',
    },
    [LeadSource.LINKEDIN]: { label: 'LinkedIn', imageSrc: '/linkedin-logo-svg.png' },
    [LeadSource.INSTAGRAM]: { label: 'Instagram', imageSrc: '/instagram-logo.svg' },
    [LeadSource.FACEBOOK]: { label: 'Facebook', imageSrc: '/facebook-logo.svg' },
};

export const FILTERABLE_SOURCES: FilterSource[] = [
    LeadSource.GOOGLE_MAPS,
    LeadSource.GOOGLE_MAPS_ADVANCED,
    LeadSource.GOOGLE_ADVANCED_SEARCH,
    LeadSource.LINKEDIN,
    LeadSource.INSTAGRAM,
    LeadSource.FACEBOOK,
];

export const SOURCE_FILTER_OPTIONS: { value: FilterSource; label: string }[] = FILTERABLE_SOURCES.map((s) => ({
    value: s,
    label: SOURCE_META[s].label,
}));

/** When false, LinkedIn source + field controls are hidden in the sheet; matchers still apply LinkedIn filters from stored state. */
export const SHOW_LINKEDIN_FILTERS_UI = false;

/**
 * Migrate legacy sheet state (`minStarRatings: string[]`) to enrichment SSOT.
 * Safe to call on every read — already-new shapes pass through.
 */
export function migrateGoogleMapsFilters(raw: unknown): GoogleMapsFilters {
    if (typeof raw !== 'object' || raw === null) {
        return { ...LEAD_FILTER_DEFAULTS.googleMaps };
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
            requirePhone: migrateTriStateFilter(record.requirePhone),
            requireWebsite: migrateTriStateFilter(record.requireWebsite),
            categoryContains: typeof record.categoryContains === 'string' ? record.categoryContains : '',
        };
    }

    return {
        minRating: typeof record.minRating === 'number' ? record.minRating : 0,
        minReviews: typeof record.minReviews === 'number' ? record.minReviews : 0,
        maxReviews: typeof record.maxReviews === 'number' ? record.maxReviews : null,
        requirePhone: migrateTriStateFilter(record.requirePhone),
        requireWebsite: migrateTriStateFilter(record.requireWebsite),
        categoryContains: typeof record.categoryContains === 'string' ? record.categoryContains : '',
    };
}

function migrateInstagramFilters(raw: unknown): InstagramFilters {
    if (typeof raw !== 'object' || raw === null) {
        return { ...LEAD_FILTER_DEFAULTS.instagram };
    }
    const record = raw as Record<string, unknown>;
    const base = { ...LEAD_FILTER_DEFAULTS.instagram, ...record } as InstagramFilters;
    return {
        ...base,
        requireEmail: migrateTriStateFilter(record.requireEmail),
        requirePhone: migrateTriStateFilter(record.requirePhone),
        requireWebsite: migrateTriStateFilter(record.requireWebsite),
    };
}

function migrateFacebookFilters(raw: unknown): FacebookFilters {
    if (typeof raw !== 'object' || raw === null) {
        return { ...LEAD_FILTER_DEFAULTS.facebook };
    }
    const record = raw as Record<string, unknown>;
    const base = { ...LEAD_FILTER_DEFAULTS.facebook, ...record } as FacebookFilters;
    return {
        ...base,
        requireVerified: migrateTriStateFilter(record.requireVerified),
        requireEmail: migrateTriStateFilter(record.requireEmail),
        requirePhone: migrateTriStateFilter(record.requirePhone),
        requireWebsite: migrateTriStateFilter(record.requireWebsite),
    };
}

function migrateLinkedInFilters(raw: unknown): LinkedInFilters {
    if (typeof raw !== 'object' || raw === null) {
        return { ...LEAD_FILTER_DEFAULTS.linkedin };
    }
    const record = raw as Record<string, unknown>;
    const base = { ...LEAD_FILTER_DEFAULTS.linkedin, ...record } as LinkedInFilters;
    return {
        ...base,
        requireHiring: migrateTriStateFilter(record.requireHiring),
        requireWebsite: migrateTriStateFilter(record.requireWebsite),
    };
}

export function normalizeLeadFilterState(state: LeadFilterState): LeadFilterState {
    return {
        ...state,
        googleMaps: migrateGoogleMapsFilters(state.googleMaps),
        instagram: migrateInstagramFilters(state.instagram),
        facebook: migrateFacebookFilters(state.facebook ?? LEAD_FILTER_DEFAULTS.facebook),
        linkedin: migrateLinkedInFilters(state.linkedin),
        sort: normalizeLeadSortState(state.sort),
    };
}
