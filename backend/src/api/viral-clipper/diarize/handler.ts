import { createViralClipperHandler } from "../create-handler";
import { diarizeFromSource } from "./audio";
import { diarizeFromYoutubeCaptions } from "./captions";
import { VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA } from "./schemas";

/** POST /viral-clipper/diarize — audio URL/path or YouTube videoUrl in, speaker-labelled transcript out. */
export const viralClipperDiarizeHandler = createViralClipperHandler({
  label: "VIRAL_CLIPPER/DIARIZE",
  schema: VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA,
  fetch: (input) =>
    input.videoUrl
      ? diarizeFromYoutubeCaptions(
          input.videoUrl,
          input.language,
          input.model,
          input.speakerCount,
        )
      : diarizeFromSource(input.audioSource!, input.model),
});
