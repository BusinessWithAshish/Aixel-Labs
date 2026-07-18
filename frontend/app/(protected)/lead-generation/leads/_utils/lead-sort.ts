import { LeadSource, type Lead } from '@aixellabs/backend/db/types';
import { toNum } from './lead-filter-matchers';
import {
    GMAPS_SORT_BY,
    GMAPS_SORT_CHAIN,
    INSTAGRAM_SORT_BY,
    INSTAGRAM_SORT_CHAIN,
    LINKEDIN_SORT_BY,
    LINKEDIN_SORT_CHAIN,
    SORT_BY_NONE,
    SORT_DIRECTION,
    isTextSortField,
    type GmapsSortBy,
    type InstagramSortBy,
    type LeadSortState,
    type LinkedInSortBy,
    type SortDirection,
} from './lead-sort-constants';

type D = Record<string, unknown>;

function asData(data: unknown): D {
    return typeof data === 'object' && data !== null ? (data as D) : {};
}

function textValue(v: unknown): string | null {
    return typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null;
}

function linkedInFollowers(d: D): number | null {
    if ('linkedin_url' in d) return toNum(d.follower_count);
    return toNum(d.followers);
}

function fieldValue(lead: Lead, field: string): number | string | null {
    const d = asData(lead.data);

    switch (lead.source) {
        case LeadSource.GOOGLE_MAPS:
            if (field === GMAPS_SORT_BY.RATING) return toNum(d.rating);
            if (field === GMAPS_SORT_BY.REVIEW_COUNT) return toNum(d.reviewCount);
            if (field === GMAPS_SORT_BY.NAME) return textValue(d.name);
            break;
        case LeadSource.INSTAGRAM:
            if (field === INSTAGRAM_SORT_BY.FOLLOWERS) return toNum(d.followers);
            if (field === INSTAGRAM_SORT_BY.FOLLOWING) return toNum(d.following);
            if (field === INSTAGRAM_SORT_BY.POSTS) return toNum(d.posts);
            if (field === INSTAGRAM_SORT_BY.USERNAME) return textValue(d.username) ?? textValue(d.fullName);
            break;
        case LeadSource.LINKEDIN:
            if (field === LINKEDIN_SORT_BY.EMPLOYEES) return toNum(d.employee_count);
            if (field === LINKEDIN_SORT_BY.FOLLOWERS) return linkedInFollowers(d);
            if (field === LINKEDIN_SORT_BY.NAME) return textValue(d.name) ?? textValue(d.full_name);
            break;
    }

    return null;
}

/** Nulls always sort last regardless of direction. */
function compareNullable(
    a: number | string | null,
    b: number | string | null,
    direction: SortDirection,
): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;

    const cmp = a < b ? -1 : a > b ? 1 : 0;
    return direction === SORT_DIRECTION.ASC ? cmp : -cmp;
}

function directionForField(field: string, primary: string, primaryDir: SortDirection): SortDirection {
    if (field === primary) return primaryDir;
    // Tie-breakers: text A→Z; metrics follow primary direction.
    return isTextSortField(field) ? SORT_DIRECTION.ASC : primaryDir;
}

function compareByChain(
    a: Lead,
    b: Lead,
    primary: string,
    chain: string[],
    direction: SortDirection,
): number {
    for (const field of [primary, ...chain]) {
        const cmp = compareNullable(
            fieldValue(a, field),
            fieldValue(b, field),
            directionForField(field, primary, direction),
        );
        if (cmp !== 0) return cmp;
    }
    return a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0;
}

function compareSameSource(a: Lead, b: Lead, sort: LeadSortState): number {
    switch (a.source) {
        case LeadSource.GOOGLE_MAPS: {
            const { by, direction } = sort.googleMaps;
            if (by === SORT_BY_NONE) return 0;
            return compareByChain(a, b, by, GMAPS_SORT_CHAIN[by as GmapsSortBy], direction);
        }
        case LeadSource.INSTAGRAM: {
            const { by, direction } = sort.instagram;
            if (by === SORT_BY_NONE) return 0;
            return compareByChain(a, b, by, INSTAGRAM_SORT_CHAIN[by as InstagramSortBy], direction);
        }
        case LeadSource.LINKEDIN: {
            const { by, direction } = sort.linkedin;
            if (by === SORT_BY_NONE) return 0;
            return compareByChain(a, b, by, LINKEDIN_SORT_CHAIN[by as LinkedInSortBy], direction);
        }
        default:
            return 0;
    }
}

/** Stable within mixed sources: only reorders leads that share a source with an active sort. */
export function sortLeads(leads: Lead[], sort: LeadSortState): Lead[] {
    return [...leads].sort((a, b) => {
        if (a.source !== b.source) return 0;
        return compareSameSource(a, b, sort);
    });
}
