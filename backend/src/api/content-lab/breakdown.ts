import type { z } from "zod";
import { withStatusCode } from "../../config";
import { CONTENT_LAB_ERROR_MESSAGES } from "./constants";
import { instagramBreakdown, parseInstagramUrl } from "./instagram";
import type { CONTENT_LAB_BREAKDOWN_REQUEST_SCHEMA } from "./schemas";
import type { CONTENT_LAB_BREAKDOWN_RESPONSE } from "./types";
import { parseYoutubeUrl, youtubeBreakdown } from "./youtube";

export type ContentLabBreakdownInput = z.output<typeof CONTENT_LAB_BREAKDOWN_REQUEST_SCHEMA>;

/** A YouTube video / Short or an Instagram post / reel URL → hook, structure, CTA, audience and why it worked. */
export async function contentLabBreakdownService(input: ContentLabBreakdownInput): Promise<CONTENT_LAB_BREAKDOWN_RESPONSE> {
  const youtube = parseYoutubeUrl(input.url);
  if (youtube) return youtubeBreakdown(youtube.videoId, youtube.isShortsUrl, input.country);
  const shortcode = parseInstagramUrl(input.url);
  if (shortcode) return instagramBreakdown(shortcode, input.country);
  throw withStatusCode(CONTENT_LAB_ERROR_MESSAGES.UNSUPPORTED_URL, 400);
}
