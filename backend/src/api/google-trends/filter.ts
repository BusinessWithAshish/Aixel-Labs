import {
  GOOGLE_TRENDS_CATEGORY,
  GOOGLE_TRENDS_SORT,
  GOOGLE_TRENDS_STATUS,
} from "./constants";
import type { GOOGLE_TRENDS_TREND } from "./types";

/** Applies the `category` filter (entry.categories must include the ID, unless 0 = all). */
export function filterByCategory(
  trends: GOOGLE_TRENDS_TREND[],
  category: number,
): GOOGLE_TRENDS_TREND[] {
  if (category === GOOGLE_TRENDS_CATEGORY.ALL) return trends;
  return trends.filter((t) => t.categories.includes(category));
}

/** Applies the `status` filter (trending = no end timestamp; started = has end timestamp). */
export function filterByStatus(
  trends: GOOGLE_TRENDS_TREND[],
  status: string,
): GOOGLE_TRENDS_TREND[] {
  if (status === GOOGLE_TRENDS_STATUS.TRENDING) {
    return trends.filter((t) => t.endedAt === null);
  }
  if (status === GOOGLE_TRENDS_STATUS.STARTED) {
    return trends.filter((t) => t.endedAt !== null);
  }
  return trends;
}

/** Sorts the parsed entries according to the requested sort order. */
export function sortTrends(
  trends: GOOGLE_TRENDS_TREND[],
  sort: string,
): GOOGLE_TRENDS_TREND[] {
  if (sort === GOOGLE_TRENDS_SORT.VOLUME) {
    return [...trends].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  }
  if (sort === GOOGLE_TRENDS_SORT.STARTED) {
    return [...trends].sort(
      (a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0),
    );
  }
  // "relevance" — preserve Google's native order.
  return trends;
}
