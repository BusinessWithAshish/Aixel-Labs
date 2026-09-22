import { z } from "zod";

import { askClaudeForJson } from "../../claude/structured-json";
import { MEDIA_NATURAL_BOUNDARIES as NB } from "../constants";
import type { GROQ_TRANSCRIPTION_WORD } from "../transcribe/types";

/**
 * Chooses BOTH edges of a clip from the words, given what the moment is about.
 *
 * The range a caller passes is a pointer, not a cut. It comes from a captions
 * transcript with whole-second timestamps whose lines overlap the next by about
 * two seconds, so it lands mid-sentence as often as not. Placing an edge within
 * a few seconds of it therefore optimises closeness to a wrong number, and no
 * weighting of silence, punctuation or room escapes that — each one fixed one
 * clip by breaking another.
 *
 * So the pointer is used only to decide WHERE to read. Inside a generous window
 * around it, the moment's own description ("what this clip is about") is enough
 * to find where the thought starts and where it lands, and both edges come back
 * as word boundaries in that window. The waveform then places the exact instant
 * inside them, which is what keeps a laugh and stops a syllable clipping.
 *
 * Returns undefined on any failure, so the caller falls back to the
 * pointer-anchored behaviour rather than losing the clip.
 */

const RANGE_SCHEMA = z.object({
  startIndex: z.number().int(),
  endIndex: z.number().int(),
  /**
   * The first few words the clip should open on, quoted from the line.
   * Whisper punctuates sparsely, so a line often spans a sentence boundary and
   * picking whole lines opened clips part-way through the previous thought
   * ("it was the thing but why would you write a blank cheque"). A quote lets
   * the edge be named exactly, without depending on punctuation being there.
   */
  startQuote: z.string().max(200).optional(),
  why: z.string().max(300).optional(),
});

const NORM = (t: string) => t.toLowerCase().replace(/[^a-z0-9\u0900-\u097f ]/g, "").trim();

/** Where `quote` begins inside `words`, searching at or after `fromIdx`. -1 when absent. */
function findQuoteStart(
  words: GROQ_TRANSCRIPTION_WORD[],
  quote: string,
  fromIdx: number,
  maxIdx: number,
): number {
  const needle = NORM(quote).split(/\s+/).filter(Boolean);
  if (needle.length === 0) return -1;
  for (let i = fromIdx; i <= maxIdx && i < words.length; i += 1) {
    let k = 0;
    for (let j = i; j < words.length && k < needle.length; j += 1) {
      const w = NORM(words[j].word);
      if (w === "") continue;
      if (w !== needle[k]) break;
      k += 1;
    }
    if (k === needle.length) return i;
  }
  return -1;
}

/** A line of transcript the model can point at, numbered so it answers with an index. */
type LINE = { index: number; start: number; end: number; text: string };

