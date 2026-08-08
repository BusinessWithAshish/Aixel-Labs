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
};

/** Calls Groq's `/audio/transcriptions` with `response_format: verbose_json` — the only
 * format that returns segment timestamps, which we need to build srt/vtt ourselves
 * (Groq has no native srt/vtt output). */
export async function transcribeWithGroq(
  filePath: string,
  { model, language }: GroqTranscribeOptions,
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

  const res = await fetch(GROQ_TRANSCRIPTIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${TRANSCRIPTION_ERROR_MESSAGES.GROQ_FAILED}: ${res.status} ${body}`,
    );
  }

  return (await res.json()) as GROQ_VERBOSE_JSON_RESPONSE;
}
