import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';

/** Credits charged per returned lead item for each lead-gen submodule. */
export const CREDIT_COST_PER_ITEM: Partial<Record<LEAD_GENERATION_SUB_MODULES, number>> = {
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS]: 1,
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS_ADVANCED]: 1,
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH]: 1,
    [LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH]: 1,
    [LEAD_GENERATION_SUB_MODULES.FACEBOOK]: 1,
    [LEAD_GENERATION_SUB_MODULES.LINKEDIN]: 1,
    [LEAD_GENERATION_SUB_MODULES.CRAWL]: 1,
};

export type UserCreditsState = {
    credits: number;
    /** What can be spent right now: the balance, or less when today's cap is nearer. */
    spendable: number;
    /** Left of `DAILY_LEAD_CAP` today. Absent for exempt users. */
    dailyRemaining?: number;
    /** Admins are outside the credits system. */
    exempt: boolean;
    /** When the balance is next topped back up to `MONTHLY_FREE_CREDITS`. Absent for exempt users. */
    refillsAt?: Date;
};

/** Balance tone thresholds (inclusive upper bounds for warn/critical). */
export const CREDITS_WARN_THRESHOLD = 20;
export const CREDITS_CRITICAL_THRESHOLD = 10;

export type CreditsTone = 'ok' | 'warn' | 'critical';

export function getCreditsTone(credits: number): CreditsTone {
    if (credits <= CREDITS_CRITICAL_THRESHOLD) return 'critical';
    if (credits <= CREDITS_WARN_THRESHOLD) return 'warn';
    return 'ok';
}

/** Maps balance to existing Badge variants (`green` / `yellow` / `red`). */
export function creditsBadgeVariant(credits: number): 'green' | 'yellow' | 'red' {
    switch (getCreditsTone(credits)) {
        case 'critical':
            return 'red';
        case 'warn':
            return 'yellow';
        default:
            return 'green';
    }
}

/** Tailwind text color for standalone credit numbers (e.g. account settings). */
export function creditsToneClassName(credits: number): string {
    switch (getCreditsTone(credits)) {
        case 'critical':
            return 'text-destructive';
        case 'warn':
            return 'text-amber-600 dark:text-amber-500';
        default:
            return 'text-emerald-600 dark:text-emerald-500';
    }
}

/** Free credits every member's balance is topped back up to each refill period: 5,000 leads a month. */
export const MONTHLY_FREE_CREDITS = 5_000;

/**
 * How often a member's balance is topped back up to `MONTHLY_FREE_CREDITS`.
 * A refill never lowers a balance, so credits from a coupon or an admin
 * survive it.
 */
export const CREDITS_REFILL_PERIOD_DAYS = 30;

const CREDITS_REFILL_PERIOD_MS = CREDITS_REFILL_PERIOD_DAYS * 24 * 60 * 60 * 1000;

/**
 * Most credits one member can spend in a day, coupon credits included, so a month's allowance
 * cannot all land on the backend at once. Two default Maps searches (200 leads each) and some left over.
 */
export const DAILY_LEAD_CAP = 500;

const INDIA_UTC_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The day a spend counts towards, as `YYYY-MM-DD` in India time. */
export function creditsDayKey(now: Date = new Date()): string {
    return new Date(now.getTime() + INDIA_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** Shown when a run is refused because today's cap is used up. */
export const DAILY_LIMIT_MESSAGE = `You've reached today's limit of ${DAILY_LEAD_CAP} leads. It resets at midnight India time.`;

/** Shown when a run is refused because the balance is empty. */
export const NO_CREDITS_MESSAGE = `No credits left. Your free credits refill to ${MONTHLY_FREE_CREDITS.toLocaleString('en-US')} every ${CREDITS_REFILL_PERIOD_DAYS} days.`;

/** When a balance last refilled at `refilledAt` is topped up next. */
export function getNextCreditsRefillAt(refilledAt: Date): Date {
    return new Date(new Date(refilledAt).getTime() + CREDITS_REFILL_PERIOD_MS);
}

/** True when a balance last refilled at `refilledAt` (never, when absent) is due again at `now`. */
export function isCreditsRefillDue(refilledAt: Date | null | undefined, now: Date = new Date()): boolean {
    if (!refilledAt) return true;
    return now.getTime() >= getNextCreditsRefillAt(refilledAt).getTime();
}

/** Upper bound for manually assigned user credit balances. */
export const MAX_USER_CREDITS = 100_000;

export function normalizeCredits(value: number | null | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return 0;
    }
    return Math.floor(value);
}

export function parseCreditsInput(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
        throw new Error('Credits must be a non-negative integer');
    }
    if (n > MAX_USER_CREDITS) {
        throw new Error(`Credits cannot exceed ${MAX_USER_CREDITS.toLocaleString()}`);
    }
    return n;
}

export function getCreditCostPerItem(subModule: LEAD_GENERATION_SUB_MODULES): number {
    const cost = CREDIT_COST_PER_ITEM[subModule];
    if (cost == null || cost < 0 || !Number.isFinite(cost)) {
        throw new Error(`No credit cost configured for ${subModule}`);
    }
    return cost;
}

/** Short label for form UI, e.g. "1 credit per result". */
export function formatCreditCostPerItemLabel(subModule: LEAD_GENERATION_SUB_MODULES): string {
    const cost = getCreditCostPerItem(subModule);
    return cost === 1 ? '1 credit per result' : `${cost} credits per result`;
}

export function computeLeadGenCreditCost(subModule: LEAD_GENERATION_SUB_MODULES, itemCount: number): number {
    if (itemCount <= 0) return 0;
    return itemCount * getCreditCostPerItem(subModule);
}
