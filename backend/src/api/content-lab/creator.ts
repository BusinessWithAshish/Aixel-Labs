import type { z } from "zod";
import { instagramCreator } from "./instagram";
import type { CONTENT_LAB_CREATOR_REQUEST_SCHEMA } from "./schemas";
import type { CONTENT_LAB_CREATOR_RESPONSE } from "./types";
import { youtubeCreator } from "./youtube";

export type ContentLabCreatorInput = z.output<typeof CONTENT_LAB_CREATOR_REQUEST_SCHEMA>;

/** A creator's usual views and recent posts with their multiples (Watching, board "Creator" nodes). */
export function contentLabCreatorService(input: ContentLabCreatorInput): Promise<CONTENT_LAB_CREATOR_RESPONSE> {
  return input.platform === "youtube"
    ? youtubeCreator(input.handle, input.country, input.limit)
    : instagramCreator(input.handle, input.country, input.limit);
}
