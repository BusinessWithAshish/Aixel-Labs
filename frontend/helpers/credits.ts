import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';

/** Credits charged per returned lead item for each lead-gen submodule. */
export const CREDIT_COST_PER_ITEM: Partial<Record<LEAD_GENERATION_SUB_MODULES, number>> = {
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS]: 1,
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH]: 1,
    [LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH]: 1,
    [LEAD_GENERATION_SUB_MODULES.LINKEDIN]: 1,
};

export type UserCreditsState = {
    credits: number;
    /** Admins are outside the credits system. */
    exempt: boolean;
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
