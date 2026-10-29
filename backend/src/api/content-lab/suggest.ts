import type { z } from "zod";
import { createTtlCache } from "./cache";
import { CONTENT_LAB_CACHE, CONTENT_LAB_SUGGEST_LIMIT } from "./constants";
import { suggestInstagramCreators } from "./instagram";
import type { CONTENT_LAB_SUGGEST_REQUEST_SCHEMA } from "./schemas";
import type { CONTENT_LAB_SUGGEST_RESPONSE, CONTENT_LAB_SUGGESTION } from "./types";
import { suggestYoutubeCreators } from "./youtube";

export type ContentLabSuggestInput = z.output<typeof CONTENT_LAB_SUGGEST_REQUEST_SCHEMA>;

const suggestCache = createTtlCache<CONTENT_LAB_SUGGESTION[]>(CONTENT_LAB_CACHE.suggestTtlMs, CONTENT_LAB_CACHE.suggestMaxEntries);

/**
 * Creator type-ahead for the Watching page, called per (debounced) keystroke.
 * YouTube: channel search (~0.5 s). Instagram: exact-handle lookups only
 * (no guest user search exists; see `suggestInstagramCreators`). Answers are
 * cached per platform + country + lowercased text.
 */
export async function contentLabSuggestService(input: ContentLabSuggestInput): Promise<CONTENT_LAB_SUGGEST_RESPONSE> {
  const text = input.query.trim().toLowerCase();
  const creators = await suggestCache.get(`${input.platform}:${input.country}:${text}`, () =>
    input.platform === "youtube"
      ? suggestYoutubeCreators(text, input.country, CONTENT_LAB_SUGGEST_LIMIT)
      : suggestInstagramCreators(text),
  );
  return { query: input.query, platform: input.platform, creators };
}
