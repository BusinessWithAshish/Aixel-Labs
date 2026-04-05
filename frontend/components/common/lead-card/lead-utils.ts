import type { GMAPS_INTERNAL_RESPONSE } from '@aixellabs/backend/gmaps/internal/types';
import type { INSTAGRAM_RESPONSE } from '@aixellabs/backend/instagram';

export type SortKey = 'rating' | 'reviews';
export type SortDirection = 'asc' | 'desc';

export type InstagramSortKey = 'fullName' | 'followers' | 'following' | 'posts';

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

const instagramSortLabel = (name: string | null | undefined): string | null => {
    const t = (name ?? '').trim();
    return t === '' ? null : t.toLowerCase();
};

export const sortInstagramLeads = (
    leads: INSTAGRAM_RESPONSE[],
    sortKey: InstagramSortKey,
    sortDirection: SortDirection,
): INSTAGRAM_RESPONSE[] => {
    return [...leads].sort((a, b) => {
        if (sortKey === 'fullName') {
            const aLabel = instagramSortLabel(a.fullName);
            const bLabel = instagramSortLabel(b.fullName);
            if (aLabel == null && bLabel == null) return 0;
            if (aLabel == null) return 1;
            if (bLabel == null) return -1;
            const cmp = aLabel.localeCompare(bLabel);
            return sortDirection === 'asc' ? cmp : -cmp;
        }

        const key = sortKey;
        const getNum = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? -1 : v);

        const aValue = getNum(a[key]);
        const bValue = getNum(b[key]);

        if (aValue === -1 && bValue === -1) return 0;
        if (aValue === -1) return 1;
        if (bValue === -1) return -1;

        const comparison = aValue - bValue;
        return sortDirection === 'asc' ? comparison : -comparison;
    });
};

export const generateInstagramUniqueKey = (lead: INSTAGRAM_RESPONSE, index: number): string => {
    const base = lead.id ?? lead.username ?? 'unknown';
    return `${base}-${index}`;
};
