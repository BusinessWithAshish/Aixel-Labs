import {
  GSEARCH_TIME_FILTER,
  GSEARCH_TIME_FILTER_DAYS,
  MS_PER_DAY,
} from "../constants";

/**
 * Build the `"… in …"` location fragment from optional city (`region`) + state.
 * - both → `"City, State"`
 * - city only → `"City"`
 * - state only → `"State"`
 */
export function buildLocationFragment(
  region?: string | null,
  state?: string | null,
): string | null {
  const city = region?.trim() || "";
  const st = state?.trim() || "";
  if (city && st) return `${city}, ${st}`;
  if (city) return city;
  if (st) return st;
  return null;
}

/**
 * Build the query text sent to Google. City/region precision on the CSE endpoint
 * comes from the query text ("<query> in <city>, <state>") — `uule`/`near` are
 * ignored by the element API.
 */
export function buildLocationQuery(
  searchQuery: string,
  region?: string | null,
  state?: string | null,
): string {
  const q = searchQuery.trim();
  const loc = buildLocationFragment(region, state);
  if (!loc) return q;
  // Avoid double-appending if the caller already put the location in the query.
  if (q.toLowerCase().includes(loc.toLowerCase())) return q;
  return `${q} in ${loc}`;
}

function formatSortDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function formatAfterDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeFilterWindow(
  timeFilter: GSEARCH_TIME_FILTER,
): { start: Date; end: Date } {
  const days = GSEARCH_TIME_FILTER_DAYS[timeFilter];
  const end = new Date();
  const start = new Date(end.getTime() - days * MS_PER_DAY);
  return { start, end };
}

/**
 * Translate a time filter into the CSE `sort` value. The element endpoint has no
 * `tbs`; it uses `sort=date:r:<start>:<end>` (per SearXNG's google_cse engine).
 *
 * Note: on whole-web CSE this alone is weak — pair with `applyTimeFilterToQuery`
 * (`after:YYYY-MM-DD`), which is what actually shifts results toward freshness.
 */
export function buildTimeSort(
  timeFilter: GSEARCH_TIME_FILTER | undefined,
): string | null {
  if (!timeFilter) return null;
  const { start, end } = timeFilterWindow(timeFilter);
  return `date:r:${formatSortDate(start)}:${formatSortDate(end)}`;
}

const AFTER_OPERATOR_PATTERN = /\bafter:\d{4}-\d{2}-\d{2}\b/i;

/**
 * Append Google's `after:YYYY-MM-DD` operator so CSE returns recently indexed /
 * published pages. Without this, relevance ranking floods results with stale
 * hub pages even when `sort=date:r:…` is set.
 */
export function applyTimeFilterToQuery(
  query: string,
  timeFilter: GSEARCH_TIME_FILTER | undefined,
): string {
  if (!timeFilter) return query;
  const q = query.trim();
  if (AFTER_OPERATOR_PATTERN.test(q)) return q;
  const { start } = timeFilterWindow(timeFilter);
  return `${q} after:${formatAfterDate(start)}`;
}
