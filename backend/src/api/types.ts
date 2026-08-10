import { z } from "zod";

export type ALApiResponse<T> = {
  success: boolean;
  error?: string;
  data?: T;
};

/**
 * Tri-state presence/requirement filter shared by every "require X" enrichment
 * field (has website, has phone, is hiring, …) across scrape modules: "any" —
 * no filter, "has" — the condition must be true, "missing" — it must be false.
 * Replaces plain booleans, which can only express "must be true" or "don't care"
 * and have no way to require the negative.
 */
export const TRI_STATE_FILTER = {
  ANY: "any",
  HAS: "has",
  MISSING: "missing",
} as const;

export type TriStateFilter = (typeof TRI_STATE_FILTER)[keyof typeof TRI_STATE_FILTER];

export const TRI_STATE_FILTER_SCHEMA = z.nativeEnum(TRI_STATE_FILTER);

/** Shared `{value, label}` options for rendering a tri-state filter as a select/dropdown. */
export const TRI_STATE_FILTER_OPTIONS: { value: TriStateFilter; label: string }[] = [
  { value: TRI_STATE_FILTER.ANY, label: "Default" },
  { value: TRI_STATE_FILTER.HAS, label: "Yes" },
  { value: TRI_STATE_FILTER.MISSING, label: "No" },
];

/** Evaluate a tri-state filter against whether the underlying condition currently holds. */
export function matchesTriState(filter: TriStateFilter, isPresent: boolean): boolean {
  if (filter === TRI_STATE_FILTER.HAS) return isPresent;
  if (filter === TRI_STATE_FILTER.MISSING) return !isPresent;
  return true;
}
