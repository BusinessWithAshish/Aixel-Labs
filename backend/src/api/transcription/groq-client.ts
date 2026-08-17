import { openAsBlob } from "node:fs";
import { basename } from "node:path";

import { GROQ_TRANSCRIPTIONS_URL, TRANSCRIPTION_ERROR_MESSAGES } from "./constants";
import type {
  GROQ_VERBOSE_JSON_RESPONSE,
  TRANSCRIPTION_MODEL_VALUE,
} from "./types";

export type GroqTranscribeOptions = {
  model: TRANSCRIPTION_MODEL_VALUE;
  language?: string;
  /**
   * Ask for per-word start/end times (`verbose_json.words`) on top of the
   * usual segments. Off by default — plain transcription has no use for them
   * and they inflate the response — but required by anything that edits on
   * word boundaries (`tightening/`).
   */
  wordTimestamps?: boolean;
  /**
   * Whisper's decoder prompt. Whisper is trained to emit *clean* prose and
   * silently drops disfluencies ("um", "uh") from its output, so a caller that
   * needs to find those words must bias the decode toward verbatim by seeding
   * this with a disfluency-heavy sample. See `TIGHTENING.VERBATIM_PROMPT`.
   */
  prompt?: string;
};

/**
 * Local shape for the bits of `fetch()`'s result we actually use — see the
 * matching note in `download.ts` for why this avoids the ambient `Response`
 * name (multiple conflicting `@types/node` versions in this monorepo's
 * dependency graph have caused it to resolve incomplete during Vercel builds).
 */
type FetchResponseLike = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

/** Calls Groq's `/audio/transcriptions` with `response_format: verbose_json` — the only
 * format that returns segment timestamps, which we need to build srt/vtt ourselves
 * (Groq has no native srt/vtt output). */
export async function transcribeWithGroq(
  filePath: string,
  { model, language, wordTimestamps, prompt }: GroqTranscribeOptions,
): Promise<GROQ_VERBOSE_JSON_RESPONSE> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(TRANSCRIPTION_ERROR_MESSAGES.MISSING_API_KEY);
  }

  const fileBlob = await openAsBlob(filePath);

  const form = new FormData();
  form.set("file", fileBlob, basename(filePath));
  form.set("model", model);
  form.set("response_format", "verbose_json");
  form.set("temperature", "0");
  if (language) form.set("language", language);
  if (prompt) form.set("prompt", prompt);
  /**
   * Repeated `timestamp_granularities[]` fields (not one comma-joined value) —
   * this is an array field in Groq's OpenAI-compatible multipart API. `segment`
   * is requested alongside `word` because asking for `word` alone makes the API
   * stop returning segments, which the srt/vtt formatters still need.
   */
  if (wordTimestamps) {
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
  }

  const res = (await fetch(GROQ_TRANSCRIPTIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })) as unknown as FetchResponseLike;

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${TRANSCRIPTION_ERROR_MESSAGES.GROQ_FAILED}: ${res.status} ${body}`,
    );
  }

  return (await res.json()) as GROQ_VERBOSE_JSON_RESPONSE;
}
