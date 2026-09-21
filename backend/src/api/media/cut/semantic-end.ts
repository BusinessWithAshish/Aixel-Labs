import { z } from "zod";

import { askClaudeForJson } from "../../claude/structured-json";
import { MEDIA_NATURAL_BOUNDARIES as NB } from "../constants";
import type { GROQ_TRANSCRIPTION_WORD } from "../transcribe/types";

/**
 * Picks WHICH stop ends a clip, by reading the words.
 *
 * The waveform and Whisper's punctuation both answer the wrong question. A gap
 * in the audio says someone stopped making noise, not that a thought finished —
 * people pause mid-sentence and talk straight through full stops. Punctuation
 * is closer but marks fragments as freely as sentences, and Whisper omits it
 * entirely on some audio. Worse, the two useful signals actively disagree: the
 * line that ends a moment is often the one the other speaker talks over, so it
 * has no silence after it at all, and anything that scores "room" is pushed
 * away from exactly the right answer. Measured over six rounds of tuning, each
 * weighting fixed one clip by breaking another.
 *
 * What settles it is which words matter, so that is what gets asked. The model
 * only chooses among stops the audio actually offers; the exact instant inside
 * the chosen stop is still placed on the waveform by the caller, which is what
 * keeps a laugh in and a syllable from clipping.
 *
 * Returns undefined on any failure — the caller then falls back to the
 * heuristic, so an ending is never blocked on this.
 */

const PICK_SCHEMA = z.object({
  index: z.number().int(),
  why: z.string().max(300).optional(),
});

type CANDIDATE = { index: number; t: number; before: string; after: string };

function buildCandidates(
  words: GROQ_TRANSCRIPTION_WORD[],
  requestedEnd: number,
): CANDIDATE[] {
  const lo = requestedEnd - NB.END_SEARCH_BEFORE_SECONDS;
  const hi = requestedEnd + NB.END_SEARCH_AFTER_SECONDS;
  const out: CANDIDATE[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const t = words[i].end;
    if (t < lo || t > hi) continue;
    const gapAfter = i + 1 < words.length ? words[i + 1].start - t : Infinity;
    const endsSentence = /[.?!।]["'”’)]*$/.test(words[i].word.trim());
    // Only stops the audio offers: a real gap, or a sentence Whisper marked.
    if (gapAfter < NB.SEMANTIC_MIN_GAP_SECONDS && !endsSentence) continue;
    out.push({
      index: out.length,
      t,
      before: words
        .slice(Math.max(0, i - NB.SEMANTIC_CONTEXT_WORDS + 1), i + 1)
        .map((w) => w.word.trim())
        .join(" "),
      after: words
        .slice(i + 1, i + 1 + NB.SEMANTIC_CONTEXT_WORDS)
        .map((w) => w.word.trim())
        .join(" "),
    });
    if (out.length >= NB.SEMANTIC_MAX_CANDIDATES) break;
  }
  return out;
}

export async function resolveSemanticEnd(
  words: GROQ_TRANSCRIPTION_WORD[],
  requestedEnd: number,
): Promise<{ end: number; why?: string } | undefined> {
  const candidates = buildCandidates(words, requestedEnd);
  if (candidates.length < 2) return undefined; // nothing to choose between

  const list = candidates
    .map(
      (c) =>
        `${c.index}. at ${c.t.toFixed(2)}s — ends after: "…${c.before}" | next words: "${c.after || "(nothing)"}"`,
    )
    .join("\n");

  const prompt = [
    "You are placing the END of a short vertical clip cut from a podcast.",
    "",
    `The editor asked for the clip to end near ${requestedEnd.toFixed(2)}s. Below are the only`,
    "places the audio can actually be cut. Each shows the words it ends after and",
    "the words that follow it.",
    "",
    list,
    "",
    "Pick the one that leaves a clip a viewer feels is FINISHED.",
    "",
    "HARD RULES — a stop breaking any of these is disqualified, however good it sounds:",
    "A. The clip must end on a STATEMENT. If the last words are a question, that",
    "   stop is wrong. This holds even when the question is punchy, pointed or",
    "   sounds rhetorical — in an interview one person asks and the other answers,",
    "   so a question at the end is the NEXT moment starting, not this one ending.",
    "B. Not mid-sentence, and not on a word that promises more: and, but, so,",
    "   because, that, which, I wouldn't say.",
    "C. Not on a trailing filler the speaker tacks on — like, you know, I mean,",
    "   yeah, right, na, so. If the words end \"...already out like\", the stop you",
    "   want is the one just before that filler (\"...already out\").",
    "D. Nothing after the point where the other person starts a new topic.",
    "",
    "THEN, among the stops that survive, take the one CLOSEST to the editor's",
    "intended end, and when two are equally close take the EARLIER one.",
    "",
    "Moving EARLIER is cheap; moving LATER is not. Past the intended end is where",
    "the other person's next line lives, so a later stop usually buys trailing",
    "chatter or a new question and makes the clip feel less finished, not more.",
    "Only go later than the intended end to let a laugh or a short reaction to",
    "what was just said finish.",
    "",
    "Silence after a stop is NOT a reason to choose it: the line that ends a",
    "moment is often the one the other person talks over.",
    "",
    'Return ONLY JSON: {"index": <number>, "why": "<max 20 words>"}',
  ].join("\n");

  try {
    const { data } = await askClaudeForJson({
      prompt,
      zodValidator: PICK_SCHEMA,
      maxAttempts: NB.SEMANTIC_MAX_ATTEMPTS,
      timeoutSeconds: NB.SEMANTIC_TIMEOUT_SECONDS,
      exhaustedErrorPrefix: "Could not place the clip's end from its transcript",
    });
    const picked = candidates.find((c) => c.index === data.index);
    if (!picked) return undefined;
    return { end: picked.t, why: data.why };
  } catch {
    return undefined; // heuristic takes over
  }
}
