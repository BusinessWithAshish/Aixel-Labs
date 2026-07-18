// ─── Direction ──────────────────────────────────────────────────────────────

export const SORT_DIRECTION = {
    ASC: 'asc',
    DESC: 'desc',
} as const;

export type SortDirection = (typeof SORT_DIRECTION)[keyof typeof SORT_DIRECTION];

export const SORT_DIRECTION_OPTIONS: { value: SortDirection; label: string }[] = [
    { value: SORT_DIRECTION.DESC, label: 'High to low' },
    { value: SORT_DIRECTION.ASC, label: 'Low to high' },
];

const TEXT_SORT_FIELDS = new Set<string>(['name', 'username']);

export function isTextSortField(by: string): boolean {
    return TEXT_SORT_FIELDS.has(by);
}

export function sortDirectionOptions(by: string): { value: SortDirection; label: string }[] {
    if (isTextSortField(by)) {
        return [
            { value: SORT_DIRECTION.ASC, label: 'A to Z' },
            { value: SORT_DIRECTION.DESC, label: 'Z to A' },
        ];
    }
    return SORT_DIRECTION_OPTIONS;
}

export function defaultDirectionForSortBy(by: string): SortDirection {
    return isTextSortField(by) ? SORT_DIRECTION.ASC : SORT_DIRECTION.DESC;
}

/** Sentinel for “no sort” — must not be `""` (Radix Select forbids empty item values). */
export const SORT_BY_NONE = 'none' as const;

// ─── Per-source fields ──────────────────────────────────────────────────────

export const GMAPS_SORT_BY = {
    RATING: 'rating',
    REVIEW_COUNT: 'reviewCount',
    NAME: 'name',
} as const;

export type GmapsSortBy = (typeof GMAPS_SORT_BY)[keyof typeof GMAPS_SORT_BY];

export const INSTAGRAM_SORT_BY = {
    FOLLOWERS: 'followers',
    FOLLOWING: 'following',
    POSTS: 'posts',
    USERNAME: 'username',
} as const;

export type InstagramSortBy = (typeof INSTAGRAM_SORT_BY)[keyof typeof INSTAGRAM_SORT_BY];

export const LINKEDIN_SORT_BY = {
    EMPLOYEES: 'employee_count',
    FOLLOWERS: 'followers',
    NAME: 'name',
} as const;

export type LinkedInSortBy = (typeof LINKEDIN_SORT_BY)[keyof typeof LINKEDIN_SORT_BY];

export type SourceSortConfig<T extends string> = {
    by: T | typeof SORT_BY_NONE;
    direction: SortDirection;
};

export type LeadSortState = {
    googleMaps: SourceSortConfig<GmapsSortBy>;
    instagram: SourceSortConfig<InstagramSortBy>;
    linkedin: SourceSortConfig<LinkedInSortBy>;
};

export const LEAD_SORT_DEFAULTS: LeadSortState = {
    googleMaps: { by: SORT_BY_NONE, direction: SORT_DIRECTION.DESC },
    instagram: { by: SORT_BY_NONE, direction: SORT_DIRECTION.DESC },
    linkedin: { by: SORT_BY_NONE, direction: SORT_DIRECTION.DESC },
};

// ─── Select options ─────────────────────────────────────────────────────────

export const GMAPS_SORT_OPTIONS: { value: GmapsSortBy | typeof SORT_BY_NONE; label: string }[] = [
    { value: SORT_BY_NONE, label: 'Default' },
    { value: GMAPS_SORT_BY.RATING, label: 'Rating' },
    { value: GMAPS_SORT_BY.REVIEW_COUNT, label: 'Review count' },
    { value: GMAPS_SORT_BY.NAME, label: 'Name' },
];

export const INSTAGRAM_SORT_OPTIONS: { value: InstagramSortBy | typeof SORT_BY_NONE; label: string }[] = [
    { value: SORT_BY_NONE, label: 'Default' },
    { value: INSTAGRAM_SORT_BY.FOLLOWERS, label: 'Followers' },
    { value: INSTAGRAM_SORT_BY.FOLLOWING, label: 'Following' },
    { value: INSTAGRAM_SORT_BY.POSTS, label: 'Posts' },
    { value: INSTAGRAM_SORT_BY.USERNAME, label: 'Username' },
];

