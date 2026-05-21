import { LeadSource } from '@aixellabs/backend/db/types';
import { LINKEDIN_COMPANY_SIZE_ENUM } from '@aixellabs/backend/linkedin/constants';

// ─── Source type ────────────────────────────────────────────────────────────

export type FilterSource = LeadSource.GOOGLE_MAPS | LeadSource.LINKEDIN | LeadSource.INSTAGRAM;

// ─── Per-source filter shapes ───────────────────────────────────────────────

export type GoogleMapsFilters = {
    minStarRatings: string[];
    minReviews?: number;
    maxReviews?: number;
    requirePhone: boolean;
    requireWebsite: boolean;
    categoryContains: string;
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
    googleMaps: {
        minStarRatings: [],
        minReviews: undefined,
        maxReviews: undefined,
        requirePhone: false,
        requireWebsite: false,
        categoryContains: '',
    },
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

export const STAR_RATING_OPTIONS = [
    { value: '1', label: '⭐ 1+' },
    { value: '2', label: '⭐ 2+' },
    { value: '3', label: '⭐ 3+' },
    { value: '4', label: '⭐ 4+' },
    { value: '5', label: '⭐ 5' },
] as const;

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
