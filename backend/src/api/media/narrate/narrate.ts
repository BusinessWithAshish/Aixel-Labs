import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import { assertPersistentDisk } from "../../../config";
import { AIXEL_MEDIA } from "../../../media";
import { MEDIA_ERROR_MESSAGES } from "../constants";
import { MEDIA_NARRATE, MEDIA_NARRATE_ERRORS } from "./constants";
import { buildPhrases, prepareText } from "./markup";
import type { MEDIA_NARRATE_REQUEST, MEDIA_NARRATE_RESPONSE, NARRATE_WORD } from "./types";

const execFileAsync = promisify(execFile);

type KOKORO_CAPTIONED = {
  audio?: string;
  timestamps?: { word: string; start_time: number; end_time: number }[];
};

/** Synthesis already uses most of the box; calls wait their turn rather than fight. */
let queue: Promise<unknown> = Promise.resolve();
let inFlight = 0;
function serialised<T>(job: () => Promise<T>): Promise<T> {
  inFlight++;
  const run = queue.then(job, job);
  queue = run.catch(() => undefined).finally(() => {
    inFlight--;
  });
  return run;
}
export const narrateQueueDepth = () => inFlight;

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
      start: Math.round(t.start_time * 1000) / 1000,
      end: Math.round(t.end_time * 1000) / 1000,
    })),
  };
}

/**
 * The engine's WAV header claims 2^31 frames (it is written before the length
 * is known), which breaks every reader that trusts it. Re-muxing through
 * ffmpeg writes a real header.
 */
async function repairWav(raw: Buffer, outputPath: string): Promise<void> {
  if (!ffmpegPath) throw new Error(MEDIA_NARRATE_ERRORS.FFMPEG_FAILED);
  const rawPath = `${outputPath}.raw.wav`;
  await writeFile(rawPath, raw);
  try {
    await execFileAsync(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", "-i", rawPath, "-c:a", "pcm_s16le", outputPath]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${MEDIA_NARRATE_ERRORS.FFMPEG_FAILED}: ${message}`);
  } finally {
    await rm(rawPath, { force: true });
  }
}

/** Duration from a well-formed PCM WAV: data-chunk bytes over bytes per second. */
async function wavSeconds(path: string): Promise<number> {
  const buffer = await readFile(path);
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "data") return size / (sampleRate * channels * (bitsPerSample / 8));
    offset += 8 + size + (size % 2);
  }
  throw new Error(MEDIA_NARRATE_ERRORS.ENGINE_EMPTY);
}

/**
 * Text in, narration audio and word timings out. Not a pipeline: it voices one
 * sentence (or short beat) and says where every word lands, which is what
 * footage matching and captions are built from.
 */
export async function narrate(input: MEDIA_NARRATE_REQUEST): Promise<MEDIA_NARRATE_RESPONSE> {
  assertPersistentDisk(MEDIA_ERROR_MESSAGES.VERCEL);
  const prepared = prepareText(input.text, input.pronunciations);
  if (!prepared.spokenText) throw new Error(MEDIA_NARRATE_ERRORS.EMPTY_TEXT);

  const { wav, words } = await serialised(() =>
    synthesise(prepared.engineInput, input.voice, input.speed, input.language, prepared.usesVoiceTags),
  );

  await mkdir(AIXEL_MEDIA.MEDIA_NARRATION, { recursive: true });
  const audioPath = join(AIXEL_MEDIA.MEDIA_NARRATION, `narration-${randomUUID()}.wav`);
  await repairWav(wav, audioPath);
  const durationSeconds = Math.round((await wavSeconds(audioPath)) * 1000) / 1000;

  return {
    audioPath,
    durationSeconds,
    provider: input.provider,
    voice: input.voice,
    speed: input.speed,
    spokenText: prepared.spokenText,
    words,
    phrases: buildPhrases(words, prepared.spokenText, durationSeconds),
  };
}
