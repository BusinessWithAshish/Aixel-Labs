/**
 * Claude path for viral-moment ranking — same rubric, same output contract
 * as score.ts's Gemini path, different transport (see
 * `api/claude/structured-json.ts` for the parse/validate/retry mechanics
 * shared with youtube's caption speaker-labeling Claude path).
 */
import {
  SEGMENT_CLAUDE_MAX_ATTEMPTS,
  SEGMENT_CLAUDE_TIMEOUT_SECONDS,
  SEGMENT_ERROR_MESSAGES,
} from "../constants";
import { askClaudeForJson } from "../../claude/structured-json";
import {
  MOMENTS_AUDIENCE_SIGNALS_BLOCK_TEMPLATE,
  MOMENTS_AUDIENCE_SIGNALS_RULE_TEMPLATE,
  MOMENTS_CHANNEL_CONTEXT_BLOCK_TEMPLATE,
  MOMENTS_PROMPT_HEADER,
} from "./constants";
import {
  GEMINI_VIRAL_MOMENTS_RESPONSE_SCHEMA,
  MOMENTS_RESPONSE_VALIDATOR,
} from "./schemas";
import { renderTranscriptForPrompt } from "./score";
import type { DIARIZED_TRANSCRIPT } from "../../media/types";
import type { CLAUDE_USAGE } from "../../claude/types";
import type { MOMENTS_PODCAST_TONE, VIRAL_MOMENT_CANDIDATE } from "./types";

export type ScoreViralMomentsWithClaudeOptions = {
  diarized: DIARIZED_TRANSCRIPT;
  model?: string;
  minCandidates: number;
  maxCandidates: number;
  minClipSeconds: number;
  maxClipSeconds: number;
  channelContext?: string;
  audienceSignals?: string[];
};

export type ScoreViralMomentsWithClaudeResult = {
  candidates: VIRAL_MOMENT_CANDIDATE[];
  podcast_tone: MOMENTS_PODCAST_TONE;
  podcast_tone_note: string;
  usage: CLAUDE_USAGE | undefined;
  attempts: number;
};

function buildPrompt(options: ScoreViralMomentsWithClaudeOptions): string {
  const {
    diarized,
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
        audienceSignals!.join("\n"),
      )
    : "";
  const audienceSignalsRule = hasAudienceSignals
    ? MOMENTS_AUDIENCE_SIGNALS_RULE_TEMPLATE
    : "";

  const rubric =
    MOMENTS_PROMPT_HEADER.replace("{{MIN}}", String(minCandidates))
      .replace("{{MAX}}", String(maxCandidates))
      .replace(/{{MIN_DURATION}}/g, String(minClipSeconds))
      .replace(/{{MAX_DURATION}}/g, String(maxClipSeconds))
      .replace("{{CHANNEL_CONTEXT_BLOCK}}", channelContextBlock)
      .replace("{{AUDIENCE_SIGNALS_BLOCK}}", audienceSignalsBlock)
      .replace("{{AUDIENCE_SIGNALS_RULE}}", audienceSignalsRule) +
    renderTranscriptForPrompt(diarized);

  return (
    rubric +
    "\n\nReturn ONLY a single JSON object matching exactly this JSON Schema — no " +
    "markdown code fences, no commentary before or after it:\n\n" +
    JSON.stringify(GEMINI_VIRAL_MOMENTS_RESPONSE_SCHEMA, null, 2)
  );
}

export async function scoreViralMomentsWithClaude(
  options: ScoreViralMomentsWithClaudeOptions,
): Promise<ScoreViralMomentsWithClaudeResult> {
  const { data, usage, attempts } = await askClaudeForJson({
    prompt: buildPrompt(options),
    zodValidator: MOMENTS_RESPONSE_VALIDATOR,
    model: options.model,
    maxAttempts: SEGMENT_CLAUDE_MAX_ATTEMPTS,
    timeoutSeconds: SEGMENT_CLAUDE_TIMEOUT_SECONDS,
    exhaustedErrorPrefix: SEGMENT_ERROR_MESSAGES.CLAUDE_INVALID_JSON,
  });

  return {
    candidates: data.candidates,
    podcast_tone: data.podcast_tone,
    podcast_tone_note: data.podcast_tone_note,
    usage,
    attempts,
  };
}
