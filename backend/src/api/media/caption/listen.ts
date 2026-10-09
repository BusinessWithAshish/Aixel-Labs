import { z } from "zod";

import { MEDIA_GEMINI_MODEL } from "../constants";
import {
  generateStructuredContent,
  uploadFileToGemini,
  waitForGeminiFileActive,
  withGeminiKeyPoolRetry,
} from "../gemini-client";
import type { GROQ_TRANSCRIPTION_WORD } from "../transcribe/types";
import { askClaudeForJson } from "../../claude/structured-json";

/**
 * `listener: "gemini"` — a second, better listener decides WHAT was said;
 * Whisper is kept only for WHEN.
 *
 * Why: Whisper is told one language per clip and guesses the rest. On Indian
 * podcast speech that fails in three measured ways. A guest who switches to
 * fast English mid-episode was transcribed "in Hindi" and came out as
 * Devanagari nonsense, which the romanizer then faithfully turned into Roman
 * nonsense ("LUK BHRAT MENJARON KOTI HAI" for "do you think that kills
 * emotion"). Punjabi- and dialect-accented Hindi drifts into near-words. And
 * the spans Whisper itself is unsure of are dropped, so a stretch of the clip
 * shows no captions at all. On the same three clips Gemini, listening to the
 * audio with no language forced, returned the lines essentially verbatim in
 * the Roman script people type.
 *
 * What Gemini cannot do is time a word: its timestamps are good to about a
 * second. Whisper's word timings stay accurate even when its text is wrong,
 * because they follow the sound. So the reference text is laid onto Whisper's
 * timeline: words the two agree on anchor the rest, and everything between
 * anchors is spread across the time that is left.
 */

const LISTEN_PROMPT = `Transcribe this audio VERBATIM for burned-in video captions.

- Write every word in Roman (Latin) script. Hindi, Punjabi, Urdu and other Indian-language words exactly the way people type them on social media ("kya scene hai", "sun le", "paise nahi hain"). English words in normal English spelling, whatever the accent.
- Do not translate. Do not summarise. Do not tidy the speaker's grammar or swap their words for better ones: the caption must match what is heard. Spell correctly and punctuate normally.
- Do not skip anything: fast speech, a second speaker's short reply, and overlapping lines all go in, in the order they are heard.
- Leave out everything that is not a spoken word: no [laughs], no [music], no speaker names or labels.
- Split the text into short segments: one clause each, NEVER more than 10 words — break a long sentence into several. Give each a start and end in SECONDS from the start of the audio, with decimals (a line 61.4 seconds in is 61.4, not 1:01.4 and not 101.4).
- "language": the ISO 639-1 code of the language MOST of the words are in ("en" for mostly English even with an Indian accent, "hi" for mostly Hindi/Hinglish, "pa" for Punjabi).`;

const LISTEN_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    language: { type: "string" },
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: { type: "number" },
          end: { type: "number" },
          text: { type: "string" },
        },
        required: ["start", "end", "text"],
      },
    },
  },
  required: ["language", "segments"],
};

const LISTEN_VALIDATOR = z.object({
  language: z.string(),
  segments: z.array(z.object({ start: z.number(), end: z.number(), text: z.string() })),
});

export type HEARD = z.infer<typeof LISTEN_VALIDATOR>;

/** Whisper only accepts languages it knows; anything else falls back to the caller's hint. */
const WHISPER_LANGUAGES = new Set(["en", "hi", "pa", "ur", "bn", "mr", "gu", "ta", "te", "kn", "ml"]);

export async function listenWithGemini(
  audioPath: string,
  geminiApiKey?: string,
  /** false = one round only. `verified` has a judge to fall back on and should not wait a minute for Gemini. */
  patient = true,
): Promise<HEARD> {
  // "The model is experiencing high demand" (503) comes and goes within a
  // minute, and giving up sends the clip back to Whisper alone — the very
  // failure this listener exists to prevent. So: the channel's own key, then
  // the shared pool, and the whole round again after a pause, twice.
  let last: unknown;
  for (const waitMs of patient ? [0, 20_000, 45_000] : [0]) {
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    for (const key of geminiApiKey ? [geminiApiKey, undefined] : [undefined]) {
      try {
        return await listenOnce(audioPath, key);
      } catch (err) {
        last = err;
      }
    }
  }
  throw last;
}

