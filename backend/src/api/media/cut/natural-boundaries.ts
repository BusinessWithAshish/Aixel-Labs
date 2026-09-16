import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import { MEDIA_ERROR_MESSAGES, MEDIA_NATURAL_BOUNDARIES as NB } from "../constants";
import { MEDIA_TRANSCRIBE } from "../transcribe/constants";
import { dropUnreliableSpans } from "../transcribe/formatters";
import { transcribeWithGroq } from "../transcribe/groq-client";
import type { GROQ_TRANSCRIPTION_SEGMENT, GROQ_TRANSCRIPTION_WORD } from "../transcribe/types";
import type { CUT_CLIP_BOUNDARIES } from "../types";

const execFileAsync = promisify(execFile);

/** A word that closes a sentence. `।` is the Devanagari full stop. */
const SENTENCE_END = /[.?!।]["'”’)]*$/;

/** Seconds, relative to the start of the analysed window. */
export type NATURAL_RANGE = {
  start: number;
  end: number;
  endReason: CUT_CLIP_BOUNDARIES["endReason"];
};

type PLAN_INPUT = {
  requestedStart: number;
  requestedEnd: number;
  windowSeconds: number;
  words: GROQ_TRANSCRIPTION_WORD[];
  segments: GROQ_TRANSCRIPTION_SEGMENT[];
  /** dBFS per `NB.FRAME_SECONDS`. */
  loudnessDb: number[];
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return -120;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/**
 * Pure: re-places a requested range on the natural stops of its audio.
 *
 * - **Start** moves to the start of the word it splits, or to the nearest
 *   speech onset after a pause close by.
 * - **End** moves to the natural stop near the requested end (a few seconds
 *   either side) that looks most like an ending — quiet or a reaction after
 *   it, not too far away, later costing more than earlier — then keeps that
 *   loud, word-free reaction (laughter, applause) until it quiets, never into
 *   the next word.
 *
 * Words Whisper likely invented (inside a no-speech or looping segment, or
 * smeared over seconds) are ignored, because music and applause are exactly
 * where it hallucinates.
 */
export function planNaturalRange(input: PLAN_INPUT): NATURAL_RANGE {
  const { requestedStart: rs, requestedEnd: re, windowSeconds, loudnessDb } = input;
  const reliable = dropUnreliableSpans(input.segments, input.words);
  const words = reliable.words
    .filter((w) => w.end > w.start && w.end - w.start <= NB.MAX_WORD_SECONDS)
    .sort((a, b) => a.start - b.start);
  const unchanged: NATURAL_RANGE = { start: rs, end: re, endReason: "unchanged" };
  if (words.length === 0) return unchanged;
  const phraseEnds = reliable.segments.map((s) => s.end);

  const gapBefore = (i: number) => (i === 0 ? Infinity : words[i].start - words[i - 1].end);
  const gapAfter = (i: number) =>
    i + 1 < words.length ? words[i + 1].start - words[i].end : Infinity;
  // Whisper word timings run back to back through fast speech, so a clear gap
  // is not the only stop: a sentence-ending word, or the end of one of
  // Whisper's own phrases, counts too — but only with at least a breath after
  // it. Without one the speaker is running straight on, and a cut there opens
  // the next sentence ("…close to you. Now").
  const isStop = (i: number) =>
    gapAfter(i) >= NB.PAUSE_MIN_SECONDS ||
    (gapAfter(i) >= NB.PHRASE_PAUSE_MIN_SECONDS &&
      (SENTENCE_END.test(words[i].word.trim()) ||
        phraseEnds.some((t) => Math.abs(t - words[i].end) <= NB.PHRASE_END_TOLERANCE_SECONDS)));

  // ---- start ----
  let start = rs;
  const splitAtStart = words.find((w) => w.start < rs && rs < w.end);
  if (splitAtStart) {
    start = splitAtStart.start;
  } else {
    const onsets = words.filter(
      (w, i) =>
        gapBefore(i) >= NB.ONSET_MIN_GAP_SECONDS &&
        w.start >= rs - NB.START_SEARCH_BEFORE_SECONDS &&
        w.start <= rs + NB.START_SEARCH_AFTER_SECONDS,
    );
    if (onsets.length > 0) {
      start = onsets.reduce((a, b) => (Math.abs(b.start - rs) < Math.abs(a.start - rs) ? b : a)).start;
    }
  }
  start = Math.max(0, start - NB.LEAD_SECONDS);

  // ---- end ----
  const noiseFloor = percentile(loudnessDb, NB.NOISE_FLOOR_PERCENTILE);
  /** Where the loud, word-free reaction after `t` dies down (at most `limit`). */
  const reactionEndAfter = (t0: number, limit: number): number => {
    let t = t0;
    let quiet = 0;
    while (t < limit) {
      const db = loudnessDb[Math.floor(t / NB.FRAME_SECONDS)] ?? -120;
      quiet = db > noiseFloor + NB.REACTION_DB_ABOVE_FLOOR ? 0 : quiet + NB.FRAME_SECONDS;
      if (quiet >= NB.QUIET_HOLD_SECONDS) break;
      t += NB.FRAME_SECONDS;
    }
    return Math.max(t0, t - quiet);
  };

  // Every stop near the requested end, scored on how much it looks like an
  // ending: quiet after it, a reaction after it, and closeness to the
  // requested end. A punchline wins over a breath inside the next sentence.
  const candidates = words
    .map((w, i) => ({ t: w.end, i }))
    .filter(
      ({ t, i }) =>
        isStop(i) &&
        t >= re - NB.END_SEARCH_BEFORE_SECONDS &&
        t <= re + NB.END_SEARCH_AFTER_SECONDS &&
        t > start + 1,
    )
    .map(({ t, i }) => {
      const nextWordStart = words[i + 1]?.start ?? windowSeconds;
      const reactionEnd = reactionEndAfter(
        t,
        Math.min(nextWordStart - NB.NEXT_WORD_GUARD_SECONDS, t + NB.REACTION_MAX_SECONDS, windowSeconds),
      );
      // Later costs more than earlier: past the requested end is where the
      // next thing (another sentence, a song) begins — and every word spoken
      // between the requested end and this stop is live speech the clip would
      // run through, so it costs extra. Without that, a punchline someone
      // talks straight over lost to a pause two sentences later.
      const wordsCrossed = t > re ? words.filter((w) => w.start > re && w.start < t).length : 0;
      const distancePenalty =
        t > re
          ? NB.END_PENALTY_AFTER_PER_SECOND * (t - re) + NB.END_PENALTY_PER_WORD_CROSSED * wordsCrossed
          : NB.END_PENALTY_BEFORE_PER_SECOND * (re - t);
      const score =
        Math.min(nextWordStart - t, NB.END_GAP_SCORE_CAP_SECONDS) + (reactionEnd - t) - distancePenalty;
      return { t, nextWordStart, reactionEnd, score };
    });
  if (candidates.length === 0) {
    // No stop in reach: keep the requested end (never mid-word), but still
    // keep a reaction right after it — applause often has no words at all.
    const splitAtEnd = words.find((w) => w.start < re && re < w.end);
    const floor = splitAtEnd ? splitAtEnd.end : re;
    const nextWordStart = words.find((w) => w.start >= floor)?.start ?? windowSeconds;
    const reactionEnd = reactionEndAfter(
      floor,
      Math.min(nextWordStart - NB.NEXT_WORD_GUARD_SECONDS, floor + NB.REACTION_MAX_SECONDS, windowSeconds),
    );
    return {
      start,
      end: Math.max(
        floor,
        Math.min(reactionEnd + NB.TAIL_PAD_SECONDS, nextWordStart - NB.NEXT_WORD_GUARD_SECONDS, windowSeconds),
      ),
      endReason: reactionEnd - floor >= NB.REACTION_MIN_SECONDS ? "reaction" : "unchanged",
    };
  }
  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
  const end = Math.max(
    best.t,
    Math.min(
      best.reactionEnd + NB.TAIL_PAD_SECONDS,
      best.nextWordStart - NB.NEXT_WORD_GUARD_SECONDS,
      windowSeconds,
    ),
  );
  if (end - start < 1) return unchanged;
  return {
    start,
    end,
    endReason: best.reactionEnd - best.t >= NB.REACTION_MIN_SECONDS ? "reaction" : "pause",
  };
}

function selfCheck(): void {
  const frames = (seconds: number, db: number) =>
    Array.from({ length: Math.round(seconds / NB.FRAME_SECONDS) }, () => db);
  // "This is the setup." … "Here is the punchline." <laughter> … "Next thought."
  const words: GROQ_TRANSCRIPTION_WORD[] = [
    { word: "This", start: 0, end: 0.3 },
    { word: "is", start: 0.3, end: 0.6 },
    { word: "the", start: 0.6, end: 0.9 },
    { word: "setup.", start: 0.9, end: 1.4 },
    { word: "Here", start: 2, end: 2.4 },
    { word: "is", start: 2.4, end: 2.7 },
    { word: "the", start: 2.7, end: 3 },
    { word: "punchline.", start: 3, end: 5 },
    { word: "Next", start: 8, end: 8.4 },
    { word: "thought.", start: 8.4, end: 9 },
  ];
  const segments: GROQ_TRANSCRIPTION_SEGMENT[] = [
    { id: 0, start: 0, end: 1.4, text: "This is the setup." },
    { id: 1, start: 2, end: 5, text: "Here is the punchline." },
    { id: 2, start: 8, end: 9, text: "Next thought." },
  ];
  const base = { requestedStart: 0.5, requestedEnd: 5.6, windowSeconds: 10, words, segments };
  const quiet = frames(10, -40);

  // The requested start splits "is"; the requested end is a second past the
  // punchline, and laughter runs from 5.0 to 6.5.
  const laughed = planNaturalRange({
    ...base,
    loudnessDb: [...frames(5, -40), ...frames(1.5, -10), ...frames(3.5, -40)],
  });
  if (Math.abs(laughed.start - (0.3 - NB.LEAD_SECONDS)) > 0.001) {
    throw new Error(`start should open on "is" at 0.3, got ${laughed.start}`);
  }
  if (laughed.endReason !== "reaction" || laughed.end < 6.4 || laughed.end > 7) {
    throw new Error(`end should keep the laugh (~6.7, "reaction"), got ${laughed.end} (${laughed.endReason})`);
  }
  if (laughed.end >= words[8].start) throw new Error("end must stay clear of the next sentence");

  // Same clip without the laugh: the end falls back to the punchline's stop,
  // not the requested 5.6 inside the silence after it.
  const silent = planNaturalRange({ ...base, loudnessDb: quiet });
  if (silent.endReason !== "pause" || silent.end > 5.3) {
    throw new Error(`end should land on the stop at 5.0, got ${silent.end} (${silent.endReason})`);
  }

  // Every segment flagged as invented: nothing is trustworthy, keep the request.
  const hallucinated = planNaturalRange({
    ...base,
    segments: segments.map((s) => ({ ...s, no_speech_prob: 0.9 })),
    loudnessDb: quiet,
  });
  if (hallucinated.endReason !== "unchanged" || hallucinated.start !== 0.5) {
    throw new Error("words inside no-speech segments must not move an edge");
  }
}

if (require.main === module) {
  selfCheck();
  console.log("natural-boundaries self-check ok");
}

/** Mono 16 kHz loudness in dBFS, one value per `NB.FRAME_SECONDS`. */
async function loudnessFrames(path: string): Promise<number[]> {
  const { stdout } = await execFileAsync(
    ffmpegPath!,
    ["-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
    { encoding: "buffer", maxBuffer: NB.MAX_PCM_BYTES },
  );
  const perFrame = Math.round(16000 * NB.FRAME_SECONDS);
  const frames: number[] = [];
  for (let offset = 0; offset + perFrame * 2 <= stdout.length; offset += perFrame * 2) {
    let sum = 0;
    for (let i = 0; i < perFrame; i += 1) {
      const v = stdout.readInt16LE(offset + i * 2) / 32768;
      sum += v * v;
    }
    frames.push(20 * Math.log10(Math.sqrt(sum / perFrame) + 1e-6));
  }
  return frames;
}

/**
 * Plans natural edges for `windowPath`, an unframed cut that runs from
 * `requestedStart - WINDOW_BEFORE` to `requestedEnd + WINDOW_AFTER`. Times in
 * and out are relative to that file. Any failure (no audio, Groq down) keeps
 * the requested range and says why — a clip never fails here.
 */
export async function findNaturalRange(
  windowPath: string,
  requestedStart: number,
  requestedEnd: number,
  windowSeconds: number,
  /** Spoken language hint (ISO 639-1). Auto-detect hears short Hinglish windows as English and drops the Hindi words, which then read as "reaction". */
  language?: string,
): Promise<NATURAL_RANGE & { fallbackReason?: string }> {
  if (!ffmpegPath) {
    return { start: requestedStart, end: requestedEnd, endReason: "unchanged", fallbackReason: MEDIA_ERROR_MESSAGES.FFMPEG_CUT_FAILED };
  }
  // Own file name: transcribe's normalizeToFlac writes a fixed name beside its
  // input, which two clips in the same folder would overwrite.
  const flacPath = `${windowPath}.boundaries.flac`;
  try {
    await execFileAsync(ffmpegPath, ["-y", "-v", "error", "-i", windowPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "flac", flacPath]);
    const [groq, loudnessDb] = await Promise.all([
      transcribeWithGroq(flacPath, { model: MEDIA_TRANSCRIBE.DEFAULT_MODEL, wordTimestamps: true, language }),
      loudnessFrames(flacPath),
    ]);
    return planNaturalRange({
      requestedStart,
      requestedEnd,
      windowSeconds,
      words: groq.words ?? [],
      segments: groq.segments ?? [],
      loudnessDb,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      start: requestedStart,
      end: requestedEnd,
      endReason: "unchanged",
      fallbackReason: `${MEDIA_ERROR_MESSAGES.NATURAL_BOUNDARIES_FAILED}: ${message.slice(0, 300)}`,
    };
  } finally {
    await rm(flacPath, { force: true }).catch(() => {});
  }
}
