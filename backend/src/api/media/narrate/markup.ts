import { round3 } from "./audio";
import { MEDIA_NARRATE } from "./constants";
import { respellToken } from "./hindi";
import type { NARRATE_PHRASE, NARRATE_RESPELLING, NARRATE_WORD } from "./types";

/** The caller's `{pause s}` / `{pace f}` markup. */
export const MARKUP = /\{\s*(pause|pace)\s+([0-9]*\.?[0-9]+)\s*s?\s*\}/gi;

export type PREPARED_TEXT = {
  /** Exactly what is sent to the engine, with its inline tags. */
  engineInput: string;
  /** The words a listener hears, tags and markup removed, after respelling. */
  spokenText: string;
  /**
   * The caller's own words, cleaned the same way and aligned one-for-one with
   * `spokenText`'s tokens — what captions should show.
   */
  displayTokens: string[];
  /** Every word that was spoken differently from how it was written. */
  respelled: NARRATE_RESPELLING[];
  /** True when `engineInput` carries `[rate:...]` tags, which the engine only honours when told to. */
  usesVoiceTags: boolean;
};

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const collapseSpaces = (value: string) => value.replace(/\s+/g, " ").trim();

/** Danda to full stop, square brackets out — see `prepareText` for why. */
export const normaliseSource = (text: string) => text.replace(/[।॥]/g, ".").replace(/[\[\]]/g, " ");

/**
 * Turns the caller's text into engine input.
 *
 * - `।` / `॥` become `.`. Kokoro's phonemiser deletes the Devanagari danda, so
 *   the model never sees a sentence end and runs the sentences together
 *   (measured: 0.01 s of silence after `।`, 0.43 s after `.`).
 * - Square brackets are removed so caller text can never inject an engine tag.
 * - `{pause s}` becomes a `[pause:Ns]` tag shortened by the engine's own
 *   overhead, so a requested 0.6 s is 0.6 s.
 * - `{pace f}` becomes a `[rate:f]` tag.
 * - `pronunciations` respell whole words before any of that.
 */
export function prepareText(
  text: string,
  pronunciations: Record<string, string> | undefined,
): PREPARED_TEXT {
  let source = normaliseSource(text);

  // A key with a space cannot be matched token by token; swap it out first.
  const own: Record<string, string> = {};
  for (const [word, respelling] of Object.entries(pronunciations ?? {})) {
    if (!word) continue;
    if (/\s/.test(word)) {
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, "gu");
      source = source.replace(pattern, respelling);
    } else {
      own[word] = respelling;
    }
  }

  let usesVoiceTags = false;
  const engineParts: string[] = [];
  const spokenParts: string[] = [];
  const displayParts: string[] = [];
  const respelled: NARRATE_RESPELLING[] = [];
  const seen = new Set<string>();

  /** Respells one stretch of plain text, keeping its whitespace. */
  const speak = (chunk: string) => {
    const spoken: string[] = [];
    for (const piece of chunk.split(/(\s+)/)) {
      if (!piece || /^\s+$/.test(piece)) {
        spoken.push(piece);
        continue;
      }
      const result = respellToken(piece, own);
      spoken.push(result.spoken);
      if (result.respelling && !seen.has(result.respelling.from)) {
        seen.add(result.respelling.from);
        respelled.push(result.respelling);
      }
    }
    engineParts.push(spoken.join(""));
    spokenParts.push(spoken.join(""));
    displayParts.push(chunk);
  };

  let cursor = 0;
  for (const match of source.matchAll(MARKUP)) {
    speak(source.slice(cursor, match.index));
    cursor = (match.index ?? 0) + match[0].length;
    const value = Number(match[2]);
    if (match[1].toLowerCase() === "pause") {
      const seconds = Math.min(value, MEDIA_NARRATE.PAUSE_MAX_SECONDS) - MEDIA_NARRATE.PAUSE_TAG_OVERHEAD_SECONDS;
      if (seconds >= MEDIA_NARRATE.PAUSE_TAG_MIN_SECONDS) {
        engineParts.push(` [pause:${seconds.toFixed(2)}s] `);
      }
    } else if (value > 0) {
      usesVoiceTags = true;
      engineParts.push(` [rate:${value.toFixed(2)}] `);
    }
  }
  speak(source.slice(cursor));

  return {
    engineInput: collapseSpaces(engineParts.join("")),
    spokenText: collapseSpaces(spokenParts.join(" ")),
    displayTokens: collapseSpaces(displayParts.join(" ")).split(" ").filter(Boolean),
    respelled,
    usesVoiceTags,
  };
}

/** A word that ends on a clause or sentence break — a natural place to change the picture. */
const BREAKS_AFTER = /[,;:.!?…—–]$/;

/**
 * Groups the spoken words into footage-matching phrases of 2-4 words, closing a
 * phrase at a clause break or at the size limit, and folding a lone word into a
 * neighbour. Punctuation comes from the cleaned text's own tokens when they
 * line up one-to-one with the engine's words; otherwise only size decides.
 */
export function buildPhrases(
  words: NARRATE_WORD[],
  spokenText: string,
  durationSeconds: number,
): NARRATE_PHRASE[] {
  if (words.length === 0) return [];
  const tokens = spokenText.split(/\s+/).filter(Boolean);
  const hasBreaks = tokens.length === words.length;

  const groups: number[][] = [];
  let current: number[] = [];
  words.forEach((_, index) => {
    current.push(index);
    const breakHere = hasBreaks && BREAKS_AFTER.test(tokens[index]);
    if (breakHere || current.length >= MEDIA_NARRATE.PHRASE_MAX_WORDS) {
      groups.push(current);
      current = [];
    }
  });
  if (current.length > 0) groups.push(current);

  // A lone word joins the phrase before it (one word over the limit is better
  // than a one-word shot). It only joins the NEXT phrase when it opens the
  // script — folding it forward would drag it across a sentence break.
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].length >= MEDIA_NARRATE.PHRASE_MIN_WORDS || groups.length === 1) continue;
    if (i > 0) {
      groups[i - 1].push(...groups[i]);
    } else {
      groups[i + 1].unshift(...groups[i]);
    }
    groups.splice(i, 1);
    i = Math.max(-1, i - 2);
  }

  // Tile [0, duration]: a phrase's footage runs from where it starts being
  // spoken to where the next one does. Timestamps can overlap a hair at the
  // engine's chunk boundaries, so keep the starts monotonic.
  let floor = 0;
  const starts = groups.map((group, index) => {
    const raw = index === 0 ? 0 : words[group[0]].start;
    floor = Math.min(durationSeconds, Math.max(floor, raw));
    return floor;
  });
  return groups.map((group, index) => {
    const first = words[group[0]];
    const last = words[group[group.length - 1]];
    const tileEnd = index + 1 < groups.length ? starts[index + 1] : durationSeconds;
    return {
      n: index + 1,
      text: group.map((i) => words[i].word).join(" "),
      startSeconds: round3(first.start),
      endSeconds: round3(last.end),
      footageSeconds: round3(tileEnd - starts[index]),
    };
  });
}
