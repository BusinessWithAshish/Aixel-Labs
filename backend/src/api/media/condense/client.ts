import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { assertPersistentDisk } from "../../../config";
import { cleanupResolvedMediaSource, resolveMediaSource } from "../source";
import { normalizeToFlac } from "../transcribe/ffmpeg";
import { transcribeWithGroq } from "../transcribe/groq-client";
import type { GROQ_TRANSCRIPTION_WORD } from "../transcribe/types";
import { assembleKeepRanges } from "./assemble";
import {
  MEDIA_CONDENSE,
  MEDIA_CONDENSE_ERROR_MESSAGES,
  MEDIA_CONDENSE_OUTPUT_DIR,
  MEDIA_CONDENSE_VERBATIM_PROMPT,
} from "./constants";
import { findFillerRanges } from "./fillers";
import {
  capRanges,
  invertToKeepRanges,
  mergeRanges,
  shrinkSilences,
  totalDuration,
} from "./ranges";
import { detectSilences } from "./silence";
import type { MEDIA_CONDENSE_REQUEST_PARSED, MEDIA_CONDENSE_RESPONSE, TIME_RANGE } from "./types";

/**
 * Extracts audio and transcribes it with word-level timestamps — the only
 * reason this module transcribes at all. Reuses `transcription/`'s ffmpeg
 * normalize (16kHz mono FLAC) and Groq client unchanged; the only additions
 * are the word-granularity flag and the verbatim decoder prompt.
 */
async function getWordTimestamps(
  sourcePath: string,
  language: string | undefined,
): Promise<GROQ_TRANSCRIPTION_WORD[]> {
  const normalized = await normalizeToFlac(sourcePath);
  try {
    const response = await transcribeWithGroq(normalized.path, {
      model: MEDIA_CONDENSE.MEDIA_TRANSCRIBE_MODEL,
      language,
      wordTimestamps: true,
      prompt: MEDIA_CONDENSE_VERBATIM_PROMPT,
    });
    if (!response.words || response.words.length === 0) {
      throw new Error(MEDIA_CONDENSE_ERROR_MESSAGES.NO_WORD_TIMESTAMPS);
    }
    return response.words;
  } finally {
    await rm(normalized.path, { force: true }).catch(() => {});
  }
}

/**
 * Resolve source (local path or URL) -> detect silences + transcribe
 * (concurrently) -> build a removal list -> invert to a keep-list -> render
 * once straight into `MEDIA_CONDENSE_OUTPUT_DIR` -> clean up temp files.
 *
 * The silence scan and the transcription are both full passes over the same
 * source and neither depends on the other, so they run concurrently — on a
 * long recording that's close to halving the pre-render time.
 *
 * A local-path source is never touched (`resolveMediaSource` reads it in
 * place — the expected case when Hermes and this backend share the VPS's
 * filesystem); a downloaded URL source lives inside the resolved work dir and
 * is cleaned up with it. Either way condensing is a knob-tuning operation —
 * re-running it with a different threshold shouldn't require re-fetching the
 * video — so nothing about the INPUT is ever deleted by this function beyond
 * its own temp download.
 */
export async function condenseVideo(
  request: MEDIA_CONDENSE_REQUEST_PARSED,
): Promise<MEDIA_CONDENSE_RESPONSE> {
  assertPersistentDisk(MEDIA_CONDENSE_ERROR_MESSAGES.VERCEL);
  const {
    videoSource,
    silenceThresholdDb,
    minSilenceSeconds,
    keepPaddingSeconds,
    removeFillers,
    fillerWords,
    language,
  } = request;

  const resolved = await resolveMediaSource(videoSource);
  const sourcePath = resolved.path;

  try {
    const [scan, words] = await Promise.all([
      detectSilences(sourcePath, silenceThresholdDb, minSilenceSeconds),
      removeFillers
        ? getWordTimestamps(sourcePath, language)
        : Promise.resolve<GROQ_TRANSCRIPTION_WORD[]>([]),
    ]);

    const silenceRemovals = shrinkSilences(scan.silences, keepPaddingSeconds);
    const fillerRemovals: TIME_RANGE[] = removeFillers
      ? findFillerRanges(words, fillerWords)
      : [];

    const merged = mergeRanges([...silenceRemovals, ...fillerRemovals]);
    const { ranges: removals, droppedCount } = capRanges(merged);
    const keeps = invertToKeepRanges(removals, scan.durationSeconds);

    try {
      await mkdir(MEDIA_CONDENSE_OUTPUT_DIR, { recursive: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${MEDIA_CONDENSE_ERROR_MESSAGES.OUTPUT_WRITE_FAILED}: ${message}`);
    }
    // A render failure here is ffmpeg's own error (`assembleKeepRanges` already
    // attaches its stderr detail) — let it propagate unwrapped rather than
    // relabeling it as an output-write failure it isn't.
    const mediaType: "video" | "audio" = scan.hasVideo ? "video" : "audio";
    const mediaPath = join(
      MEDIA_CONDENSE_OUTPUT_DIR,
      `condensed-${randomUUID()}.${mediaType === "video" ? "mp4" : "m4a"}`,
    );
    await assembleKeepRanges(sourcePath, keeps, mediaPath, scan.hasVideo);

    const outputDurationSeconds = totalDuration(keeps);
    const removedSeconds = scan.durationSeconds - outputDurationSeconds;

    return {
      mediaPath,
      mediaType,
      sourceDurationSeconds: scan.durationSeconds,
      outputDurationSeconds,
      removedSeconds,
      removedFraction:
        scan.durationSeconds > 0 ? removedSeconds / scan.durationSeconds : 0,
      cutCount: removals.length,
      silenceCutCount: silenceRemovals.length,
      fillerCutCount: fillerRemovals.length,
      ...(droppedCount > 0 ? { droppedCutCount: droppedCount } : {}),
    };
  } finally {
    await cleanupResolvedMediaSource(resolved);
  }
}
