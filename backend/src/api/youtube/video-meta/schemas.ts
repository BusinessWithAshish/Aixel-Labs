import { z } from "zod";
import {
  YOUTUBE_VIDEO_META_MAX_BATCH,
} from "../constants";
import {
  YOUTUBE_GEO_REQUEST_SCHEMA,
  YOUTUBE_VIDEO_ID_SCHEMA,
} from "../schemas";

export const YOUTUBE_VIDEO_META_REQUEST_SCHEMA = YOUTUBE_GEO_REQUEST_SCHEMA.extend(
  {
    videoIds: z
      .array(YOUTUBE_VIDEO_ID_SCHEMA)
      .min(1)
      .max(YOUTUBE_VIDEO_META_MAX_BATCH)
      .describe(
        `YouTube video IDs to resolve (max ${YOUTUBE_VIDEO_META_MAX_BATCH} per request). Duplicates are deduped.`,
      ),
    deepCommentLookup: z
      .boolean()
      .optional()
      .describe(
        "When true, fetches a full watch-page HTML per video (several hundred KB, proxy bandwidth cost) to resolve commentCount for videos where the lean get_watch response omits it. Defaults to false — commentCount is left null for those videos instead of paying the extra fetch. Only enable when commentCount accuracy is specifically needed.",
      ),
  },
);