function buildLines(words: GROQ_TRANSCRIPTION_WORD[]): LINE[] {
  const lines: LINE[] = [];
  let buf: GROQ_TRANSCRIPTION_WORD[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    lines.push({
      index: lines.length,
      start: buf[0].start,
      end: buf[buf.length - 1].end,
      text: buf.map((w) => w.word.trim()).join(" "),
    });
    buf = [];
  };
  for (let i = 0; i < words.length; i += 1) {
    buf.push(words[i]);
    const gapAfter = i + 1 < words.length ? words[i + 1].start - words[i].end : Infinity;
    const endsSentence = /[.?!।]["'”’)]*$/.test(words[i].word.trim());
    // Track sentences, not every breath. Breaking on any pause produced lines
    // that begin mid-sentence, and a clip opened on one reads as joining late
    // ("it was the thing but why would you write a blank cheque").
    if (endsSentence || gapAfter >= NB.MOMENT_LINE_BREAK_GAP_SECONDS || buf.length >= 30) flush();
  }
  flush();
  return lines;
}

export async function findMomentRange(
  words: GROQ_TRANSCRIPTION_WORD[],
  moment: string,
  /** The pointer, in window-relative seconds. */
  pointerStart: number,
  pointerEnd: number,
  windowSeconds: number,
  maxSeconds?: number,
  /**
   * Shared across a batch so the clips after the first are follow-ups rather
   * than new sessions. The delegation budget counts new sessions, so one per
   * clip spent the day's allowance mid-run and every later clip fell back to
   * the pointer — seen as five of six clips in one batch.
   */
  session?: { id?: string },
): Promise<{ start: number; end: number; why?: string } | undefined> {
  const lines = buildLines(words);
  if (lines.length < 3) return undefined;

  const rendered = lines
    .map((l) => `${l.index}. [${l.start.toFixed(1)}-${l.end.toFixed(1)}] ${l.text}`)
    .join("\n");

  const prompt = [
    "You are choosing the exact start and end of a short vertical clip cut from",
    "a podcast. Below is the transcript around the moment, one numbered line per",
    "phrase, with its time range in seconds.",
    "",
    `THE MOMENT THIS CLIP IS ABOUT: ${moment}`,
    "",
    `A rough pointer said the moment is somewhere near ${pointerStart.toFixed(1)}-${pointerEnd.toFixed(1)}s.`,
    "That pointer came from a coarse transcript and is often a second or two",
    "inside a sentence — treat it as 'look around here', not as the answer.",
    "",
    rendered,
    "",
    "Return the FIRST line the clip should include and the LAST line it should",
    "include. Also quote, in `startQuote`, the first 3-6 words the clip should",
    "actually open on — a line can begin part-way through the previous sentence,",
    "and the quote is what pins the opening word exactly.",
    "",
    "START rules:",
    "- Open on the line that begins the thought, so a viewer with no context",
    "  follows it. Never open mid-sentence, and never on an answer whose question",
    "  was the line before — include the question instead.",
    "- Do not add long run-up. If a line is throat-clearing, start after it.",
    "",
    "END rules:",
    "- The last line must COMPLETE the thought. Never end mid-sentence, on a",
    "  word that promises more (and, but, so, because, that, which), or on a",
    "  trailing filler (like, you know, I mean, yeah, na).",
    "- Never end on a question that is not answered inside the clip. In an",
    "  interview a question at the end is the NEXT moment starting, however",
    "  punchy it sounds.",
    "- End where the point LANDS. A short reaction to it may be included — a laugh,",
    "  or the other person agreeing — but ONLY if that reaction finishes inside the",
    "  clip. A reaction cut off part-way through is worse than no reaction at all:",
    "  if it does not complete, end on the speaker's own last line instead. So for",
    '  "…just don\'t do it." / "Interesting, I like that first line you said." /',
    '  "That is such a fresh take." — either stop at "just don\'t do it." or carry',
    '  through to "such a fresh take.", never in the middle at "…you said."',
    "- Do not run on into the next topic to pad the length.",
    "",
    ...(maxSeconds
      ? [
          "",
          `LENGTH: the clip must not exceed ${Math.round(maxSeconds)}s. If the moment will`,
          "not fit, keep the ending and start later — losing run-up is fine, losing",
          "the payoff is not.",
        ]
      : []),
    "",
    'Return ONLY JSON: {"startIndex": <n>, "endIndex": <n>, "startQuote": "<3-6 words>", "why": "<max 25 words>"}',
  ].join("\n");

  try {
    const { data, sessionId } = await askClaudeForJson({
      prompt,
      zodValidator: RANGE_SCHEMA,
      maxAttempts: NB.SEMANTIC_MAX_ATTEMPTS,
      timeoutSeconds: NB.SEMANTIC_TIMEOUT_SECONDS,
      exhaustedErrorPrefix: "Could not place the clip's edges from its transcript",
      ...(session?.id ? { sessionId: session.id } : {}),
    });
    if (session && sessionId) session.id = sessionId;
    const a = lines.find((l) => l.index === data.startIndex);
    const b = lines.find((l) => l.index === data.endIndex);
    if (!a || !b) return undefined;

    // Open at a sentence boundary. Whisper does not always punctuate, so a
    // chosen line can still begin part-way through a sentence; walking back to
    // where that sentence started keeps the thought whole instead of joining it
    // late. Bounded, so a long unpunctuated stretch cannot drag the start away.
    let start = Math.max(0, a.start);
    let firstIdx = words.findIndex((w) => w.start >= a.start - 0.001);
    // The quote wins when it is really there: it names the opening word instead
    // of inheriting wherever the line happened to break.
    let quoteMatched = false;
    if (data.startQuote && firstIdx >= 0) {
      const lineEndIdx = words.findIndex((w) => w.start > a.end);
      const q = findQuoteStart(words, data.startQuote, firstIdx, lineEndIdx < 0 ? words.length - 1 : lineEndIdx);
      if (q >= 0) {
        start = Math.max(0, words[q].start);
        firstIdx = q;
        quoteMatched = true;
      }
    }
    // The snap-back is the fallback for when no quote pinned the opening. If one
    // did, walking back from it would undo the very precision it bought.
    if (!quoteMatched && firstIdx > 0) {
      let k = firstIdx;
      let foundSentenceStart = false;
      while (k > 0 && a.start - words[k - 1].start <= NB.MOMENT_START_SNAP_BACK_SECONDS) {
        if (/[.?!।]["'”’)]*$/.test(words[k - 1].word.trim())) {
          foundSentenceStart = true;
          break;
        }
        k -= 1;
      }
      // Only move when a real sentence boundary was found. Stopping at the
      // limit instead would drag the start several seconds INTO the previous
      // sentence whenever Whisper punctuated nothing nearby — which is exactly
      // the "joins late" symptom this was meant to cure, made worse.
      if (foundSentenceStart && k < firstIdx) start = Math.max(0, words[k].start);
    }
    const end = Math.min(windowSeconds, b.end);
    // Guard rails: a pointer is vague, not meaningless. A range that wanders far
    // from it, inverts, or collapses is a misread, not a better edit.
    // Each rejection says which guard fired: "it fell back" without a reason is
    // what made the last round impossible to read.
    if (end - start < NB.MOMENT_MIN_SECONDS) {
      console.warn(`[moment] rejected: ${(end - start).toFixed(1)}s is under the ${NB.MOMENT_MIN_SECONDS}s floor`);
      return undefined;
    }
    // The guards are deliberately ASYMMETRIC. Tightening onto the real moment is
    // the whole point of this mode — a pointer that claims 72s for a 32s moment
    // is exactly the error being corrected, and a symmetric rail rejected that
    // and fell back. Growing past the pointer is the dangerous direction: that
    // is where the next question and the next topic live, and every forward
    // move measured in this work made a clip worse.
    if (start - pointerStart < -NB.MOMENT_MAX_START_DRIFT_SECONDS) {
      console.warn(`[moment] rejected: start reached ${(start - pointerStart).toFixed(1)}s before the pointer`);
      return undefined;
    }
    if (end - pointerEnd > NB.MOMENT_MAX_END_DRIFT_SECONDS) {
      console.warn(`[moment] rejected: end ran ${(end - pointerEnd).toFixed(1)}s past the pointer`);
      return undefined;
    }
    // Still has to be the moment the pointer names, not a different one: the
    // kept range must overlap it.
    if (end <= pointerStart || start >= pointerEnd) {
      console.warn(`[moment] rejected: ${start.toFixed(1)}-${end.toFixed(1)}s does not overlap the pointer`);
      return undefined;
    }
    // Enforce the ceiling by moving the START, per the channel rule that a long
    // moment loses run-up and never its ending. Snap to a word so the opening is
    // not mid-syllable.
    if (maxSeconds && end - start > maxSeconds) {
      const target = end - maxSeconds;
      const w = words.find((x) => x.start >= target);
      const trimmed = w ? w.start : target;
      if (end - trimmed >= NB.MOMENT_MIN_SECONDS) {
        console.warn(`[moment] ${(end - start).toFixed(1)}s over the ${maxSeconds}s ceiling; start moved to ${trimmed.toFixed(1)}s`);
        return { start: trimmed, end, why: data.why };
      }
    }
    return { start, end, why: data.why };
  } catch (err) {
    console.warn(`[moment] call failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)}`);
    return undefined;
  }
}
