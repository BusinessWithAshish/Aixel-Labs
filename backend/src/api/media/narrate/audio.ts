import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import { MEDIA_NARRATE_ERRORS } from "./constants";

const execFileAsync = promisify(execFile);

/** Three decimals: the precision every narration time (to the millisecond) and share is reported at. */
export const round3 = (value: number) => Math.round(value * 1000) / 1000;

export async function runFfmpeg(args: string[], failure: string): Promise<void> {
  if (!ffmpegPath) throw new Error(failure);
  try {
    await execFileAsync(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", ...args]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${failure}: ${message}`);
  }
}

/**
 * Writes engine audio as a well-formed 16-bit PCM WAV. Kokoro's WAV header
 * claims 2^31 frames (it is written before the length is known), which breaks
 * every reader that trusts it; re-muxing through ffmpeg writes a real header.
 * Gemini sends a WAV (24 kHz mono 16-bit); raw PCM is accepted too, in case the
 * stream form is ever returned.
 */
export async function remuxWav(audio: Buffer, outputPath: string): Promise<void> {
  const rawPath = `${outputPath}.raw.wav`;
  await writeFile(rawPath, audio);
  const isWav = audio.subarray(0, 4).toString("ascii") === "RIFF";
  try {
    await runFfmpeg(
      [...(isWav ? [] : ["-f", "s16le", "-ar", "24000", "-ac", "1"]), "-i", rawPath, "-c:a", "pcm_s16le", outputPath],
      MEDIA_NARRATE_ERRORS.FFMPEG_FAILED,
    );
  } finally {
    await rm(rawPath, { force: true });
  }
}

/** Duration from a well-formed PCM WAV: data-chunk bytes over bytes per second. */
export async function wavSeconds(path: string): Promise<number> {
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
