import { createMediaHandler } from "../create-handler";
import { diarizeFromSource } from "./audio";
import { MEDIA_DIARIZE_REQUEST_SCHEMA } from "./schemas";

/** POST /media/diarize — Gemini-audio only. See `youtube` op=diarize for the free, captions-based path. */
export const mediaDiarizeHandler = createMediaHandler({
  label: "MEDIA/DIARIZE",
  schema: MEDIA_DIARIZE_REQUEST_SCHEMA,
  fetch: (input) => diarizeFromSource(input.audioSource, input.model),
});
