import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common/apis';

export type SortKey = 'rating' | 'reviews';
export type SortDirection = 'asc' | 'desc';

export type LeadCategory = 'hotLeads' | 'warmLeads' | 'coldLeads';

export type CategorizedLeads = {
    all: GMAPS_SCRAPE_LEAD_INFO[];
    hotLeads: GMAPS_SCRAPE_LEAD_INFO[];
    warmLeads: GMAPS_SCRAPE_LEAD_INFO[];
    coldLeads: GMAPS_SCRAPE_LEAD_INFO[];
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
    sortDirection: SortDirection
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

const isSocialMediaUrl = (url: string): boolean => {
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

const hasWebsite = (lead: GMAPS_SCRAPE_LEAD_INFO): boolean => {
    const website = lead.website?.trim();
    if (!website) {
        return false;
    }
    return !isSocialMediaUrl(website);
};

const hasSocialMedia = (lead: GMAPS_SCRAPE_LEAD_INFO): boolean => {
    const website = lead.website?.trim();
    if (!website) {
        return false;
    }
    return isSocialMediaUrl(website);
};

const hasPhone = (lead: GMAPS_SCRAPE_LEAD_INFO): boolean => {
    const phoneNumber = lead.phoneNumber?.trim();
    return !!phoneNumber;
};

export const categorizeLeads = (leads: GMAPS_SCRAPE_LEAD_INFO[]): CategorizedLeads => {
    return {
        all: leads,
        hotLeads: leads.filter((lead) => {
            const hasProperWebsite = hasWebsite(lead);
            const hasSocialMediaProfile = hasSocialMedia(lead);
            const hasPhoneNumber = hasPhone(lead);

            return (!hasProperWebsite && hasPhoneNumber) || (hasSocialMediaProfile && hasPhoneNumber);
        }),
        warmLeads: leads.filter((lead) => {
            const hasProperWebsite = hasWebsite(lead);
            return hasProperWebsite;
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

export const generateUniqueKey = (lead: GMAPS_SCRAPE_LEAD_INFO, index: number): string => {
    const baseKey = lead.gmapsUrl || `${lead.name}-${lead.phoneNumber || 'no-phone'}-${lead.website || 'no-website'}`;
    return `${baseKey}-${index}`;
};
