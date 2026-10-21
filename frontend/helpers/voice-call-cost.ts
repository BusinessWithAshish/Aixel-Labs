import type { VoiceCallCost } from '@aixellabs/backend/db/types';

/**
 * A call's cost in words (Call logs, call detail, per-agent totals). The engine stores dollars
 * (`VoiceCallCost`); rupees are shown beside them at this fixed rate.
 * shortcut: a fixed rate (ECB, 2026-10-20: 94.93); move it when the rupee drifts more than a few percent.
 */
export const INR_PER_USD = 95;

/** "$0.024" under a dollar (calls cost cents), "$12.40" above. */
export function formatUsd(usd: number): string {
    return `$${usd.toFixed(usd < 1 ? 3 : 2)}`;
}

/** "₹2.11", "₹1,091". */
export function formatInr(usd: number): string {
    const inr = usd * INR_PER_USD;
    return `₹${inr.toLocaleString('en-IN', { maximumFractionDigits: inr < 100 ? 2 : 0 })}`;
}

/** Dollars per minute of talk, or null for a call nobody heard. */
export function costPerMinute(totalUsd: number, durationSec: number): number | null {
    return durationSec > 0 ? totalUsd / (durationSec / 60) : null;
}

/** True while the phone part is minutes × the provider's list rate, not its own charge yet. */
export function isCostEstimated(cost: Pick<VoiceCallCost, 'provider' | 'providerExact'>): boolean {
    return !!cost.provider && !cost.providerExact;
}
