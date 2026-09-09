import type { GEMINI_USAGE_METADATA, DIARIZED_TRANSCRIPT } from "../../media/types";

/** Same shape as `media`'s `MEDIA_DIARIZE_RESPONSE` — the shared contract `segment.by_speech`/`media.cut` read regardless of which op produced it. No `source` discriminator needed: calling this op already tells you it came from captions. */
export type YOUTUBE_DIARIZE_RESPONSE = {
  transcript: DIARIZED_TRANSCRIPT;
  usage: GEMINI_USAGE_METADATA;
};
