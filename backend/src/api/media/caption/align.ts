import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";
import { z } from "zod";

import { MEDIA_ALIGN, MEDIA_ERROR_MESSAGES } from "../constants";
import type { GROQ_TRANSCRIPTION_WORD } from "../transcribe/types";

const execFileAsync = promisify(execFile);

/**
 * WHEN each caption word is spoken, found from the audio itself.
 *
 * Before this the on-screen words (decided by a listener that hears well but
 * cannot time) borrowed their times from Whisper by matching spellings. On
 * Indian podcast speech barely half the words matched; the rest were spread
 * across the listener's own rough windows, and a correct Whisper match that
 * fell outside such a window was thrown away. Measured on 41 clips: about a
 * quarter of all cues more than half a second off, and whole clips running
 * eleven seconds ahead of the speaker.
 *
 * Forced alignment does not compare transcripts at all. Given the audio and
 * the words in order, an acoustic model (MMS_FA, in `backend/workers/align`)
 * finds where each word's sounds are. It needs Latin letters, which is what the
 * captions are written in; a number or a word left in another script is passed
 * as "some sound", and takes the audio between its neighbours.
 *
 * Never a reason to fail a caption: on any problem the words keep the timings
 * they came in with, and the reason is returned.
 */
const ALIGN_RESULT_SCHEMA = z.object({
  version: z.literal(1),
  words: z.array(
    z.object({
      start: z.number().nonnegative(),
      end: z.number().nonnegative(),
      score: z.number().nullable(),
    }),
  ),
});

const LATIN_LETTER = /[a-z]/i;

function workerPython(): string {
  return MEDIA_ALIGN.PYTHON_BIN || join(MEDIA_ALIGN.WORKER_DIR, ".venv", "bin", "python");
}

/**
 * The model takes over a gigabyte per run and all four cores; a batch of clips
 * captioned at once must queue for it. The caption ear (`ear.ts`) shares this
 * queue for the same reason.
 */
let queue: Promise<unknown> = Promise.resolve();

export function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

export async function alignWordsToAudio(
  audioPath: string,
  words: GROQ_TRANSCRIPTION_WORD[],
  durationSeconds: number,
): Promise<{ words: GROQ_TRANSCRIPTION_WORD[]; aligned: boolean; fallbackReason?: string }> {
  const keep = (fallbackReason: string) => ({ words, aligned: false, fallbackReason });
  if (words.length === 0) return { words, aligned: false };
  if (durationSeconds > MEDIA_ALIGN.MAX_AUDIO_SECONDS) return keep(MEDIA_ERROR_MESSAGES.ALIGN_TOO_LONG);
  const latinShare = words.filter((w) => LATIN_LETTER.test(w.word)).length / words.length;
  if (latinShare < MEDIA_ALIGN.MIN_LATIN_SHARE) return keep(MEDIA_ERROR_MESSAGES.ALIGN_NOT_LATIN);
  const python = workerPython();
  if (!existsSync(python)) return keep(MEDIA_ERROR_MESSAGES.ALIGN_WORKER_MISSING);

  const workDir = await mkdtemp(join(tmpdir(), "caption-align-"));
  try {
    const wordsPath = join(workDir, "words.json");
    const outPath = join(workDir, "timings.json");
    await writeFile(wordsPath, JSON.stringify(words.map((w) => w.word)), "utf8");
    const args = ["-m", "align", audioPath, "--words", wordsPath, "--out", outPath];
    if (ffmpegPath) args.push("--ffmpeg", ffmpegPath);
    if (MEDIA_ALIGN.MODELS_DIR) args.push("--models-dir", MEDIA_ALIGN.MODELS_DIR);

    try {
      await oneAtATime(() =>
        execFileAsync(python, args, {
          cwd: MEDIA_ALIGN.WORKER_DIR,
          timeout: MEDIA_ALIGN.WORKER_TIMEOUT_MS,
          maxBuffer: MEDIA_ALIGN.WORKER_MAX_BUFFER_BYTES,
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return keep(`${MEDIA_ERROR_MESSAGES.ALIGN_WORKER_FAILED}: ${message.slice(-300)}`);
    }

    let parsed: z.infer<typeof ALIGN_RESULT_SCHEMA>;
    try {
      parsed = ALIGN_RESULT_SCHEMA.parse(JSON.parse(await readFile(outPath, "utf8")));
    } catch {
      return keep(MEDIA_ERROR_MESSAGES.ALIGN_RESULT_INVALID);
    }
    if (parsed.words.length !== words.length) return keep(MEDIA_ERROR_MESSAGES.ALIGN_RESULT_INVALID);

    // In spoken order, never overlapping, never past the end of the clip.
    let cursor = 0;
    const timed = words.map((w, i) => {
      const start = Math.max(cursor, Math.min(parsed.words[i].start, durationSeconds));
      const end = Math.max(start + 0.05, Math.min(parsed.words[i].end, durationSeconds + 0.05));
      cursor = start;
      return { ...w, start, end };
    });
    return { words: timed, aligned: true };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
