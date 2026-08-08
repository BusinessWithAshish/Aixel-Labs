import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import { TRANSCRIPTION, TRANSCRIPTION_ERROR_MESSAGES } from "./constants";

const execFileAsync = promisify(execFile);

export type NormalizedAudio = {
  path: string;
  sizeBytes: number;
};

/**
 * Extracts + downsamples any video/audio input into 16kHz mono FLAC.
 * `-vn` drops any video stream (a no-op for audio-only input), so this one
 * command handles both cases — no need to detect the input type first.
 * Lossless relative to what Groq does internally (it downsamples to 16kHz
 * mono anyway), while cutting file size ~5-10x vs raw/WAV.
 */
export async function normalizeToFlac(inputPath: string): Promise<NormalizedAudio> {
  if (!ffmpegPath) {
    throw new Error(TRANSCRIPTION_ERROR_MESSAGES.FFMPEG_FAILED);
  }

  const outputPath = join(dirname(inputPath), "normalized.flac");

  try {
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      String(TRANSCRIPTION.TARGET_CHANNELS),
      "-ar",
      String(TRANSCRIPTION.TARGET_SAMPLE_RATE_HZ),
      "-c:a",
      "flac",
      outputPath,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${TRANSCRIPTION_ERROR_MESSAGES.FFMPEG_FAILED}: ${message}`);
  }

  const { size } = await stat(outputPath);
  return { path: outputPath, sizeBytes: size };
}
