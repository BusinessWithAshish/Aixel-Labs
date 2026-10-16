import type { z } from "zod";

import {
  MEDIA_CAPTION_ROMANIZE,
  MEDIA_CAPTION_ROMANIZE_PROMPT,
  MEDIA_ERROR_MESSAGES,
  MEDIA_GEMINI_MODEL,
  MEDIA_GROQ_TEXT_MODEL,
} from "../constants";
import { generateStructuredContent, withGeminiKeyPoolRetry } from "../gemini-client";
import { generateJsonWithGroq } from "../groq-chat";
import type { GROQ_TRANSCRIPTION_WORD } from "../transcribe/types";
import { CAPTION_ROMANIZE_VALIDATOR, GEMINI_CAPTION_ROMANIZE_RESPONSE_SCHEMA } from "./schemas";

/** Any letter outside the Latin blocks (Devanagari, Arabic, …) means there is something to romanize. */
export const NON_LATIN_LETTER = /(?![ -ɏḀ-ỿ])\p{L}/u;

type RomanizedBatch = z.infer<typeof CAPTION_ROMANIZE_VALIDATOR>;

function romanizeBatchWithGroq(
  batch: Array<{ i: number; w: string }>,
  groqApiKey?: string,
): Promise<RomanizedBatch> {
  return generateJsonWithGroq({
    model: MEDIA_GROQ_TEXT_MODEL.DEFAULT,
    prompt: MEDIA_CAPTION_ROMANIZE_PROMPT + JSON.stringify(batch),
    zodValidator: CAPTION_ROMANIZE_VALIDATOR,
    apiKey: groqApiKey,
  }).then((r) => r.data);
}

async function romanizeBatchWithGemini(
  batch: Array<{ i: number; w: string }>,
  geminiApiKey?: string,
): Promise<RomanizedBatch> {
  const { data } = await withGeminiKeyPoolRetry(
    (apiKey) =>
      generateStructuredContent<RomanizedBatch>({
        model: MEDIA_GEMINI_MODEL.DEFAULT,
        parts: [{ text: MEDIA_CAPTION_ROMANIZE_PROMPT + JSON.stringify(batch) }],
        responseSchema: GEMINI_CAPTION_ROMANIZE_RESPONSE_SCHEMA,
        thinkingLevel: "minimal",
        apiKey,
        zodValidator: CAPTION_ROMANIZE_VALIDATOR,
      }),
    "caption romanize",
    geminiApiKey ? [geminiApiKey] : undefined,
  );
  return data;
}

/**
 * Romanizes one batch on Groq, falling back to the Gemini free-tier pool.
 *
 * Groq leads because the Gemini pool is a contended resource inside a single
 * clip run and romanizing is the last thing in it to ask: diarization spends
 * one call per 15-minute audio chunk and moment scoring one more, so on a
 * multi-clip day the daily quota is already exhausted when captions run and
 * the whole batch 429s. Groq is a separate quota, is already keyed for
 * Whisper here, and answers this one-word-in-one-word-out task in ~2s.
 */
async function romanizeBatch(
  batch: Array<{ i: number; w: string }>,
  groqApiKey?: string,
  geminiApiKey?: string,
): Promise<Map<number, string>> {
  let data: RomanizedBatch;
  try {
    data = await romanizeBatchWithGroq(batch, groqApiKey);
  } catch {
    data = await romanizeBatchWithGemini(batch, geminiApiKey);
  }
  return new Map(data.words.map((x) => [x.i, x.roman.trim()]));
}

/**
 * `script: "roman"` — rewrites each transcribed word in Roman script the way
 * it is typed in Hinglish ("क्या" → "kya", "सीन" → "scene"), one word in, one
 * word out, so every word keeps its own timing and the chunk/line builders
 * run unchanged.
 *
 * Whisper cannot do this itself: asked for Hindi it writes Devanagari, and
 * asked for English it translates or drops the Hindi. So the clip is
 * transcribed in its real language and small text calls (Groq, then the
 * Gemini free-tier key pool — never the Claude budget) transliterate the word
 * list in batches.
 *
 * Words go out numbered and come back numbered, so a model that merges or
 * splits one word only loses that word (it keeps its native spelling) instead
 * of shifting every word after it. Latin-script words are never sent. If too
 * few words come back, or both providers fail, the native script is kept and
 * the reason is returned — captions still render.
 */
export async function romanizeWords(
  words: GROQ_TRANSCRIPTION_WORD[],
  groqApiKey?: string,
  geminiApiKey?: string,
): Promise<{ words: GROQ_TRANSCRIPTION_WORD[]; romanized: boolean; fallbackReason?: string }> {
  const pending = words
    .map((w, i) => ({ i, w: w.word.trim() }))
    .filter(({ w }) => NON_LATIN_LETTER.test(w));
  if (pending.length === 0) {
    return { words, romanized: false };
  }

  try {
    const roman = new Map<number, string>();
    for (let b = 0; b < pending.length; b += MEDIA_CAPTION_ROMANIZE.BATCH_WORDS) {
      const got = await romanizeBatch(
        pending.slice(b, b + MEDIA_CAPTION_ROMANIZE.BATCH_WORDS),
        groqApiKey,
        geminiApiKey,
      );
      for (const [i, r] of got) if (r) roman.set(i, r);
    }
    const covered = pending.filter(({ i }) => roman.has(i)).length / pending.length;
    if (covered < MEDIA_CAPTION_ROMANIZE.MIN_COVERAGE) {
      throw new Error(`only ${Math.round(covered * 100)}% of words came back`);
    }
    return {
      words: words.map((w, i) => (roman.has(i) ? { ...w, word: roman.get(i)! } : w)),
      romanized: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      words,
      romanized: false,
      fallbackReason: `${MEDIA_ERROR_MESSAGES.CAPTION_ROMANIZE_FAILED}: ${message.slice(0, 200)}`,
    };
  }
}
