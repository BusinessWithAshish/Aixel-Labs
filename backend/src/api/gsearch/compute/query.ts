import {
  GSEARCH_TIME_FILTER,
  GSEARCH_TIME_FILTER_DAYS,
  MS_PER_DAY,
} from "../constants";

/**
 * Build the query text sent to Google. City/region precision on the CSE endpoint
 * comes from the query text ("<query> in <region>") — `uule`/`near` are ignored
 * by the element API, so we mirror the browser-worker's `${query} in ${city}` trick.
 */
export function buildLocationQuery(
  searchQuery: string,
  region?: string | null,
): string {
  const q = searchQuery.trim();
  const loc = region?.trim();
  if (!loc) return q;
  // Avoid double-appending if the caller already put the location in the query.
  if (q.toLowerCase().includes(loc.toLowerCase())) return q;
  return `${q} in ${loc}`;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Translate a time filter into the CSE `sort` value. The element endpoint has no
 * `tbs`; it uses `sort=date:r:<start>:<end>` (per SearXNG's google_cse engine).
 */
export function buildTimeSort(
  timeFilter: GSEARCH_TIME_FILTER | undefined,
): string | null {
  if (!timeFilter) return null;
  const days = GSEARCH_TIME_FILTER_DAYS[timeFilter];
  const end = new Date();
  const start = new Date(end.getTime() - days * MS_PER_DAY);
  return `date:r:${formatDate(start)}:${formatDate(end)}`;
}
