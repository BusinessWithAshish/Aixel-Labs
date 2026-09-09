import type { GEMINI_USAGE_METADATA, DIARIZED_TRANSCRIPT } from "../../media/types";
import type { CLAUDE_USAGE } from "../../claude/types";

/**
 * Provider-tagged, same reasoning as `segment`'s `SEGMENT_USAGE`: Gemini and
 * Claude report fundamentally different usage shapes, so this is a
 * discriminant, not a lossy merge. Named-track / single-turn paths never
 * call a model at all (no labeling needed) — those report `provider:
 * "gemini"` with a zero-valued usage anyway, since that was this response's
 * shape before the Claude option existed and nothing downstream needs a
 * third "no call made" variant to know the cost was zero either way.
 */
export type YOUTUBE_DIARIZE_USAGE =
  | { provider: "gemini"; usage: GEMINI_USAGE_METADATA }
  | { provider: "claude"; usage: CLAUDE_USAGE | undefined; attempts: number };

/** Same shape as `media`'s `MEDIA_DIARIZE_RESPONSE` — the shared contract `segment.by_speech`/`media.cut` read regardless of which op produced it. No `source` discriminator needed: calling this op already tells you it came from captions. */
export type YOUTUBE_DIARIZE_RESPONSE = {
  transcript: DIARIZED_TRANSCRIPT;
  usage: YOUTUBE_DIARIZE_USAGE;
};