export const LINKEDIN_SORT_OPTIONS: { value: LinkedInSortBy | typeof SORT_BY_NONE; label: string }[] = [
    { value: SORT_BY_NONE, label: 'Default' },
    { value: LINKEDIN_SORT_BY.EMPLOYEES, label: 'Employees' },
    { value: LINKEDIN_SORT_BY.FOLLOWERS, label: 'Followers' },
    { value: LINKEDIN_SORT_BY.NAME, label: 'Name' },
];

/**
 * Tie-breakers after the primary field (same direction for numbers; name/username last as A→Z).
 * Final fallback is always `sourceId` in the sorter.
 */
export const GMAPS_SORT_CHAIN: Record<GmapsSortBy, GmapsSortBy[]> = {
    [GMAPS_SORT_BY.RATING]: [GMAPS_SORT_BY.REVIEW_COUNT, GMAPS_SORT_BY.NAME],
    [GMAPS_SORT_BY.REVIEW_COUNT]: [GMAPS_SORT_BY.RATING, GMAPS_SORT_BY.NAME],
    [GMAPS_SORT_BY.NAME]: [GMAPS_SORT_BY.RATING, GMAPS_SORT_BY.REVIEW_COUNT],
};

export const INSTAGRAM_SORT_CHAIN: Record<InstagramSortBy, InstagramSortBy[]> = {
    [INSTAGRAM_SORT_BY.FOLLOWERS]: [INSTAGRAM_SORT_BY.POSTS, INSTAGRAM_SORT_BY.USERNAME],
    [INSTAGRAM_SORT_BY.FOLLOWING]: [INSTAGRAM_SORT_BY.FOLLOWERS, INSTAGRAM_SORT_BY.USERNAME],
    [INSTAGRAM_SORT_BY.POSTS]: [INSTAGRAM_SORT_BY.FOLLOWERS, INSTAGRAM_SORT_BY.USERNAME],
    [INSTAGRAM_SORT_BY.USERNAME]: [INSTAGRAM_SORT_BY.FOLLOWERS],
};

export const LINKEDIN_SORT_CHAIN: Record<LinkedInSortBy, LinkedInSortBy[]> = {
    [LINKEDIN_SORT_BY.EMPLOYEES]: [LINKEDIN_SORT_BY.FOLLOWERS, LINKEDIN_SORT_BY.NAME],
    [LINKEDIN_SORT_BY.FOLLOWERS]: [LINKEDIN_SORT_BY.EMPLOYEES, LINKEDIN_SORT_BY.NAME],
    [LINKEDIN_SORT_BY.NAME]: [LINKEDIN_SORT_BY.EMPLOYEES, LINKEDIN_SORT_BY.FOLLOWERS],
};

/** Fill missing/legacy sort shape from stored filter state. */
export function normalizeLeadSortState(raw: unknown): LeadSortState {
    if (typeof raw !== 'object' || raw === null) return { ...LEAD_SORT_DEFAULTS };

    const r = raw as Partial<LeadSortState>;
    return {
        googleMaps: normalizeSourceSort(r.googleMaps, GMAPS_SORT_OPTIONS.map((o) => o.value)),
        instagram: normalizeSourceSort(r.instagram, INSTAGRAM_SORT_OPTIONS.map((o) => o.value)),
        linkedin: normalizeSourceSort(r.linkedin, LINKEDIN_SORT_OPTIONS.map((o) => o.value)),
    };
}

function normalizeSourceSort<T extends string>(
    raw: unknown,
    allowed: readonly (T | typeof SORT_BY_NONE)[],
): SourceSortConfig<T> {
    if (typeof raw !== 'object' || raw === null) {
        return { by: SORT_BY_NONE, direction: SORT_DIRECTION.DESC };
    }
    const rec = raw as Record<string, unknown>;
    // Legacy used `""` for none; Radix forbids empty Select item values so we now use `none`.
    const rawBy = rec.by === '' ? SORT_BY_NONE : rec.by;
    const by = typeof rawBy === 'string' && (allowed as readonly string[]).includes(rawBy)
        ? (rawBy as T | typeof SORT_BY_NONE)
        : SORT_BY_NONE;
    const direction =
        rec.direction === SORT_DIRECTION.ASC || rec.direction === SORT_DIRECTION.DESC
            ? rec.direction
            : SORT_DIRECTION.DESC;
    return { by, direction };
}
