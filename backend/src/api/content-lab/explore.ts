import type { z } from "zod";
import { computeNicheStats, computeTakeaways, sortByMultiple } from "./compute";
import { errorMessage } from "./helpers";
import { exploreInstagram } from "./instagram";
import type { CONTENT_LAB_EXPLORE_REQUEST_SCHEMA } from "./schemas";
import type {
  CONTENT_LAB_EXPLORE_RESPONSE,
  CONTENT_LAB_POST,
  ContentLabPlatform,
} from "./types";
import { exploreYoutube } from "./youtube";

export type ContentLabExploreInput = z.output<typeof CONTENT_LAB_EXPLORE_REQUEST_SCHEMA>;

const EXPLORERS: Record<ContentLabPlatform, (query: string, country: string) => Promise<CONTENT_LAB_POST[]>> = {
  youtube: exploreYoutube,
  instagram: exploreInstagram,
};

/**
 * Cross-creator outliers for a niche: every platform runs in parallel and one
 * failing lands in `errors` while the others still return. Takeaways and niche
 * stats use every post found, before `limit` trims the list.
 */
export async function contentLabExploreService(input: ContentLabExploreInput): Promise<CONTENT_LAB_EXPLORE_RESPONSE> {
  const platforms = [...new Set(input.platforms)];
  const settled = await Promise.allSettled(platforms.map((p) => EXPLORERS[p](input.query, input.country)));

  const errors: CONTENT_LAB_EXPLORE_RESPONSE["errors"] = {};
  const all: CONTENT_LAB_POST[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") all.push(...result.value);
    else errors[platforms[i]!] = errorMessage(result.reason);
  });

  return {
    query: input.query,
    country: input.country,
    platforms,
    posts: sortByMultiple(all).slice(0, input.limit),
    takeaways: computeTakeaways(all),
    niche: computeNicheStats(all),
    errors,
  };
}
