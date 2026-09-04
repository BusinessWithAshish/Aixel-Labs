import { createViralClipperHandler } from "../create-handler";
import { VIRAL_CLIPPER_CUT_REQUEST_SCHEMA } from "./schemas";
import { cutClipsFromVideo } from "./cut";

/** POST /viral-clipper/cut — video source + time ranges in, local clip file paths out. */
export const viralClipperCutHandler = createViralClipperHandler({
  label: "VIRAL_CLIPPER/CUT",
  schema: VIRAL_CLIPPER_CUT_REQUEST_SCHEMA,
  fetch: (input) =>
    cutClipsFromVideo(
      input.videoSource,
      input.clips,
      input.diarized,
      input.aspectRatio,
    ),
});
