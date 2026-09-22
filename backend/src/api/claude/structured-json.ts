/**
 * Generic "ask Claude for JSON matching a schema" helper, built on top of
 * `askClaude`. `claude -p` has no schema-constrained decoding the way
 * Gemini's `responseSchema` does, so this asks explicitly for JSON in the
 * prompt, then parses and validates the free-text answer. On invalid JSON
 * or a schema mismatch, it retries on the SAME Claude session (via
 * `session_id`) with the validation error appended — cheaper than a fresh
 * session, and lets the model see exactly what it got wrong.
 *
 * Second use of this exact pattern (segment's viral-moment ranking, now
 * youtube's caption speaker-labeling) is what justified pulling it out of
 * `segment/moments/score-claude.ts` into a shared place any domain can use —
 * not duplicated a third time.
 */
import { z } from "zod";

import { askClaude } from "./client";
import { CLAUDE_ASK_REQUEST_SCHEMA } from "./schemas";
import type { CLAUDE_USAGE } from "./types";

export type ASK_CLAUDE_FOR_JSON_RESULT<T> = {
  data: T;
  usage: CLAUDE_USAGE | undefined;
  attempts: number;
  /** The session this ran on. Hand it back as `sessionId` to keep a series of
   *  related asks on one session — new sessions are the metered thing. */
  sessionId: string | undefined;
};

/** Strips a ```json ... ``` (or bare ```) fence Claude sometimes wraps its answer in despite being told not to. Leaves unfenced text untouched. */
function stripCodeFence(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  return fenced ? fenced[1].trim() : text.trim();
}

export async function askClaudeForJson<T>(options: {
  /** Full prompt for the first attempt — should already tell Claude to return ONLY JSON matching your schema. */
  prompt: string;
  zodValidator: z.ZodType<T>;
  model?: string;
  /** Total attempts including the first (default 3). */
  maxAttempts?: number;
  /** Prefix for the error thrown once attempts are exhausted — pass your own domain's error message. */
  exhaustedErrorPrefix?: string;
  /** Per-attempt timeout; omitted = the `claude` op default. Long-input callers (a whole-episode ranking) need more. */
  timeoutSeconds?: number;
  /**
   * Continue an existing session instead of opening a new one. The daily budget
   * counts NEW sessions, not turns, so a caller asking the same kind of question
   * once per item — a clip's edges, say — must reuse one session across the
   * batch or it spends one of the day's allowance per item and the rest of the
   * run is refused.
   */
  sessionId?: string;
}): Promise<ASK_CLAUDE_FOR_JSON_RESULT<T>> {
  const maxAttempts = options.maxAttempts ?? 3;

  let sessionId: string | undefined = options.sessionId;
  let lastUsage: CLAUDE_USAGE | undefined;
  let lastError = "";
  let task = options.prompt;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const req = CLAUDE_ASK_REQUEST_SCHEMA.parse({
      task,
      session_id: sessionId,
      model: options.model,
      timeout_seconds: options.timeoutSeconds,
    });
    const res = await askClaude(req);

    if (!res.ok) {
      throw new Error(res.error || "Claude delegation failed");
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

    const validated = options.zodValidator.safeParse(parsed);
    if (!validated.success) {
      lastError = validated.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      task =
        `Your previous JSON did not match the required schema (${lastError}). ` +
        "Return ONLY the corrected JSON object — no markdown fences, no commentary.";
      continue;
    }

    return { data: validated.data, usage: lastUsage, attempts: attempt, sessionId };
  }

  throw new Error(
    `${options.exhaustedErrorPrefix ?? "Claude did not return valid JSON matching the schema"} after ${maxAttempts} attempts: ${lastError}`,
  );
}
