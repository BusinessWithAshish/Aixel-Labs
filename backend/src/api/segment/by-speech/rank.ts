import { MEDIA_GEMINI_MODEL } from "../../media/constants";
import { loadDiarizedTranscript } from "../../media/diarize/transcript-store";
import { scoreViralMoments } from "../moments/score";
import { scoreViralMomentsWithClaude } from "../moments/score-claude";
import type { BY_SPEECH_REQUEST_PARSED, BY_SPEECH_RESPONSE } from "../types";

/**
 * Ranks a diarized transcript into viral short-form clip candidates. Same
 * rubric and same output contract regardless of `provider` — only the
 * transport (and therefore the cost/quota/reliability tradeoffs) differs.
 * See SEGMENT_FIELD_DESCRIPTIONS.provider for what each option actually
 * costs. There is no default: the caller is required to choose.
 */
export async function rankBySpeech(
  input: BY_SPEECH_REQUEST_PARSED,
): Promise<BY_SPEECH_RESPONSE> {
  // A path from a diarize op keeps the transcript server-side (see
  // transcript-store.ts); the inline object is still accepted.
  const diarized =
    input.diarized ??
    (input.diarizedPath ? await loadDiarizedTranscript(input.diarizedPath) : undefined);
  if (!diarized) {
    throw new Error("Provide exactly one of diarized or diarizedPath");
  }
  const {
    provider,
    model,
    minCandidates,
    maxCandidates,
    minClipSeconds,
    maxClipSeconds,
    channelContext,
    audienceSignals,
  } = input;

  const shared = {
    diarized,
    minCandidates,
    maxCandidates,
    minClipSeconds,
    maxClipSeconds,
    channelContext,
    audienceSignals,
  };

  if (provider === "gemini") {
    const result = await scoreViralMoments({
      ...shared,
      model: model || MEDIA_GEMINI_MODEL.DEFAULT,
    });
    return {
      candidates: result.candidates,
      podcast_tone: result.podcast_tone,
      podcast_tone_note: result.podcast_tone_note,
      usage: { provider: "gemini", usage: result.usage },
    };
  }

  const result = await scoreViralMomentsWithClaude({ ...shared, model });
  return {
    candidates: result.candidates,
    podcast_tone: result.podcast_tone,
    podcast_tone_note: result.podcast_tone_note,
    usage: { provider: "claude", usage: result.usage, attempts: result.attempts },
  };
}
