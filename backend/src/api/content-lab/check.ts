import type { z } from "zod";
import { withStatusCode } from "../../config";
import { computeDraftCheck, pickWinners } from "./compute";
import { CONTENT_LAB_LIMITS } from "./constants";
import { contentLabExploreService } from "./explore";
import type { CONTENT_LAB_CHECK_REQUEST_SCHEMA } from "./schemas";
import type { CONTENT_LAB_CHECK_RESPONSE } from "./types";

export type ContentLabCheckInput = z.output<typeof CONTENT_LAB_CHECK_REQUEST_SCHEMA>;

/** Scores a draft title / hook against the niche's current winners on one platform. */
export async function contentLabCheckService(input: ContentLabCheckInput): Promise<CONTENT_LAB_CHECK_RESPONSE> {
  const explore = await contentLabExploreService({
    query: input.query,
    platforms: [input.platform],
    country: input.country,
    limit: CONTENT_LAB_LIMITS.checkWinners,
  });
  const winners = pickWinners(explore.posts);
  if (winners.length === 0) {
    throw withStatusCode(explore.errors[input.platform] ?? "We couldn't find enough top posts on this topic yet", 502);
  }
  return { ...computeDraftCheck(input.text, input.platform, winners), winners };
}