async function listenOnce(audioPath: string, geminiApiKey?: string): Promise<HEARD> {
  const { data } = await withGeminiKeyPoolRetry(
    async (apiKey) => {
      const uploaded = await uploadFileToGemini(audioPath, "audio/flac", apiKey);
      const active = await waitForGeminiFileActive(uploaded.name, apiKey);
      return generateStructuredContent<HEARD>({
        model: MEDIA_GEMINI_MODEL.DEFAULT,
        parts: [
          { file_data: { mime_type: active.mimeType, file_uri: active.uri } },
          { text: LISTEN_PROMPT },
        ],
        responseSchema: LISTEN_RESPONSE_SCHEMA,
        thinkingLevel: "low",
        apiKey,
        zodValidator: LISTEN_VALIDATOR,
      });
    },
    "caption listen",
    geminiApiKey ? [geminiApiKey] : undefined,
  );
  const segments = data.segments
    .map((s) => ({ ...s, text: s.text.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim() }))
    .filter((s) => s.text.length > 0);
  if (segments.length === 0) throw new Error("the listener heard no words");
  // Past the first minute the listener sometimes writes 1:01.4 as 101.4. Read
  // any time from 100 up as minutes-and-seconds; the caller clamps to the clip.
  const asSeconds = (t: number): number => (t >= 100 ? Math.floor(t / 100) * 60 + (t % 100) : t);
  for (const seg of segments) {
    seg.start = asSeconds(seg.start);
    seg.end = asSeconds(seg.end);
  }
  const language = data.language.trim().toLowerCase().slice(0, 2);
  return { language, segments };
}

/** The language to ask Whisper for: the listener's, when Whisper knows it. */
export function whisperLanguageFor(heard: HEARD, hint?: string): string | undefined {
  return WHISPER_LANGUAGES.has(heard.language) ? heard.language : hint;
}

const norm = (w: string): string => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/**
 * Give every heard word a time.
 *
 * Two independent clocks, each wrong in its own way. The listener's segment
 * times are everywhere but only good to a second or two. Whisper's word
 * timings are exact — where it understood the words. On mixed speech one
 * Whisper pass understands the Hindi and garbles the English, and a pass in
 * the other language does the opposite, so each `timed` pass is aligned to the
 * heard text on its own (a global alignment: both lists are in spoken order)
 * and a word takes its time from whichever pass recognised it.
 *
 * Such a match is only believed inside the listener's window for that word: a
 * "match" on a common word ("hai", "ko") several seconds away is coincidence,
 * and one of those drags every word after it to the wrong time. Words nobody
 * anchored are spread, by length, across the time left between their anchored
 * neighbours and inside their own segment's window — so the worst a word can
 * be off is the length of one short segment, not the length of the clip.
 */
