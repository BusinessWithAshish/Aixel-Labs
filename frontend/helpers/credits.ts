import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';

/** Credits charged per returned lead item for each lead-gen submodule. */
export const CREDIT_COST_PER_ITEM: Partial<Record<LEAD_GENERATION_SUB_MODULES, number>> = {
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS]: 1,
    [LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH]: 1,
    [LEAD_GENERATION_SUB_MODULES.LINKEDIN]: 1,
};

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
    return n;
}

export function getCreditCostPerItem(subModule: LEAD_GENERATION_SUB_MODULES): number {
    const cost = CREDIT_COST_PER_ITEM[subModule];
    if (cost == null || cost < 0 || !Number.isFinite(cost)) {
        throw new Error(`No credit cost configured for ${subModule}`);
    }
    return cost;
}

export function computeLeadGenCreditCost(
    subModule: LEAD_GENERATION_SUB_MODULES,
    itemCount: number,
): number {
    if (itemCount <= 0) return 0;
    return itemCount * getCreditCostPerItem(subModule);
}
