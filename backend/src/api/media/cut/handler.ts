import { createMediaHandler } from "../create-handler";
import { MEDIA_CUT_REQUEST_SCHEMA } from "./schemas";
import { cutClipsFromVideo } from "./cut";

/** POST /video/cut — video source + time ranges in, local clip file paths out. */
export const mediaCutHandler = createMediaHandler({
  label: "MEDIA/CUT",
  schema: MEDIA_CUT_REQUEST_SCHEMA,
  fetch: (input) =>
    cutClipsFromVideo(
      input.videoSource,
      input.clips,
      input.diarized,
      input.aspectRatio,
      input.reframe,
    ),
});