export function alignHeardToTimings(
  heard: HEARD,
  timed: GROQ_TRANSCRIPTION_WORD[] | GROQ_TRANSCRIPTION_WORD[][],
  durationSeconds: number,
): { words: GROQ_TRANSCRIPTION_WORD[]; anchoredShare: number } {
  const passes = (Array.isArray(timed[0]) ? timed : [timed]) as GROQ_TRANSCRIPTION_WORD[][];
  type Ref = { word: string; key: string; segStart: number; segEnd: number };
  const refs: Ref[] = [];
  let floor = 0;
  for (const seg of heard.segments) {
    // Segment times in order and inside the clip, whatever the listener wrote.
    const start = Math.max(floor, Math.min(seg.start, durationSeconds));
    const end = Math.max(start, Math.min(seg.end, durationSeconds));
    floor = start;
    for (const word of seg.text.split(/\s+/).filter(Boolean)) {
      refs.push({ word, key: norm(word), segStart: start, segEnd: end });
    }
  }
  const N = refs.length;
  const SLACK = 2.5;
  const GAP = -0.6;
  const best: Array<{ start: number; end: number; sim: number } | undefined> = new Array(N);

  for (const pass of passes) {
    const slots = pass.map((w) => ({ ...w, key: norm(w.word) })).filter((w) => w.key);
    const M = slots.length;
    if (M === 0) continue;
    const sims = (i: number, j: number): number => similarity(refs[i].key, slots[j].key);
    const pair = (i: number, j: number): number => {
      const v = sims(i, j);
      return v >= 0.75 ? 2 : v >= 0.5 ? 0.8 : -1;
    };
    const score: Float32Array[] = Array.from({ length: N + 1 }, () => new Float32Array(M + 1));
    for (let i = 1; i <= N; i++) score[i][0] = i * GAP;
    for (let j = 1; j <= M; j++) score[0][j] = j * GAP;
    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= M; j++) {
        score[i][j] = Math.max(score[i - 1][j - 1] + pair(i - 1, j - 1), score[i - 1][j] + GAP, score[i][j - 1] + GAP);
      }
    }
    for (let i = N, j = M; i > 0 && j > 0; ) {
      const here = score[i][j];
      if (Math.abs(here - (score[i - 1][j - 1] + pair(i - 1, j - 1))) < 1e-4) {
        const sim = sims(i - 1, j - 1);
        const r = refs[i - 1];
        const slot = slots[j - 1];
        const timedSeg = r.segEnd - r.segStart < durationSeconds * 0.9;
        const believable = !timedSeg || (slot.start >= r.segStart - SLACK && slot.start <= r.segEnd + SLACK);
        if (sim >= 0.5 && believable && (!best[i - 1] || sim > best[i - 1]!.sim)) {
          best[i - 1] = { start: slot.start, end: slot.end, sim };
        }
        i--;
        j--;
      } else if (Math.abs(here - (score[i - 1][j] + GAP)) < 1e-4) {
        i--;
      } else {
        j--;
      }
    }
  }

  // Anchors from two passes must still run forward in time; drop the ones that do not.
  let last = -1;
  for (let i = 0; i < N; i++) {
    const a = best[i];
    if (!a) continue;
    if (a.start < last - 0.05) best[i] = undefined;
    else last = a.start;
  }

  const out: GROQ_TRANSCRIPTION_WORD[] = new Array(N);
  let anchored = 0;
  for (let i = 0; i < N; i++) {
    if (best[i]) {
      out[i] = { word: refs[i].word, start: best[i]!.start, end: best[i]!.end };
      anchored++;
    }
  }

  for (let i = 0; i < N; ) {
    if (out[i]) {
      i++;
      continue;
    }
    let k = i;
    while (k < N && !out[k]) k++;
    const run = refs.slice(i, k);
    let lo = i > 0 ? out[i - 1].end : 0;
    let hi = k < N ? out[k].start : durationSeconds;
    if (run.every((r) => r.segEnd - r.segStart < durationSeconds * 0.9)) {
      const narrowedLo = Math.max(lo, Math.min(...run.map((r) => r.segStart)) - 0.5);
      const narrowedHi = Math.min(hi, Math.max(...run.map((r) => r.segEnd)) + 0.5);
      if (narrowedHi - narrowedLo >= run.length * 0.1) {
        lo = narrowedLo;
        hi = narrowedHi;
      }
    }
    if (hi - lo < run.length * 0.06) hi = Math.min(durationSeconds, lo + run.length * 0.06);
    const total = run.reduce((n, r) => n + Math.max(1, r.key.length), 0);
    let t = lo;
    run.forEach((r, n) => {
      const span = ((hi - lo) * Math.max(1, r.key.length)) / total;
      out[i + n] = { word: r.word, start: t, end: t + span };
      t += span;
    });
    i = k;
  }

  // Monotonic, non-overlapping, never past the end of the clip.
  let cursor = 0;
  for (const w of out) {
    w.start = Math.max(cursor, Math.min(w.start, durationSeconds));
    w.end = Math.max(w.start + 0.05, Math.min(w.end, durationSeconds + 0.05));
    cursor = w.start;
  }
  return { words: out, anchoredShare: N === 0 ? 0 : anchored / N };
}

/**
 * `listener: "verified"` — the judge.
 *
 * Claude cannot hear: it takes text and images, and refuses an audio file
 * outright (tried). What it can do is what an editor does with three bad
 * transcripts of one tape: read them against each other and write down what
 * was said. Measured on a 65-second Hindi/English clip with NO listener's
 * transcript to lean on — only Whisper run as Hindi, Whisper run as English
 * (which translates the Hindi, uselessly, but gets the English right) — it
 * rebuilt about nine tenths of the line the listener had heard, got the number
 * right that YouTube's captions had wrong, and marked the two stretches no
 * transcript covered as unclear instead of inventing them.
 *
 * So it is called exactly when it is needed: when the listener is unavailable
 * (its free tier answers "high demand" some of the time), or when the listener
 * and Whisper disagree about too much of the clip to trust either alone.
 */
