import type { z } from "zod";
import type { YOUTUBE_VIDEO_META_REQUEST_SCHEMA } from "../../video-meta/schemas";
import { fetchYoutubeVideoMeta } from "../../video-meta/helpers";
import { enrichVideoMetaFields } from "./compute";
import type { YOUTUBE_VIDEO_META_INTELLIGENCE_RESPONSE } from "./types";

export type BulkEnrichVideosInput = z.infer<
  typeof YOUTUBE_VIDEO_META_REQUEST_SCHEMA
>;

export async function bulkEnrichVideosService(
  input: BulkEnrichVideosInput,
): Promise<YOUTUBE_VIDEO_META_INTELLIGENCE_RESPONSE> {
  const raw = await fetchYoutubeVideoMeta(input);
  const harvestedAt = new Date();

  return {
    requested: raw.requested,
    resolved: raw.resolved,
    items: raw.items.map((item) => ({
      ...item,
      intelligence: enrichVideoMetaFields(
        item.publishedAt,
        item.lengthSeconds,
        harvestedAt,
      ),
    })),
  };
}
