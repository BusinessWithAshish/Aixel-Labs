import type {
    FacebookFilters,
    GoogleMapsFilters,
    InstagramFilters,
    LinkedInFilters,
    TriStateFilter,
} from './lead-filter-constants';
import { INSTAGRAM_ACCOUNT_TYPE, TRI_STATE_FILTER } from './lead-filter-constants';
import { matchGmapsPlace, toGmapsPlace } from '@aixellabs/backend/gmaps/filters';

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

/** Apply tri-state presence: any → pass; has → must be present; missing → must be absent. */
export function matchesTriState(hasValue: boolean, filter: TriStateFilter): boolean {
    if (filter === TRI_STATE_FILTER.HAS) return hasValue;
    if (filter === TRI_STATE_FILTER.MISSING) return !hasValue;
    return true;
}

// ─── Matchers (Instagram / LinkedIn stay FE-local; Google Maps uses backend SSOT) ─

export function matchGoogleMaps(data: unknown, f: GoogleMapsFilters): boolean {
    const place = toGmapsPlace(data);
    if (!matchesTriState(nonEmpty(place.phone), f.requirePhone)) return false;
    if (!matchesTriState(nonEmpty(place.website), f.requireWebsite)) return false;

    // Backend matcher still uses boolean require*; force inactive so presence is owned here.
    return matchGmapsPlace(place, {
        ...f,
        requirePhone: false,
        requireWebsite: false,
    });
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

    if (!matchesTriState(d.is_hiring === true, f.requireHiring)) return false;
    if (!matchesTriState(nonEmpty(d.website), f.requireWebsite)) return false;

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

    const hasEmail = nonEmpty(d.businessEmail);
    const hasPhone =
        Array.isArray(d.businessPhoneNumber) &&
        d.businessPhoneNumber.some((x) => nonEmpty(x));
    const hasWebsite = Array.isArray(d.websites) && d.websites.some((x) => nonEmpty(x));

    if (!matchesTriState(hasEmail, f.requireEmail)) return false;
    if (!matchesTriState(hasPhone, f.requirePhone)) return false;
    if (!matchesTriState(hasWebsite, f.requireWebsite)) return false;

    return true;
}

export function matchFacebook(data: unknown, f: FacebookFilters): boolean {
    if (typeof data !== 'object' || data === null) return true;
    const d = data as D;

    if (!inRange(toNum(d.followers), f.minFollowers, f.maxFollowers)) return false;
    if (!inRange(toNum(d.likes), f.minLikes, f.maxLikes)) return false;

    if (!matchesTriState(d.verified === true, f.requireVerified)) return false;

    const hasEmail =
        Array.isArray(d.emails) && d.emails.some((x) => nonEmpty(x));
    const hasPhone = nonEmpty(d.phone);
    const hasWebsite = nonEmpty(d.website);

    if (!matchesTriState(hasEmail, f.requireEmail)) return false;
    if (!matchesTriState(hasPhone, f.requirePhone)) return false;
    if (!matchesTriState(hasWebsite, f.requireWebsite)) return false;

    return true;
}
