import { createYoutubeHandler } from "../create-handler";
import { YOUTUBE_HANDLER_LABELS } from "../constants";
import { YOUTUBE_DIARIZE_REQUEST_SCHEMA } from "./schemas";
import { diarizeFromYoutubeCaptions } from "./captions";

/** POST /youtube/diarize — YouTube captions in, speaker-labelled transcript out. No Gemini-audio fallback; see media op=diarize for that. */
export const youtubeDiarizeHandler = createYoutubeHandler({
  label: YOUTUBE_HANDLER_LABELS.DIARIZE,
  schema: YOUTUBE_DIARIZE_REQUEST_SCHEMA,
  fetch: (input) =>
    diarizeFromYoutubeCaptions(
      input.videoUrl,
      input.language,
      input.model,
      input.speakerCount,
    ),
});
