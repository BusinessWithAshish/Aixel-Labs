import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import { MEDIA_ERROR_MESSAGES, MEDIA_NATURAL_BOUNDARIES as NB } from "../constants";
import { MEDIA_TRANSCRIBE } from "../transcribe/constants";
import { dropUnreliableSpans } from "../transcribe/formatters";
import { transcribeWithGroq } from "../transcribe/groq-client";
import { findMomentRange } from "./moment-boundaries";
import { resolveSemanticEnd } from "./semantic-end";
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
  /**
   * A stop chosen by reading the words (see `semantic-end.ts`). When set it
   * wins outright: the audio then only places the exact instant inside it.
   */
  semanticEnd?: number;
  /**
   * An opening word chosen by reading the words. The onset search below hunts
   * for the nearest speech onset within 1.5s, which on continuous speech drags
   * the opening backward onto the tail of the previous sentence — measured as a
   * clip that should have opened "But why would you write a blank cheque?"
   * opening "it was the thing but why would you…" instead. When this is set the
   * word is already chosen and only its first syllable needs protecting.
   */
  semanticStart?: number;
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
 * - **End** lands in a real pause in the AUDIO near the requested end: the
 *   loudness drops well below the speech in this window and stays there, and
 *   the cut goes just inside that dip. Word timings are not trusted for this —
 *   on fast or overlapping speech Whisper reports zero-length gaps between
 *   words and starts the next line's first word up to a second early, which
 *   ends a clip mid-syllable or on the next person's first word. Laughter and
 *   applause are loud, so the pause after them is the one that wins, which
 *   keeps the reaction in the clip. Only when the audio offers no pause at all
 *   (music, a continuous room) does it fall back to the stop between words
 *   that looks most like an ending.
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
  if (input.semanticStart !== undefined) {
    // Already chosen by reading the words, and it IS a word's own start, so the
    // mid-word guard has nothing to protect here. Applying it anyway snapped to
    // a PRECEDING word — Whisper's word spans overlap on fast speech — which
    // put the tail of the previous sentence back at the top of the clip.
    start = input.semanticStart;
  } else if (splitAtStart) {
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
  /** Walks on from `t0` while the audio stays `dbAboveFloor` over the room, ending after `quietHold` of quiet. */
  const loudTailEnd = (t0: number, limit: number, dbAboveFloor: number, quietHold: number): number => {
    let t = t0;
    let quiet = 0;
    while (t < limit) {
      const db = loudnessDb[Math.floor(t / NB.FRAME_SECONDS)] ?? -120;
      quiet = db > noiseFloor + dbAboveFloor ? 0 : quiet + NB.FRAME_SECONDS;
      if (quiet >= quietHold) break;
      t += NB.FRAME_SECONDS;
    }
    return Math.max(t0, t - quiet);
  };

  /** Where the loud, word-free reaction after `t` dies down (at most `limit`). */
  const reactionEndAfter = (t0: number, limit: number): number =>
    loudTailEnd(t0, limit, NB.REACTION_DB_ABOVE_FLOOR, NB.QUIET_HOLD_SECONDS);

  /**
   * The rest of the last word. Whisper's word ends are early, so cutting on one
   * clips the final syllable; this follows the speech itself a little further.
   */
  const speechTailEnd = (t0: number, limit: number): number =>
    loudTailEnd(
      t0,
      Math.min(limit, t0 + NB.SPEECH_TAIL_MAX_SECONDS),
      NB.SPEECH_TAIL_DB_ABOVE_FLOOR,
      NB.SPEECH_TAIL_QUIET_HOLD_SECONDS,
    );

  // ---- a stop chosen by reading the words ----
  // Asked before anything derived from the audio, because it answers the
  // question the audio cannot: which of these stops finishes the thought.
  if (input.semanticEnd !== undefined) {
    const t = input.semanticEnd;
    const nextWordStart = words.find((w) => w.start >= t)?.start ?? windowSeconds;
    const nextWordLimit = Math.min(nextWordStart - NB.NEXT_WORD_GUARD_SECONDS, windowSeconds);
    const reactionEnd = reactionEndAfter(t, Math.min(nextWordLimit, t + NB.REACTION_MAX_SECONDS));
    const tailEnd = Math.max(reactionEnd, speechTailEnd(t, nextWordLimit));
    const end = Math.max(
      t,
      Math.min(
        Math.max(tailEnd + NB.TAIL_PAD_SECONDS, t + NB.TRAILING_QUIET_TARGET_SECONDS),
        nextWordLimit,
        windowSeconds,
      ),
    );
    if (end - start >= 1) {
      return {
        start,
        end,
        endReason: reactionEnd - t >= NB.REACTION_MIN_SECONDS ? "reaction" : "pause",
      };
    }
  }

  // ---- where a sentence ends (asked first) ----
  // Whisper punctuates, and its segments are sub-second and do not overlap, so
  // a segment closing with sentence punctuation answers *did the speaker finish
  // the thought?* directly. A gap in the waveform only guesses at that, and on
  // conversation it guesses badly: people pause mid-sentence and run straight
  // through full stops, so an edge chosen on silence lands inside a sentence
  // about as often as at the end of one. Silence still decides the exact
  // instant, just below — it no longer decides WHICH stop.
  // Both sources, because neither alone is stable: Whisper re-segments the same
  // speech differently when the audio is re-encoded (the window here is a fresh
  // cut), but the punctuation it writes on individual words survives that.
  const sentenceEndTimes = [
    ...words.filter((w) => SENTENCE_END.test(w.word.trim())).map((w) => w.end),
    ...reliable.segments.filter((seg) => SENTENCE_END.test((seg.text ?? "").trim())).map((seg) => seg.end),
  ].sort((a, b) => a - b);
  // Two sources naming the same stop must not count twice or fight over 10ms.
  const sentenceCandidates = sentenceEndTimes
    .filter((t, i) => i === 0 || t - sentenceEndTimes[i - 1] > NB.PHRASE_END_TOLERANCE_SECONDS)
    .filter(
      (t) =>
        t >= re - NB.END_SEARCH_BEFORE_SECONDS &&
        t <= re + NB.END_SEARCH_AFTER_SECONDS &&
        t > start + 1,
    )
    .map((t) => {
      const wordsCrossed = t > re ? words.filter((w) => w.start > re && w.start < t).length : 0;
      const distancePenalty =
        t > re
          ? NB.END_PENALTY_AFTER_PER_SECOND * (t - re) + NB.END_PENALTY_PER_WORD_CROSSED * wordsCrossed
          : NB.END_PENALTY_BEFORE_PER_SECOND * (re - t);
      // Room after the stop, which is what makes an ending audible. A full stop
      // the next speaker talks straight over reads as complete on the page and
      // sounds severed in the clip — so silence is scored, not just position.
      const room = (words.find((w) => w.start >= t)?.start ?? windowSeconds) - t;
      const roomScore = Math.min(Math.max(room, 0), NB.SENTENCE_ROOM_CAP_SECONDS) * NB.SENTENCE_ROOM_WEIGHT;
      return { t, room, score: NB.SENTENCE_END_BASE_SCORE + roomScore - distancePenalty };
    })
    .filter((c) => c.score >= NB.END_MIN_SCORE);

  if (sentenceCandidates.length > 0) {
    const pick = sentenceCandidates.reduce((a, b) => (b.score > a.score ? b : a));
    const nextWordStart = words.find((w) => w.start >= pick.t)?.start ?? windowSeconds;
    const nextWordLimit = Math.min(nextWordStart - NB.NEXT_WORD_GUARD_SECONDS, windowSeconds);
    // Keep the room's reaction, and let the speaker's own last syllable finish.
    const reactionEnd = reactionEndAfter(
      pick.t,
      Math.min(nextWordLimit, pick.t + NB.REACTION_MAX_SECONDS),
    );
    const tailEnd = Math.max(reactionEnd, speechTailEnd(pick.t, nextWordLimit));
    // Keep the quiet after the last word inside the clip, up to the target, so
    // the clip ends in room tone and the fade has somewhere to live. Capped by
    // the next word so the following line is never heard.
    const end = Math.max(
      pick.t,
      Math.min(
        Math.max(tailEnd + NB.TAIL_PAD_SECONDS, pick.t + NB.TRAILING_QUIET_TARGET_SECONDS),
        nextWordLimit,
        windowSeconds,
      ),
    );
    if (end - start >= 1) {
      return {
        start,
        end,
        endReason: reactionEnd - pick.t >= NB.REACTION_MIN_SECONDS ? "reaction" : "pause",
      };
    }
  }

  // ---- where the audio itself stops ----
  // What a listener hears as the end of a line is a pause in the WAVEFORM.
  // Whisper's word gaps cannot stand in for it on fast or overlapping speech:
  // it reports gaps of exactly zero and starts the next word up to a second
  // early, which ends a clip mid-syllable or a beat into the next person's
  // first word. The pauses below are read off the loudness directly, and they
  // are preferred over any word-derived stop.
  const speechLevel = percentile(loudnessDb, 90);
  const pauseGate = speechLevel - NB.PAUSE_DB_BELOW_SPEECH;
  const pauses: Array<{ start: number; end: number }> = [];
  for (let i = 0, quietFrom = -1; i <= loudnessDb.length; i += 1) {
    const quiet = i < loudnessDb.length && loudnessDb[i] < pauseGate;
    if (quiet && quietFrom < 0) quietFrom = i;
    if (!quiet && quietFrom >= 0) {
      const from = quietFrom * NB.FRAME_SECONDS;
      const to = i * NB.FRAME_SECONDS;
      if (to - from >= NB.PAUSE_MIN_AUDIO_SECONDS) pauses.push({ start: from, end: to });
      quietFrom = -1;
    }
  }

  const pausesWithin = (after: number) =>
    pauses.filter(
      (p) =>
        p.start >= re - NB.END_SEARCH_BEFORE_SECONDS && p.start <= re + after && p.start > start + 1,
    );
  // A range can end in the middle of someone talking straight through; rather
  // than cut on a syllable, look a little further out for the next real pause.
  const inReach = pausesWithin(NB.END_SEARCH_AFTER_SECONDS);
  const pauseCandidates = (inReach.length > 0
    ? inReach
    : pausesWithin(NB.END_SEARCH_AFTER_SECONDS + NB.PAUSE_SEARCH_EXTRA_SECONDS)
  )
    .map((p) => {
      const length = p.end - p.start;
      // Land inside the pause: the last syllable finishes, nothing of the next
      // line is heard, and the fade-out has somewhere quiet to live.
      const t = Math.min(p.start + NB.PAUSE_CUT_OFFSET_SECONDS, p.start + length / 2, windowSeconds);
      const wordsCrossed = t > re ? words.filter((w) => w.start > re && w.start < t).length : 0;
      const distancePenalty =
        t > re
          ? NB.END_PENALTY_AFTER_PER_SECOND * (t - re) + NB.END_PENALTY_PER_WORD_CROSSED * wordsCrossed
          : NB.END_PENALTY_BEFORE_PER_SECOND * (re - t);
      // Loud, word-free audio before the pause is the room reacting.
      const spokenBefore = words.filter((w) => w.end <= p.start + NB.FRAME_SECONDS);
      const lastWordEnd = spokenBefore.length > 0 ? spokenBefore[spokenBefore.length - 1].end : 0;
      // Did the speaker finish the thought, or just take a breath? The words
      // decide that; the audio only says where the gap is.
      const lastWord = spokenBefore[spokenBefore.length - 1];
      const finishedSentence = lastWord !== undefined && SENTENCE_END.test(lastWord.word.trim());
      const endedPhrase = phraseEnds.some(
        (t) => Math.abs(t - p.start) <= NB.PHRASE_END_TOLERANCE_SECONDS * 2,
      );
      // A long pause is a more definite ending than a short one, up to a point.
      const score =
        Math.min(length, NB.PAUSE_LENGTH_SCORE_CAP_SECONDS) +
        (finishedSentence ? NB.PAUSE_SENTENCE_BONUS : 0) +
        (endedPhrase ? NB.PAUSE_PHRASE_BONUS : 0) -
        distancePenalty;
      const endReason: NATURAL_RANGE["endReason"] =
        p.start - lastWordEnd >= NB.REACTION_MIN_SECONDS ? "reaction" : "pause";
      return { t, score, endReason };
    });

  // Only a pause that is actually worth moving to. When two people talk over
  // each other there is no real pause for several seconds, and the best of a
  // bad set is still bad — taking it ran the clip into the next question.
  const viablePauses = pauseCandidates.filter((c) => c.score >= NB.END_MIN_SCORE);
  if (viablePauses.length > 0) {
    const best = viablePauses.reduce((a, b) => (b.score > a.score ? b : a));
    if (best.t - start >= 1) {
      return { start, end: best.t, endReason: best.endReason };
    }
  }

  // No pause anywhere near: the speaker is talking straight through. Whisper
  // gives no gaps to work with either, so the only remaining signal that a
  // thought finished is the punctuation it wrote — take that on its own rather
  // than cut mid-clause.
  const runOnSpeech = viablePauses.length === 0;

  // Every stop near the requested end, scored on how much it looks like an
  // ending: quiet after it, a reaction after it, and closeness to the
  // requested end. A punchline wins over a breath inside the next sentence.
  const candidates = words
    .map((w, i) => ({ t: w.end, i }))
    .filter(
      ({ t, i }) =>
        (isStop(i) || (runOnSpeech && SENTENCE_END.test(words[i].word.trim()))) &&
        t >= re - NB.END_SEARCH_BEFORE_SECONDS &&
        t <= re + NB.END_SEARCH_AFTER_SECONDS &&
        t > start + 1,
    )
    .map(({ t, i }) => {
      const nextWordStart = words[i + 1]?.start ?? windowSeconds;
      const nextWordLimit = Math.min(nextWordStart - NB.NEXT_WORD_GUARD_SECONDS, windowSeconds);
      const reactionEnd = reactionEndAfter(
        t,
        Math.min(nextWordLimit, t + NB.REACTION_MAX_SECONDS),
      );
      // Whichever runs longer: the room reacting, or the speaker's own last
      // syllable finishing after the timestamp Whisper gave it.
      const tailEnd = Math.max(reactionEnd, speechTailEnd(t, nextWordLimit));
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
      return { t, nextWordStart, reactionEnd, tailEnd, score };
    });
  // Same floor as the pauses: a stop has to beat simply keeping the end that
  // was asked for, which came from reading the transcript.
  const viable = candidates.filter((c) => c.score >= NB.END_MIN_SCORE);
  if (viable.length === 0) {
    // No stop worth moving to: keep the requested end (never mid-word), but
    // still keep a reaction right after it — applause often has no words at all.
    const splitAtEnd = words.find((w) => w.start < re && re < w.end);
    const floor = splitAtEnd ? splitAtEnd.end : re;
    const nextWordStart = words.find((w) => w.start >= floor)?.start ?? windowSeconds;
    const nextWordLimit = Math.min(nextWordStart - NB.NEXT_WORD_GUARD_SECONDS, windowSeconds);
    const reactionEnd = reactionEndAfter(
      floor,
      Math.min(nextWordLimit, floor + NB.REACTION_MAX_SECONDS),
    );
    const tailEnd = Math.max(reactionEnd, speechTailEnd(floor, nextWordLimit));
    return {
      start,
      end: Math.max(
        floor,
        Math.min(tailEnd + NB.TAIL_PAD_SECONDS, nextWordStart - NB.NEXT_WORD_GUARD_SECONDS, windowSeconds),
      ),
      endReason: reactionEnd - floor >= NB.REACTION_MIN_SECONDS ? "reaction" : "unchanged",
    };
  }
  const best = viable.reduce((a, b) => (b.score > a.score ? b : a));
  const end = Math.max(
    best.t,
    Math.min(
      best.tailEnd + NB.TAIL_PAD_SECONDS,
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

  // Same clip without the laugh: the end goes to the punchline's stop at 5.0
  // plus the trailing room — NOT on toward the requested 5.6. The room is the
  // point: a clip that ends on the last syllable sounds severed however right
  // the word is, so a bounded amount of the silence after the stop is kept.
  const silent = planNaturalRange({ ...base, loudnessDb: quiet });
  const silentFloor = 5.0;
  const silentCeiling = 5.0 + NB.TRAILING_QUIET_TARGET_SECONDS + 0.05;
  if (silent.endReason !== "pause" || silent.end < silentFloor || silent.end > silentCeiling) {
    throw new Error(
      `end should land on the stop at 5.0 plus trailing room (${silentFloor}-${silentCeiling.toFixed(2)}), got ${silent.end} (${silent.endReason})`,
    );
  }
  if (silent.end >= words[8].start) throw new Error("trailing room must not reach the next sentence");

  // The speaker is still finishing "punchline." at 5.0 — Whisper's word end is
  // early, and the audio runs to 5.4. Ending on the number clips the syllable.
  const trailing = planNaturalRange({
    ...base,
    loudnessDb: [...frames(5.4, -20), ...frames(4.6, -40)],
  });
  if (trailing.end < 5.4 || trailing.end >= words[8].start) {
    throw new Error(`end should follow the last word's audio past 5.4 (and stop short of the next sentence), got ${trailing.end}`);
  }

  // Whisper at its worst — the case that shipped clips ending mid-sentence:
  // zero-length gaps between every word, and the next line's first word timed a
  // second before it is actually spoken. Only the waveform shows the real end.
  const runOn: GROQ_TRANSCRIPTION_WORD[] = [
    { word: "We", start: 2, end: 2.4 },
    { word: "will", start: 2.4, end: 2.7 },
    { word: "show", start: 2.7, end: 3.1 },
    { word: "you", start: 3.1, end: 3.4 },
    { word: "who", start: 3.4, end: 3.7 },
    { word: "we", start: 3.7, end: 4.2 },
    { word: "are", start: 4.2, end: 5 },
    { word: "if", start: 5, end: 5.4 },
    { word: "you", start: 5.4, end: 5.8 },
  ];
  const runOnPlan = planNaturalRange({
    requestedStart: 2,
    requestedEnd: 5.3,
    windowSeconds: 10,
    words: runOn,
    segments: [{ id: 0, start: 2, end: 5.8, text: "We will show you who we are if you" }],
    // Speech to 5.2, silence to 6.4, the next line from there.
    loudnessDb: [...frames(5.2, -18), ...frames(1.2, -70), ...frames(3.6, -18)],
  });
  // EPSILON: the intended landing point is exactly pause.start + the cut
  // offset (5.2 + 0.4), which floating point renders as 5.6000000000000005.
  if (runOnPlan.end < 5.2 || runOnPlan.end > 5.6 + 1e-6) {
    throw new Error(`end should land inside the pause at 5.2–6.4, got ${runOnPlan.end}`);
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
  /**
   * Read the window's audio from the ORIGINAL source instead of the re-encoded
   * work file. Whisper's word timings and punctuation shift when the same
   * speech is re-encoded — measured at 1.9s on one clip, which is more than the
   * edge is allowed to move — so the decision must not be taken on a derived
   * copy. `start`/`end` are absolute times in that source.
   */
  audioWindow?: { source: string; start: number; end: number; proxyUrl?: string },
): Promise<NATURAL_RANGE & { fallbackReason?: string }> {
  if (!ffmpegPath) {
    return { start: requestedStart, end: requestedEnd, endReason: "unchanged", fallbackReason: MEDIA_ERROR_MESSAGES.FFMPEG_CUT_FAILED };
  }
  // Own file name: transcribe's normalizeToFlac writes a fixed name beside its
  // input, which two clips in the same folder would overwrite.
  const flacPath = `${windowPath}.boundaries.flac`;
  try {
    const flacArgs = audioWindow
      ? [
          "-y", "-v", "error",
          ...(audioWindow.proxyUrl ? ["-http_proxy", audioWindow.proxyUrl] : []),
          "-ss", String(audioWindow.start),
          "-to", String(audioWindow.end),
          "-i", audioWindow.source,
        ]
      : ["-y", "-v", "error", "-i", windowPath];
    await execFileAsync(ffmpegPath, [...flacArgs, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "flac", flacPath]);
    const [groq, loudnessDb] = await Promise.all([
      transcribeWithGroq(flacPath, {
        model: MEDIA_TRANSCRIBE.DEFAULT_MODEL,
        wordTimestamps: true,
        language,
        // Without this Whisper often returns no punctuation at all, and the
        // sentence-end logic has nothing to work with.
        prompt: NB.BOUNDARY_PROMPT,
      }),
      loudnessFrames(flacPath),
    ]);
    const words = groq.words ?? [];
    // Which stop ends the thought is a question about the words, so it is asked
    // of the words. Returns undefined on any failure and the heuristic runs.
    const semantic =
      NB.SEMANTIC_ENABLED && words.length > 0
        ? await resolveSemanticEnd(words, requestedEnd)
        : undefined;
    return planNaturalRange({
      requestedStart,
      requestedEnd,
      windowSeconds,
      words,
      segments: groq.segments ?? [],
      loudnessDb,
      ...(semantic ? { semanticEnd: semantic.end } : {}),
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

/**
 * `boundaries: "moment"` — both edges chosen from the words in a wide window,
 * given what the moment is about, then placed on the audio by the same
 * refinement the other modes use. The caller's range only says where to read.
 */
export async function findMomentBoundaries(
  windowPath: string,
  pointerStart: number,
  pointerEnd: number,
  windowSeconds: number,
  moment: string,
  language?: string,
  audioWindow?: { source: string; start: number; end: number; proxyUrl?: string },
  maxSeconds?: number,
): Promise<NATURAL_RANGE & { fallbackReason?: string; why?: string }> {
  const unchanged: NATURAL_RANGE = { start: pointerStart, end: pointerEnd, endReason: "unchanged" };
  if (!ffmpegPath) return { ...unchanged, fallbackReason: MEDIA_ERROR_MESSAGES.FFMPEG_CUT_FAILED };
  const flacPath = `${windowPath}.moment.flac`;
  try {
    const flacArgs = audioWindow
      ? [
          "-y", "-v", "error",
          ...(audioWindow.proxyUrl ? ["-http_proxy", audioWindow.proxyUrl] : []),
          "-ss", String(audioWindow.start),
          "-to", String(audioWindow.end),
          "-i", audioWindow.source,
        ]
      : ["-y", "-v", "error", "-i", windowPath];
    await execFileAsync(ffmpegPath, [...flacArgs, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "flac", flacPath]);
    const [groq, loudnessDb] = await Promise.all([
      transcribeWithGroq(flacPath, {
        model: MEDIA_TRANSCRIBE.DEFAULT_MODEL,
        wordTimestamps: true,
        language,
        prompt: NB.BOUNDARY_PROMPT,
      }),
      loudnessFrames(flacPath),
    ]);
    const words = groq.words ?? [];
    if (words.length === 0) return { ...unchanged, fallbackReason: MEDIA_ERROR_MESSAGES.NATURAL_BOUNDARIES_FAILED };

    const picked = await findMomentRange(words, moment, pointerStart, pointerEnd, windowSeconds, maxSeconds);
    if (!picked) {
      // Fall back to the pointer-anchored placement rather than lose the clip —
      // but SAY SO. A silent fallback here is indistinguishable in the output
      // from the moment pass having run, which made every result unreadable:
      // the same range produced a clean 18s clip by hand and a 45s one in a
      // batch, with nothing to show which path had run.
      const semantic = NB.SEMANTIC_ENABLED ? await resolveSemanticEnd(words, pointerEnd) : undefined;
      const plan = planNaturalRange({
        requestedStart: pointerStart,
        requestedEnd: pointerEnd,
        windowSeconds,
        words,
        segments: groq.segments ?? [],
        loudnessDb,
        ...(semantic ? { semanticEnd: semantic.end } : {}),
      });
      return { ...plan, fallbackReason: MEDIA_ERROR_MESSAGES.MOMENT_PASS_FELL_BACK };
    }
    // The words decided which stop; the audio still places the instant inside it.
    const placed = planNaturalRange({
      requestedStart: picked.start,
      requestedEnd: picked.end,
      windowSeconds,
      words,
      segments: groq.segments ?? [],
      loudnessDb,
      semanticStart: picked.start,
      semanticEnd: picked.end,
    });
    return { ...placed, ...(picked.why ? { why: picked.why } : {}) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...unchanged, fallbackReason: `${MEDIA_ERROR_MESSAGES.NATURAL_BOUNDARIES_FAILED}: ${message.slice(0, 300)}` };
  } finally {
    await rm(flacPath, { force: true }).catch(() => {});
  }
}
