import { createMediaHandler } from "../create-handler";
import { MEDIA_CAPTION_REQUEST_SCHEMA } from "./schemas";
import { captionVideo } from "./caption";

/** POST /video/caption — a video in, an .srt plus (by default) a burned-in copy out. */
export const mediaCaptionHandler = createMediaHandler({
  label: "MEDIA/CAPTION",
  schema: MEDIA_CAPTION_REQUEST_SCHEMA,
  fetch: (input) => captionVideo(input),
});
