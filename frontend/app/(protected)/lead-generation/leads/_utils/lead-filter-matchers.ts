import type { GoogleMapsFilters, InstagramFilters, LinkedInFilters } from './lead-filter-constants';
import { INSTAGRAM_ACCOUNT_TYPE } from './lead-filter-constants';

type D = Record<string, unknown>;

// ─── Primitives ─────────────────────────────────────────────────────────────

export function nonEmpty(v: unknown): boolean {
    return typeof v === 'string' && v.trim().length > 0;
}

export function inRange(val: number | null, min?: number, max?: number): boolean {
    if (min === undefined && max === undefined) return true;
    if (val === null) return false;
    if (min !== undefined && val < min) return false;
    if (max !== undefined && val > max) return false;
    return true;
}

export function contains(haystack: unknown, needle: string): boolean {
    const t = needle.trim().toLowerCase();
    if (!t) return true;
    return typeof haystack === 'string' && haystack.toLowerCase().includes(t);
}

export function toNum(v: unknown): number | null {
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.trim()) {
        const n = parseFloat(v);
        return Number.isNaN(n) ? null : n;
    }
    return null;
}

// ─── Matchers ───────────────────────────────────────────────────────────────

export function matchGoogleMaps(data: unknown, f: GoogleMapsFilters): boolean {
    if (typeof data !== 'object' || data === null) return true;
    const d = data as D;

    if (f.requirePhone && !nonEmpty(d.phoneNumber) && !nonEmpty(d.phone)) return false;
    if (f.requireWebsite && !nonEmpty(d.website)) return false;

    const catText = Array.isArray(d.categories)
        ? (d.categories as unknown[]).filter((x): x is string => typeof x === 'string').join(' ')
        : '';
    if (!contains(catText, f.categoryContains)) return false;

    if (f.minStarRatings.length > 0) {
        const rating = toNum(d.rating ?? d.overAllRating);
        if (rating === null) return false;
        const meets = f.minStarRatings.some((s) => rating >= Number(s));
        if (!meets) return false;
    }

    if (!inRange(toNum(d.reviewCount ?? d.numberOfReviews), f.minReviews, f.maxReviews)) return false;

    return true;
}

export function matchLinkedIn(data: unknown, f: LinkedInFilters): boolean {
    if (typeof data !== 'object' || data === null) return true;
    const d = data as D;

    const isPeople = 'linkedin_url' in d;
    const loc = (isPeople ? d.location : d.address) as D | undefined;

    if (!contains(d.industry, f.industryContains)) return false;
    if (!contains(loc?.country ?? loc?.locality, f.countryContains)) return false;
    if (f.companySizes.length > 0) {
        const cs = typeof d.company_size === 'string' ? d.company_size : '';
        if (!f.companySizes.includes(cs)) return false;
    }
    if (!inRange(toNum(d.employee_count), f.minEmployees, f.maxEmployees)) return false;
    if (!inRange(toNum(isPeople ? d.follower_count : d.followers), f.minFollowers, f.maxFollowers)) return false;

    if (f.requireHiring && d.is_hiring !== true) return false;
    if (f.requireWebsite && !nonEmpty(d.website)) return false;

    if (f.minFundingRounds !== undefined) {
        const fi = isPeople ? (d.funding as D | undefined)?.total_rounds : (d.funding_info as D | undefined)?.total_rounds;
        const rounds = toNum(fi ?? null);
        if (rounds === null || rounds < f.minFundingRounds) return false;
    }

    return true;
}

export function matchInstagram(data: unknown, f: InstagramFilters): boolean {
    if (typeof data !== 'object' || data === null) return true;
    const d = data as D;

    if (!inRange(toNum(d.followers), f.minFollowers, f.maxFollowers)) return false;
    if (!inRange(toNum(d.following), f.minFollowing, f.maxFollowing)) return false;
    if (!inRange(toNum(d.posts), f.minPosts, f.maxPosts)) return false;

    switch (f.accountFilter) {
        case INSTAGRAM_ACCOUNT_TYPE.BUSINESS:
            if (d.isBusiness !== true) return false;
            break;
        case INSTAGRAM_ACCOUNT_TYPE.PROFESSIONAL:
            if (d.isProfessional !== true) return false;
            break;
        case INSTAGRAM_ACCOUNT_TYPE.JOINED_RECENTLY:
            if (d.isJoinedRecently !== true) return false;
            break;
        case INSTAGRAM_ACCOUNT_TYPE.PRIVATE:
            if (d.isPrivate !== true) return false;
            break;
        case INSTAGRAM_ACCOUNT_TYPE.VERIFIED:
            if (d.isVerified !== true) return false;
            break;
    }

    if (f.requireEmail && !nonEmpty(d.businessEmail)) return false;
    if (f.requirePhone) {
        const hasPhone =
            Array.isArray(d.businessPhoneNumber) &&
            d.businessPhoneNumber.some((x) => nonEmpty(x));
        if (!hasPhone) return false;
    }
    if (f.requireWebsite) {
        const has = Array.isArray(d.websites) && d.websites.some((x) => nonEmpty(x));
        if (!has) return false;
    }

    return true;
}
