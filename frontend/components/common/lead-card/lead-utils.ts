import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common/apis';

export type SortKey = 'rating' | 'reviews';
export type SortDirection = 'asc' | 'desc';

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

export const hasWebsite = (lead: GMAPS_SCRAPE_LEAD_INFO): boolean => {
    const website = lead.website?.trim();
    return !!website;
};

export const hasPhone = (lead: GMAPS_SCRAPE_LEAD_INFO): boolean => {
    const phoneNumber = lead.phoneNumber?.trim();
    return !!phoneNumber;
};

export const generateUniqueKey = (lead: GMAPS_SCRAPE_LEAD_INFO, index: number): string => {
    const baseKey = lead.gmapsUrl || `${lead.name}-${lead.phoneNumber || 'no-phone'}-${lead.website || 'no-website'}`;
    return `${baseKey}-${index}`;
};
