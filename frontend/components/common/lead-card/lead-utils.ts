import type { GMAPS_INTERNAL_RESPONSE } from '@aixellabs/backend/gmaps/internal/types';

export type SortKey = 'rating' | 'reviews';
export type SortDirection = 'asc' | 'desc';

const extractNumericValue = (value: string | number | null, isRating: boolean): number => {
    if (!value) {
        return -1;
    }

    const stringValue = typeof value === 'number' ? String(value) : value;
    const normalized = stringValue.replace(/[^\d.]/g, '');

    if (!normalized || normalized === '') {
        return -1;
    }

    const numeric = isRating ? parseFloat(normalized) : parseInt(normalized, 10);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : -1;
};

export const sortLeads = (
    leads: GMAPS_INTERNAL_RESPONSE[],
    sortKey: SortKey,
    sortDirection: SortDirection,
): GMAPS_INTERNAL_RESPONSE[] => {
    const isRating = sortKey === 'rating';

    return [...leads].sort((a, b) => {
        const aValue = extractNumericValue(isRating ? a.rating : a.reviewCount, isRating);
        const bValue = extractNumericValue(isRating ? b.rating : b.reviewCount, isRating);

        if (aValue === -1 && bValue === -1) return 0;
        if (aValue === -1) return 1;
        if (bValue === -1) return -1;

        const comparison = aValue - bValue;
        return sortDirection === 'asc' ? comparison : -comparison;
    });
};

export const generateUniqueKey = (lead: GMAPS_INTERNAL_RESPONSE, index: number): string => {
    const baseKey = lead.gmapsUrl || `${lead.name}-${lead.phone ?? 'no-phone'}`;
    return `${baseKey}-${index}`;
};
