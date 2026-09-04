import {
  VIRAL_CLIPPER_AUDIENCE_SIGNALS_BLOCK_TEMPLATE,
  VIRAL_CLIPPER_AUDIENCE_SIGNALS_RULE_TEMPLATE,
  VIRAL_CLIPPER_CHANNEL_CONTEXT_BLOCK_TEMPLATE,
  VIRAL_CLIPPER_VIRAL_MOMENTS_PROMPT_HEADER,
} from "./constants";
import { generateStructuredContent, withGeminiKeyPoolRetry } from "../gemini-client";
import {
  GEMINI_VIRAL_MOMENTS_RESPONSE_SCHEMA,
  GEMINI_VIRAL_MOMENTS_RESPONSE_VALIDATOR,
} from "./schemas";
import type {
  VIRAL_CLIPPER_PODCAST_TONE,
  VIRAL_CLIPPER_VIRAL_MOMENTS_RESPONSE,
  DIARIZED_TRANSCRIPT,
  VIRAL_MOMENT_CANDIDATE,
} from "../types";

/** Flattens a diarized transcript into `[MM:SS-MM:SS] role: text` lines for the prompt. */
function renderTranscriptForPrompt(diarized: DIARIZED_TRANSCRIPT): string {
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
  /** Optional freeform channel/audience description — see VIRAL_CLIPPER_CHANNEL_CONTEXT_BLOCK_TEMPLATE. */
  channelContext?: string;
  /**
   * Optional pre-formatted lines of real audience behavior on this exact
   * episode — e.g. "12:34 — 8 viewers mentioned this, 340 likes" from the
   * youtube module's comments-intel clusters, or "12:34 — chapter: 'Ravi's
   * viral BBC video'" from its chapters route. Caller fetches/formats
   * these; this function just injects them — see
   * VIRAL_CLIPPER_AUDIENCE_SIGNALS_BLOCK_TEMPLATE.
   */
  audienceSignals?: string[];
};

export async function scoreViralMoments(
  options: ScoreViralMomentsOptions,
): Promise<VIRAL_CLIPPER_VIRAL_MOMENTS_RESPONSE> {
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
    ? VIRAL_CLIPPER_CHANNEL_CONTEXT_BLOCK_TEMPLATE.replace(
        "{{CHANNEL_CONTEXT}}",
        channelContext,
      )
    : "";

  const hasAudienceSignals = !!audienceSignals?.length;
  const audienceSignalsBlock = hasAudienceSignals
    ? VIRAL_CLIPPER_AUDIENCE_SIGNALS_BLOCK_TEMPLATE.replace(
        "{{AUDIENCE_SIGNALS}}",
        audienceSignals.join("\n"),
      )
    : "";
  const audienceSignalsRule = hasAudienceSignals
    ? VIRAL_CLIPPER_AUDIENCE_SIGNALS_RULE_TEMPLATE
    : "";

  const prompt =
    VIRAL_CLIPPER_VIRAL_MOMENTS_PROMPT_HEADER.replace("{{MIN}}", String(minCandidates))
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
        podcast_tone: VIRAL_CLIPPER_PODCAST_TONE;
        podcast_tone_note: string;
      }>({
        model,
        parts: [{ text: prompt }],
        responseSchema: GEMINI_VIRAL_MOMENTS_RESPONSE_SCHEMA,
        apiKey,
        zodValidator: GEMINI_VIRAL_MOMENTS_RESPONSE_VALIDATOR,
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
