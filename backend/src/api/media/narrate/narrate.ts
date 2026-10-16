import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { assertPersistentDisk } from "../../../config";
import { AIXEL_MEDIA } from "../../../media";
import { MEDIA_ERROR_MESSAGES } from "../constants";
import { remuxWav, round3, wavSeconds } from "./audio";
import { MEDIA_NARRATE, MEDIA_NARRATE_ERRORS } from "./constants";
import { narrateWithGemini } from "./gemini";
import { buildPhrases, prepareText } from "./markup";
import type { MEDIA_NARRATE_REQUEST, MEDIA_NARRATE_RESPONSE, NARRATE_WORD } from "./types";

type KOKORO_CAPTIONED = {
  audio?: string;
  timestamps?: { word: string; start_time: number; end_time: number }[];
};

/** Synthesis already uses most of the box; calls wait their turn rather than fight. */
let queue: Promise<unknown> = Promise.resolve();
function serialised<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

async function synthesise(
  engineInput: string,
  voice: string,
  speed: number,
  language: string,
  usesVoiceTags: boolean,
): Promise<{ wav: Buffer; words: NARRATE_WORD[] }> {
  let response: Response;
  try {
    response = await fetch(`${MEDIA_NARRATE.KOKORO_URL}/dev/captioned_speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kokoro",
        input: engineInput,
        voice,
        speed,
        response_format: "wav",
        lang_code: MEDIA_NARRATE.LANG_CODE[language] ?? MEDIA_NARRATE.LANG_CODE[MEDIA_NARRATE.DEFAULT_LANGUAGE],
        stream: false,
        allow_voice_tags: usesVoiceTags,
      }),
      signal: AbortSignal.timeout(MEDIA_NARRATE.REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${MEDIA_NARRATE_ERRORS.ENGINE_UNREACHABLE} (${message})`);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`${MEDIA_NARRATE_ERRORS.ENGINE_FAILED}: HTTP ${response.status} ${detail}`);
  }
  const body = (await response.json()) as KOKORO_CAPTIONED;
  if (!body.audio) throw new Error(MEDIA_NARRATE_ERRORS.ENGINE_EMPTY);
  return {
    wav: Buffer.from(body.audio, "base64"),
    words: (body.timestamps ?? []).map((t) => ({
      word: t.word,
      start: round3(t.start_time),
      end: round3(t.end_time),
    })),
  };
}

/**
 * Text in, narration audio and word timings out. Not a pipeline: it voices the
 * text (kokoro: one sentence or short beat; gemini: a whole script, also cut
 * into sentences) and says where every word lands, which is what footage
 * matching and captions are built from.
 */
export async function narrate(input: MEDIA_NARRATE_REQUEST): Promise<MEDIA_NARRATE_RESPONSE> {
  assertPersistentDisk(MEDIA_ERROR_MESSAGES.VERCEL);
  if (input.provider === "gemini") return narrateWithGemini(input);

  const prepared = prepareText(input.text, input.pronunciations);
  if (!prepared.spokenText) throw new Error(MEDIA_NARRATE_ERRORS.EMPTY_TEXT);
  const voice = input.voice ?? MEDIA_NARRATE.DEFAULT_VOICE;

  const { wav, words } = await serialised(() =>
    synthesise(prepared.engineInput, voice, input.speed, input.language, prepared.usesVoiceTags),
  );

  await mkdir(AIXEL_MEDIA.MEDIA_NARRATION, { recursive: true });
  const audioPath = join(AIXEL_MEDIA.MEDIA_NARRATION, `narration-${randomUUID()}.wav`);
  await remuxWav(wav, audioPath);
  const durationSeconds = round3(await wavSeconds(audioPath));

  // Respelling swaps words one for one, so the engine's words line up with
  // what the caller wrote: show that, speak the respelling.
  const shown =
    words.length === prepared.displayTokens.length
      ? words.map((word, i) => ({ ...word, word: prepared.displayTokens[i] }))
      : words;

  return {
    audioPath,
    durationSeconds,
    provider: input.provider,
    voice,
    speed: input.speed,
    spokenText: prepared.spokenText,
    respelled: prepared.respelled,
    words: shown,
    phrases: buildPhrases(shown, prepared.spokenText, durationSeconds),
  };
}
