import { YOUTUBE_HANDLER_LABELS } from "../constants";
import { createYoutubeHandler } from "../create-handler";
import { fetchYoutubeVideoTranscript } from "./helpers";
import { YOUTUBE_VIDEO_TRANSCRIPT_REQUEST_SCHEMA } from "./schemas";

export const youtubeVideoTranscriptHandler = createYoutubeHandler({
  label: YOUTUBE_HANDLER_LABELS.VIDEO_TRANSCRIPT,
  schema: YOUTUBE_VIDEO_TRANSCRIPT_REQUEST_SCHEMA,
  fetch: fetchYoutubeVideoTranscript,
});
