import {
  MOMENTS_AUDIENCE_SIGNALS_BLOCK_TEMPLATE,
  MOMENTS_AUDIENCE_SIGNALS_RULE_TEMPLATE,
  MOMENTS_CHANNEL_CONTEXT_BLOCK_TEMPLATE,
  MOMENTS_PROMPT_HEADER,
} from "./constants";
import { generateStructuredContent, withGeminiKeyPoolRetry } from "../../media/gemini-client";
import {
  GEMINI_VIRAL_MOMENTS_RESPONSE_SCHEMA,
  MOMENTS_RESPONSE_VALIDATOR,
} from "./schemas";
import type { DIARIZED_TRANSCRIPT } from "../../media/types";
import type {
  MOMENTS_PODCAST_TONE,
  MOMENTS_RESPONSE,
  VIRAL_MOMENT_CANDIDATE,
} from "./types";

/** Flattens a diarized transcript into `[MM:SS-MM:SS] role: text` lines for the prompt. */
export function renderTranscriptForPrompt(diarized: DIARIZED_TRANSCRIPT): string {
  const labelBySpeaker = new Map(
    diarized.speakers.map((s) => [s.id, s.guessed_identity || s.id]),
  );
  return diarized.segments
    .map(
      (s) =>
        `[${s.start}-${s.end}] ${labelBySpeaker.get(s.speaker) ?? s.speaker}: ${s.text}`,
    )
    .join("\n");
}

export type ScoreViralMomentsOptions = {
  diarized: DIARIZED_TRANSCRIPT;
  model: string;
  minCandidates: number;
  maxCandidates: number;
  minClipSeconds: number;
  maxClipSeconds: number;
  /** Optional freeform channel/audience description — see MOMENTS_CHANNEL_CONTEXT_BLOCK_TEMPLATE. */
  channelContext?: string;
  /**
   * Optional pre-formatted lines of real audience behavior on this exact
   * episode — e.g. "12:34 — 8 viewers mentioned this, 340 likes" from the
   * youtube module's comments-intel clusters, or "12:34 — chapter: 'Ravi's
   * viral BBC video'" from its chapters route. Caller fetches/formats
   * these; this function just injects them — see
   * MOMENTS_AUDIENCE_SIGNALS_BLOCK_TEMPLATE.
   */
  audienceSignals?: string[];
};

export async function scoreViralMoments(
  options: ScoreViralMomentsOptions,
): Promise<MOMENTS_RESPONSE> {
  const {
    diarized,
    model,
    minCandidates,
    maxCandidates,
    minClipSeconds,
    maxClipSeconds,
    channelContext,
    audienceSignals,
  } = options;

  const channelContextBlock = channelContext
    ? MOMENTS_CHANNEL_CONTEXT_BLOCK_TEMPLATE.replace(
        "{{CHANNEL_CONTEXT}}",
        channelContext,
      )
    : "";

  const hasAudienceSignals = !!audienceSignals?.length;
  const audienceSignalsBlock = hasAudienceSignals
    ? MOMENTS_AUDIENCE_SIGNALS_BLOCK_TEMPLATE.replace(
        "{{AUDIENCE_SIGNALS}}",
        audienceSignals.join("\n"),
      )
    : "";
  const audienceSignalsRule = hasAudienceSignals
    ? MOMENTS_AUDIENCE_SIGNALS_RULE_TEMPLATE
    : "";

  const prompt =
    MOMENTS_PROMPT_HEADER.replace("{{MIN}}", String(minCandidates))
      .replace("{{MAX}}", String(maxCandidates))
      .replace(/{{MIN_DURATION}}/g, String(minClipSeconds))
      .replace(/{{MAX_DURATION}}/g, String(maxClipSeconds))
      .replace("{{CHANNEL_CONTEXT_BLOCK}}", channelContextBlock)
      .replace("{{AUDIENCE_SIGNALS_BLOCK}}", audienceSignalsBlock)
      .replace("{{AUDIENCE_SIGNALS_RULE}}", audienceSignalsRule) +
    renderTranscriptForPrompt(diarized);

  const { data, usage } = await withGeminiKeyPoolRetry(
    (apiKey) =>
      generateStructuredContent<{
        candidates: VIRAL_MOMENT_CANDIDATE[];
        podcast_tone: MOMENTS_PODCAST_TONE;
        podcast_tone_note: string;
      }>({
        model,
        parts: [{ text: prompt }],
        responseSchema: GEMINI_VIRAL_MOMENTS_RESPONSE_SCHEMA,
        apiKey,
        zodValidator: MOMENTS_RESPONSE_VALIDATOR,
      }),
    "viral-moments scoring",
  );

  return {
    candidates: data.candidates,
    podcast_tone: data.podcast_tone,
    podcast_tone_note: data.podcast_tone_note,
    usage,
  };
}
