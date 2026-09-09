/**
 * Claude path for viral-moment ranking — same rubric, same output contract
 * as score.ts's Gemini path, different transport. `claude -p` has no
 * schema-constrained decoding, so this builds the request explicitly asking
 * for JSON matching GEMINI_VIRAL_MOMENTS_RESPONSE_SCHEMA (reused here purely
 * as prompt documentation, not as an API parameter), then parses and
 * validates the free-text answer. On a malformed response, retries on the
 * SAME Claude session (via session_id) with the validation error appended —
 * cheaper than a fresh session and lets the model see exactly what it got
 * wrong, up to SEGMENT_CLAUDE_MAX_ATTEMPTS total attempts.
 */
import { z } from "zod";

import { askClaude } from "../../claude/client";
import { CLAUDE_ASK_REQUEST_SCHEMA } from "../../claude/schemas";
import { SEGMENT_CLAUDE_MAX_ATTEMPTS, SEGMENT_ERROR_MESSAGES } from "../constants";
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

/** Strips a ```json ... ``` (or bare ```) fence Claude sometimes wraps its answer in despite being told not to. Leaves unfenced text untouched. */
function stripCodeFence(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  return fenced ? fenced[1].trim() : text.trim();
}

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
  const prompt = buildPrompt(options);

  let sessionId: string | undefined;
  let lastUsage: CLAUDE_USAGE | undefined;
  let lastError = "";
  let task = prompt;

  for (let attempt = 1; attempt <= SEGMENT_CLAUDE_MAX_ATTEMPTS; attempt++) {
    const req = CLAUDE_ASK_REQUEST_SCHEMA.parse({
      task,
      session_id: sessionId,
      model: options.model,
    });
    const res = await askClaude(req);

    if (!res.ok) {
      throw new Error(res.error || SEGMENT_ERROR_MESSAGES.GENERIC);
    }
    sessionId = res.session_id;
    lastUsage = res.usage;

    const candidate = stripCodeFence(res.text ?? "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch (err) {
      lastError = `not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
      task =
        `Your previous response was not valid JSON (${lastError}). ` +
        "Return ONLY the corrected JSON object — no markdown fences, no commentary.";
      continue;
    }

    const validated = MOMENTS_RESPONSE_VALIDATOR.safeParse(parsed);
    if (!validated.success) {
      lastError = validated.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      task =
        `Your previous JSON did not match the required schema (${lastError}). ` +
        "Return ONLY the corrected JSON object — no markdown fences, no commentary.";
      continue;
    }

    return {
      candidates: validated.data.candidates,
      podcast_tone: validated.data.podcast_tone,
      podcast_tone_note: validated.data.podcast_tone_note,
      usage: lastUsage,
      attempts: attempt,
    };
  }

  throw new Error(
    `${SEGMENT_ERROR_MESSAGES.CLAUDE_INVALID_JSON} after ${SEGMENT_CLAUDE_MAX_ATTEMPTS} attempts: ${lastError}`,
  );
}
