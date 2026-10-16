import { z } from "zod";

import { askClaudeForJson } from "../../claude/structured-json";
import { GROQ_CHAT_COMPLETIONS_URL, MEDIA_GROQ_TEXT_MODEL } from "../constants";

/**
 * The caption editor: one text pass that turns what the ear heard into the
 * words that go on screen.
 *
 * It gets the ear's transcript of exactly this clip (complete, in order, but
 * spelt as a transliteration and now and then misheard) and, when research has
 * it, YouTube's own captions for the same stretch of the episode (a second,
 * independent hearing; often in Devanagari; whole-second timing, so it runs a
 * little past both ends of the clip). It writes the clip's words once, the way
 * an Indian types Hinglish, fixing a mishearing only where the two disagree
 * and YouTube's reading makes sense. It never translates and never adds
 * anything neither witness heard.
 *
 * Groq first (a separate, large quota; ~2 s), Claude if Groq fails, and the
 * ear's own text if both do. Timing is not its job: `align.ts` places every
 * word it returns in the audio afterwards.
 */
const EDITED = z.object({ language: z.string(), text: z.string().min(1) });
const EDITOR_TIMEOUT_MS = 120_000;

function prompt(heard: string, reference: string | undefined, durationSeconds: number, json: boolean): string {
  return [
    `You are editing the burned-in captions of a ${Math.round(durationSeconds)}-second clip from an Indian podcast.`,
    "Speakers mix Hindi (sometimes Urdu, Punjabi or Gujarati) with English mid-sentence. You cannot hear the audio.",
    "",
    "### EAR — a speech model that heard exactly this clip, start to end",
    "Complete and in the right order, so it decides WHICH words are in the clip and in what order. Its weaknesses:",
    "it spells Hindi as a dictionary transliteration (\"hamaare oopar\", \"sirph\", \"aae\", \"kyon\", \"vah\") instead of the way",
    "people type, it sometimes mishears a word (a name, a number, an uncommon word), and it may end with a few invented words.",
    heard,
    ...(reference
      ? [
          "",
          "### YOUTUBE — the episode's own captions for the same stretch (a separate hearing; may be in Devanagari)",
          "Use it to correct names, numbers and words the EAR got wrong. It runs a few seconds past BOTH ends of the clip:",
          "its first and last lines can hold words that are NOT in the clip — never add those. Its times are approximate.",
          "If YOUTUBE is English where the EAR has Hindi, YOUTUBE is a TRANSLATION: ignore its wording there completely.",
          reference,
        ]
      : []),
    "",
    "### Write the captions",
    "- Exactly what was said, in the EAR's order, every word of it. Drop only obvious invented words at the very end",
    "  (a phrase that makes no sense and is not in YOUTUBE).",
    "- Roman (Latin) letters only. Hindi/Urdu/Punjabi/Gujarati words the way Indians type them on WhatsApp: \"hamare upar\",",
    "  \"sirf\", \"aaye\", \"kyun\", \"woh\", \"bahut\", \"nahi\", \"hai\". English words in normal English spelling. Names spelt correctly.",
    "- NEVER translate, not even one small word: \"aur\" stays \"aur\" (never \"and\"), \"lekin\" stays \"lekin\". A Hindi word stays",
    "  Hindi, an English word stays English, even if one witness shows a translation.",
    "- Start where the EAR starts and stop where the EAR stops. Never add a sentence from YOUTUBE that the EAR does not have.",
    "- Do not tidy grammar, do not summarise, do not add words neither witness has. Normal punctuation.",
    "- Respelling is your job; rewording is not. Keep the speaker's own words and forms even when they are informal or",
    "  ungrammatical: \"tu\" stays \"tu\" (never \"tum\"), \"cheez\" stays \"cheez\" (never \"baat\"), a repeated word stays repeated.",
    "  Change a word only to its right spelling, or when YOUTUBE clearly heard a different word at that spot.",
    "",
    json
      ? 'Return ONLY JSON: {"language": "<ISO 639-1 code of the language most words are in>", "text": "<the captions>"}'
      : "Reply with exactly two parts and nothing else: first a line `LANGUAGE: <ISO 639-1 code of the language most words are in>`, then the captions on the following lines.",
  ].join("\n");
}

/** A spelling-insensitive key: "hamaare", "hamare" and "humare" all become "hmr". */
function skeleton(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  // "aai" and "aayi", "ho" and "hoo": a word that is all vowels (or h/y/w) keys as "_".
  return w.replace(/(ph)/g, "f").replace(/[aeiouyhw]/g, "") || (w ? "_" : "");
}

