import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common/apis';

export type SortKey = 'rating' | 'reviews';
export type SortDirection = 'asc' | 'desc';

export enum LeadCategory {
    ALL = 'All',
    HOT = 'Hot Leads',
    WARM = 'Warm Leads',
    COLD = 'Cold Leads',
}

export type CategorizedLeads = {
    [LeadCategory.ALL]: GMAPS_SCRAPE_LEAD_INFO[];
    [LeadCategory.HOT]: GMAPS_SCRAPE_LEAD_INFO[];
    [LeadCategory.WARM]: GMAPS_SCRAPE_LEAD_INFO[];
    [LeadCategory.COLD]: GMAPS_SCRAPE_LEAD_INFO[];
};

export type LeadType = {
    badgeColor: string;
    color: string;
    category: LeadCategory;
};

const extractNumericValue = (value: string | null, isRating: boolean): number => {
    if (!value) {
        return -1;
    }

    const stringValue = String(value);
    const normalized = stringValue.replace(/[^\d.]/g, '');

    if (!normalized || normalized === '') {
        return -1;
    }

    const numeric = isRating ? parseFloat(normalized) : parseInt(normalized, 10);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : -1;
};

export const sortLeads = (
    leads: GMAPS_SCRAPE_LEAD_INFO[],
    sortKey: SortKey,
    sortDirection: SortDirection,
): GMAPS_SCRAPE_LEAD_INFO[] => {
    const isRating = sortKey === 'rating';

    return [...leads].sort((a, b) => {
        const aValue = extractNumericValue(isRating ? a.overAllRating : a.numberOfReviews, isRating);
        const bValue = extractNumericValue(isRating ? b.overAllRating : b.numberOfReviews, isRating);

        if (aValue === -1 && bValue === -1) return 0;
        if (aValue === -1) return 1;
        if (bValue === -1) return -1;

        const comparison = aValue - bValue;
        return sortDirection === 'asc' ? comparison : -comparison;
    });
};

/**
 * Checks if a URL is a social media platform URL
 */
export const isSocialMediaUrl = (url: string): boolean => {
    if (!url || url.trim() === '') {
        return false;
    }

    const socialMediaDomains = [
        'instagram.com',
        'facebook.com',
        'fb.com',
        'twitter.com',
        'x.com',
        'linkedin.com',
        'tiktok.com',
        'youtube.com',
        'youtu.be',
        'pinterest.com',
        'snapchat.com',
    ];

    try {
        const urlLower = url.toLowerCase();
        return socialMediaDomains.some((domain) => urlLower.includes(domain));
    } catch {
        return false;
    }
};

/**
 * Checks if a lead has a proper website (not social media)
 */
export const hasWebsite = (lead: GMAPS_SCRAPE_LEAD_INFO): boolean => {
    const website = lead.website?.trim();
    return !!website;
};

/**
 * Checks if a lead has a social media profile as their website
 */
export const hasSocialMedia = (lead: GMAPS_SCRAPE_LEAD_INFO): boolean => {
    const website = lead.website?.trim();
    if (!website) {
        return false;
    }
    return isSocialMediaUrl(website);
};

/**
 * Checks if a lead has a phone number
 */
export const hasPhone = (lead: GMAPS_SCRAPE_LEAD_INFO): boolean => {
    const phoneNumber = lead.phoneNumber?.trim();
    return !!phoneNumber;
};

/**
 * Determines the lead type (Hot, Warm, or Cold) based on their contact information
 */
export const getLeadType = (lead: GMAPS_SCRAPE_LEAD_INFO): LeadType => {
    const hasProperWebsite = hasWebsite(lead);
    const hasSocialMediaProfile = hasSocialMedia(lead);
    const hasPhoneNumber = hasPhone(lead);

    // Hot Lead: No website but has a phone
    if (!hasProperWebsite && hasPhoneNumber) {
        return {
            color: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-700/80',
            badgeColor: 'bg-green-50 dark:bg-green-950/30 dark:text-green-200 border-green-200 text-green-950',
            category: LeadCategory.HOT,
        };
    }

    // Warm Lead: Has a proper website
    if (hasProperWebsite || hasSocialMediaProfile) {
        return {
            color: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-700/80',
            badgeColor: 'bg-amber-50 dark:bg-amber-950/30 dark:text-amber-200 border-amber-200 text-amber-950',
            category: LeadCategory.WARM,
        };
    }

    // Cold Lead: Everything else (no website, no social media, no phone OR social media but no phone)
    return {
        color: 'bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-700/80',
        badgeColor: 'bg-slate-50 dark:bg-slate-950/30 dark:text-slate-200 border-slate-200 text-slate-950',
        category: LeadCategory.COLD,
    };
};

/**
 * Categorizes leads into hot, warm, and cold categories
 */
export const categorizeLeads = (leads: GMAPS_SCRAPE_LEAD_INFO[]): CategorizedLeads => {
    return {
        [LeadCategory.ALL]: leads,
        [LeadCategory.HOT]: leads.filter((lead) => {
            return !hasWebsite(lead) && hasPhone(lead);
        }),
        [LeadCategory.WARM]: leads.filter((lead) => {
            return hasWebsite(lead) || hasSocialMedia(lead);
        }),
        [LeadCategory.COLD]: leads.filter((lead) => {
            const hasProperWebsite = hasWebsite(lead);
            const hasSocialMediaProfile = hasSocialMedia(lead);
            const hasPhoneNumber = hasPhone(lead);

            return (
                (!hasProperWebsite && !hasSocialMediaProfile && !hasPhoneNumber) ||
                (hasSocialMediaProfile && !hasPhoneNumber)
            );
        }),
    };
};

/**
 * Generates a unique key for a lead based on its properties
 */
export const generateUniqueKey = (lead: GMAPS_SCRAPE_LEAD_INFO, index: number): string => {
    const baseKey = lead.gmapsUrl || `${lead.name}-${lead.phoneNumber || 'no-phone'}-${lead.website || 'no-website'}`;
    return `${baseKey}-${index}`;
};