const JUDGE_VALIDATOR = z.object({
  language: z.string(),
  segments: z.array(z.object({ i: z.number().int(), text: z.string() })),
});

/** New Claude sessions are the metered thing; one batch of clips shares a session. */
let judgeSession: { id: string; at: number } | undefined;
const JUDGE_SESSION_TTL_MS = 40 * 60_000;

export type WITNESS = { label: string; note: string; text: string };
export type BASE_SEGMENT = { start: number; end: number; text: string };

/**
 * `base` is the timeline: numbered lines with the times they were said. The
 * judge returns the corrected words for each number and nothing else — it has
 * no way to know when anything was said, and when it was asked for times it
 * guessed, ten seconds wrong in places.
 */
export async function judgeWithClaude(
  base: BASE_SEGMENT[],
  baseLabel: string,
  witnesses: WITNESS[],
  durationSeconds: number,
): Promise<{ heard: HEARD; unclearStretches: number }> {
  const numbered = base.map((b, i) => `#${i} [${b.start.toFixed(1)}-${b.end.toFixed(1)}] ${b.text}`).join("\n");
  const prompt =
    `You are producing burned-in captions for a ${Math.round(durationSeconds)}-second clip of an Indian podcast. ` +
    "Speakers mix Hindi, Punjabi and English. You cannot hear the audio. Below are imperfect transcripts of the SAME audio; " +
    "every line starts with the time it was said, [start-end] in seconds. " +
    "Work out what was actually said, verbatim, in Roman (Latin) script: Hindi and Punjabi words the way people type them " +
    '("kya kiya inhone"), English words in English. Do not translate anything, do not summarise, do not tidy the grammar, ' +
    "and do not add words that no transcript supports. Where the transcripts disagree, choose the reading that makes sense " +
    "for a real speaker and is supported by at least one of them; prefer a transcript that HEARD the audio in the right " +
    "language over one that translated it. Where no transcript is usable for a stretch, write [unclear] rather than " +
    "inventing words.\n\n" +
    `### TIMELINE — ${baseLabel}. These numbered lines are the timeline you must keep.\n${numbered}\n\n` +
    witnesses.map((w) => `### ${w.label} (${w.note})\n${w.text}`).join("\n\n") +
    "\n\nFor EVERY numbered timeline line, return the words that were really said during that line's time span, using the " +
    "other transcripts' timestamps to see which of their words belong to it. Keep each line's own number; never merge, " +
    "split, reorder or drop lines. A line that is already right comes back unchanged; a line where nothing was said comes " +
    'back as an empty string.\n\nReturn ONLY JSON: {"language": "<ISO 639-1 code of the language most of the words ' +
    'are in>", "segments": [{"i": 0, "text": "..."}]}';

  const reuse = judgeSession && Date.now() - judgeSession.at < JUDGE_SESSION_TTL_MS ? judgeSession.id : undefined;
  const { data, sessionId } = await askClaudeForJson({
    prompt,
    zodValidator: JUDGE_VALIDATOR,
    maxAttempts: 2,
    timeoutSeconds: 300,
    exhaustedErrorPrefix: "caption judge failed",
    ...(reuse ? { sessionId: reuse } : {}),
  });
  if (sessionId) judgeSession = { id: sessionId, at: Date.now() };

  const corrected = new Map(data.segments.map((seg) => [seg.i, seg.text]));
  let unclearStretches = 0;
  const segments = base
    .map((b, i) => {
      const raw = corrected.has(i) ? corrected.get(i)! : b.text;
      unclearStretches += (raw.match(/\[unclear\]/gi) ?? []).length;
      return { start: b.start, end: b.end, text: raw.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim() };
    })
    .filter((seg) => seg.text.length > 0);
  if (segments.length === 0) throw new Error("the judge returned no words");
  return { heard: { language: data.language.trim().toLowerCase().slice(0, 2), segments }, unclearStretches };
}