/** Pairs of (heard index, edited index) in the longest common in-order run of words, by sound. */
function commonRun(a: string[], b: string[]): Array<[number, number]> {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs: Array<[number, number]> = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/**
 * Words the editor put before the first or after the last thing the ear heard
 * came from YouTube's excerpt, which runs past both ends of the clip: they were
 * said, just not in this clip (measured: a whole sentence from before the cut
 * prepended to a clip). One or two are left — a respelt first or last word does
 * not match by sound — but a run of three or more is cut.
 */
function trimToHeard(heard: string, edited: string): string {
  const a = heard.split(/\s+/).filter(Boolean).map(skeleton);
  const words = edited.split(/\s+/).filter(Boolean);
  const all = commonRun(a, words.map(skeleton));
  // Common words ("hai", "to", "don't") match by chance across a whole added
  // sentence, so the edges are taken from the first and last places where
  // three words in a row agree in both texts.
  const solid = (k: number) =>
    k + 2 < all.length &&
    all[k + 1][0] === all[k][0] + 1 && all[k + 2][0] === all[k][0] + 2 &&
    all[k + 1][1] === all[k][1] + 1 && all[k + 2][1] === all[k][1] + 2;
  const first = all.findIndex((_, k) => solid(k));
  if (first < 0) return edited;
  let last = first;
  for (let k = all.length - 3; k >= first; k--) if (solid(k)) { last = k + 2; break; }
  const pairs = all.slice(first, last + 1);
  let from = pairs[0][1];
  let to = pairs[pairs.length - 1][1];
  // Unmatched heard words at the edges excuse the same number of edited ones (respellings).
  from = Math.max(0, from - pairs[0][0]);
  to = Math.min(words.length - 1, to + (a.length - 1 - pairs[pairs.length - 1][0]));
  const lead = from;
  const tail = words.length - 1 - to;
  return words.slice(lead >= 3 ? from : 0, tail >= 3 ? to + 1 : words.length).join(" ");
}

/**
 * The editor may respell, fix a misheard word, drop an invented tail — not
 * rewrite. Two checks: the length stays close to what was heard (no summary,
 * no padding), and most of the heard words, in order, are still there by
 * sound (a translation keeps the length but loses this: on 2026-10-14 Groq
 * turned "aapne yahi mentality use kiya" into "did you use this same
 * mentality", copying an English YouTube track).
 */
function plausible(heard: string, edited: string): boolean {
  const a = heard.split(/\s+/).filter(Boolean).map(skeleton);
  const b = edited.split(/\s+/).filter(Boolean).map(skeleton);
  if (b.length < a.length * 0.75 || b.length > a.length * 1.3) return false;
  return commonRun(a, b).length >= a.length * 0.6;
}

/**
 * Plain text, not Groq's JSON mode: asked for JSON, gpt-oss on Groq refused
 * half the clips ("Failed to generate JSON") once the captions held quotes or
 * long Hindi. Two labelled parts parse just as reliably.
 */
async function editWithGroq(ask: string, apiKey?: string): Promise<{ text: string; language?: string }> {
  const key = apiKey || process.env.GROQ_API_KEY;
  if (!key) throw new Error("no Groq key");
  const res = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    // A hung connection must not hold the clip (and every clip queued behind it).
    signal: AbortSignal.timeout(EDITOR_TIMEOUT_MS),
    // A reasoning model: with the default effort it could spend its whole
    // budget thinking and return an empty answer (seen on 2 of 10 clips).
    body: JSON.stringify({
      model: MEDIA_GROQ_TEXT_MODEL.DEFAULT,
      messages: [{ role: "user", content: ask }],
      temperature: 0,
      reasoning_effort: "low",
      max_completion_tokens: 6000,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = (body.choices?.[0]?.message?.content ?? "").trim();
  const m = content.match(/^\s*LANGUAGE:\s*([a-z]{2})[^\n]*\n([\s\S]+)$/i);
  const text = (m ? m[2] : content).replace(/^captions:\s*/i, "").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Groq returned no captions");
  return { text, language: m?.[1].toLowerCase() };
}

export async function editCaptions(
  heard: string,
  reference: string | undefined,
  durationSeconds: number,
  groqApiKey?: string,
): Promise<{ text: string; language?: string; editor: "groq" | "claude" | "none"; fallbackReason?: string }> {
  const reasons: string[] = [];
  try {
    const data = await editWithGroq(prompt(heard, reference, durationSeconds, false), groqApiKey);
    data.text = trimToHeard(heard, data.text);
    if (plausible(heard, data.text)) return { text: data.text, language: data.language, editor: "groq" };
    reasons.push("groq rewrote the words instead of editing them");
  } catch (err) {
    reasons.push(`groq: ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`);
  }
  try {
    const { data } = await askClaudeForJson({ prompt: prompt(heard, reference, durationSeconds, true), zodValidator: EDITED, maxAttempts: 2, timeoutSeconds: 180, exhaustedErrorPrefix: "caption editor failed" });
    data.text = trimToHeard(heard, data.text);
    if (plausible(heard, data.text)) return { text: data.text, language: data.language, editor: "claude", fallbackReason: reasons.join("; ") };
    reasons.push("claude rewrote the words instead of editing them");
  } catch (err) {
    reasons.push(`claude: ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`);
  }
  return { text: heard, editor: "none", fallbackReason: reasons.join("; ") };
}
