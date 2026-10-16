import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { MEDIA_ASR, MEDIA_ERROR_MESSAGES } from "../constants";
import { oneAtATime } from "./align";

const execFileAsync = promisify(execFile);

/**
 * `listener: "apex"` — the caption ear that runs on this host.
 *
 * Oriserve's Whisper-Hindi2Hinglish-Apex: Whisper large-v3-turbo fine-tuned on
 * Indian code-mixed speech to write what it hears in Roman script, without
 * translating. whisper.cpp runs it at Q8_0 on the CPU, about 40 s for a 60 s
 * clip. Measured on ten real clips against Gemini's transcripts: 18% of words
 * different, against 22% for Groq Whisper with a Claude judge and 44% for the
 * Whisper-only fallback that shipped garbled captions on 2026-10-13. Gemini is
 * still the better ear (two Gemini models differ by ~11%), but its free tier
 * allows 20 requests a day per model and runs out mid-batch; this never does.
 *
 * Its spelling is a transliteration ("hamaare oopar", "sirph"), not the way
 * people type; `editor.ts` turns that into everyday Roman Hinglish.
 *
 * `-l en` is what makes it write Roman script (the fine-tune's training
 * targets). `-mc 0` stops a window being primed with the previous window's
 * text, which is how Whisper invents a fluent tail at the end of a clip.
 */
export async function hearWithApex(audioPath: string): Promise<string> {
  const bin = MEDIA_ASR.BIN || join(MEDIA_ASR.WORKER_DIR, "whisper.cpp", "build", "bin", "whisper-cli");
  const model = MEDIA_ASR.MODEL || join(MEDIA_ASR.WORKER_DIR, "models", "apex-q8_0.bin");
  if (!existsSync(bin) || !existsSync(model)) throw new Error(MEDIA_ERROR_MESSAGES.ASR_WORKER_MISSING);

  const args = ["-m", model, "-f", audioPath, "-t", String(MEDIA_ASR.THREADS), "-l", "en", "-bs", "1", "-bo", "1", "-mc", "0", "-nt", "-np"];
  let stdout: string;
  try {
    ({ stdout } = await oneAtATime(() =>
      execFileAsync(bin, args, { timeout: MEDIA_ASR.TIMEOUT_MS, maxBuffer: MEDIA_ASR.MAX_BUFFER_BYTES }),
    ));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${MEDIA_ERROR_MESSAGES.ASR_FAILED}: ${message.slice(-300)}`);
  }
  const text = dropLoops(stdout.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim());
  if (!text) throw new Error(MEDIA_ERROR_MESSAGES.ASR_EMPTY);
  return text;
}

/**
 * Whisper's signature failure on a hard stretch is a loop: the same phrase
 * three, five, ten times. Nobody says a phrase three times running, so from
 * the third repeat on it goes. Two is left alone ("nahi nahi" is real speech).
 */
export function dropLoops(text: string): string {
  const words = text.split(" ");
  for (let size = 1; size <= 6; size++) {
    for (let i = 0; i + size * 3 <= words.length; ) {
      const key = (k: number) => words.slice(k, k + size).join(" ").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "");
      let repeats = 1;
      while (i + size * (repeats + 1) <= words.length && key(i + size * repeats) === key(i)) repeats++;
      if (repeats >= 3) {
        words.splice(i + size * 2, size * (repeats - 2));
      }
      i++;
    }
  }
  return words.join(" ");
}
