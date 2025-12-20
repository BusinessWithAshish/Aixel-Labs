import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common/apis';

export type SortKey = 'rating' | 'reviews';
export type SortDirection = 'asc' | 'desc';

export type CategorizedLeads = {
    all: GMAPS_SCRAPE_LEAD_INFO[];
    hotLeads: GMAPS_SCRAPE_LEAD_INFO[];
    warmLeads: GMAPS_SCRAPE_LEAD_INFO[];
    coldLeads: GMAPS_SCRAPE_LEAD_INFO[];
};

export type LeadType = {
    type: 'Hot Lead' | 'Warm Lead' | 'Cold Lead' | 'Unknown';
    color: string;
    category: 'hotLeads' | 'warmLeads' | 'coldLeads';
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
            type: 'Hot Lead',
            color: 'bg-green-50 border-green-200',
            category: 'hotLeads',
        };
    }

    // Warm Lead: Has a proper website
    if (hasProperWebsite || hasSocialMediaProfile) {
        return {
            type: 'Warm Lead',
            color: 'bg-amber-50 border-amber-200',
            category: 'warmLeads',
        };
    }

    // Cold Lead: Everything else (no website, no social media, no phone OR social media but no phone)
    return {
        type: 'Cold Lead',
        color: 'bg-gray-50 border-gray-200',
        category: 'coldLeads',
    };
};

/**
 * Categorizes leads into hot, warm, and cold categories
 */
export const categorizeLeads = (leads: GMAPS_SCRAPE_LEAD_INFO[]): CategorizedLeads => {
    return {
        all: leads,
        hotLeads: leads.filter((lead) => {
            return !hasWebsite(lead) && hasPhone(lead);
        }),
        warmLeads: leads.filter((lead) => {
            return hasWebsite(lead) || hasSocialMedia(lead);
        }),
        coldLeads: leads.filter((lead) => {
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
