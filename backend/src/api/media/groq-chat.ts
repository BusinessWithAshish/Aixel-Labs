import { Agent } from "undici";
import type { z } from "zod";

import { MEDIA, MEDIA_ERROR_MESSAGES } from "./constants";
import { GROQ_CHAT_COMPLETIONS_URL, MEDIA_TRANSCRIBE_ERROR_MESSAGES } from "./transcribe/constants";
import type { GROQ_CHAT_USAGE } from "./types";

/**
 * Groq's OpenAI-compatible chat endpoint, for the project's small
 * structured-text calls — the sibling of `gemini-client.ts`.
 *
 * Why this exists next to the Gemini client rather than everything going
 * through one pool: the Gemini free tier is a single contended resource that
 * the audio-shaped work (diarization uploads, moment scoring) already
 * saturates, and it fails in two ways this project actually hits — 429 when
 * the daily quota is spent and 503 when the model is simply overloaded,
 * which no number of extra keys fixes. Groq is a separate quota this repo
 * already holds a key for (Whisper), so the cheap text tasks that were
 * losing the race for Gemini capacity run here instead.
 *
 * Groq has no `responseSchema` equivalent, so callers ask for JSON in the
 * prompt and `json_object` mode guarantees the reply PARSES — never that it
 * has the right shape. The `zodValidator` is therefore required, not
 * optional as it is on the Gemini side.
 */

/** Same budget as the module's other outgoing clients — see `gemini-client.ts`. */
const GROQ_CHAT_DISPATCHER = new Agent({
  headersTimeout: MEDIA.OUTBOUND_FETCH_TIMEOUT_MS,
  bodyTimeout: MEDIA.OUTBOUND_FETCH_TIMEOUT_MS,
});

/** See the matching note in `gemini-client.ts` — avoids the ambient `Response`/`RequestInit` names. */
type FetchResponseLike = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

/** Calls Groq chat completions in JSON mode and returns the parsed + validated object + usage. */
export async function generateJsonWithGroq<T>(options: {
  model: string;
  prompt: string;
  zodValidator: z.ZodType<T>;
  /** 0 by default — these are labelling/rewriting tasks, not creative ones. */
  temperature?: number;
  /** A channel's own Groq key (see `channel-keys.ts`) — falls back to `GROQ_API_KEY` when omitted. */
  apiKey?: string;
}): Promise<{ data: T; usage: GROQ_CHAT_USAGE }> {
  const apiKey = options.apiKey || process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(MEDIA_TRANSCRIBE_ERROR_MESSAGES.MISSING_API_KEY);
  }

  const res = (await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: options.model,
      messages: [{ role: "user", content: options.prompt }],
      response_format: { type: "json_object" },
      temperature: options.temperature ?? 0,
    }),
    dispatcher: GROQ_CHAT_DISPATCHER,
  } as unknown as RequestInit)) as unknown as FetchResponseLike;

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${MEDIA_ERROR_MESSAGES.GROQ_CHAT_FAILED}: ${res.status} ${body.slice(0, 200)}`,
    );
  }

  const completion = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: GROQ_CHAT_USAGE;
  };
  const choice = completion.choices?.[0];
  const text = choice?.message?.content;
  if (!text) {
    throw new Error(MEDIA_ERROR_MESSAGES.GROQ_CHAT_EMPTY);
  }
  // A reply cut off at the token ceiling can still parse as JSON (the decoder
  // closes open structures), so a truncated label set would look complete —
  // same trap `generateStructuredContent` guards with its finishReason check.
  if (choice.finish_reason && choice.finish_reason !== "stop") {
    throw new Error(
      `${MEDIA_ERROR_MESSAGES.GROQ_CHAT_TRUNCATED}: finish_reason=${choice.finish_reason}`,
    );
  }

  const result = options.zodValidator.safeParse(JSON.parse(text));
  if (!result.success) {
    throw new Error(`${MEDIA_ERROR_MESSAGES.GROQ_CHAT_MALFORMED}: ${result.error.message}`);
  }
  return { data: result.data, usage: completion.usage ?? {} };
}
