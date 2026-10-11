import { romanizeWords } from "./transliterate";

/**
 * Rewrites the text of an SRT/VTT in everyday Roman script, leaving every
 * timestamp and cue boundary alone — what `script: "roman"` does for words the
 * op transcribed itself, for subtitles the caller supplied.
 *
 * Reuses `romanizeWords`, so the same rules hold: Latin-script words are never
 * sent, a word that does not come back keeps its native spelling, and any
 * failure leaves the file untouched with the reason returned.
 */
export async function romanizeSubtitles(
  raw: string,
  groqApiKey?: string,
  geminiApiKey?: string,
): Promise<{ raw: string; romanized: boolean; fallbackReason?: string }> {
  const blocks = raw
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      const arrow = lines.findIndex((line) => line.includes("-->"));
      if (arrow === -1) return { head: lines, words: [] as string[] };
      return {
        head: lines.slice(0, arrow + 1),
        words: lines.slice(arrow + 1).join(" ").split(/\s+/).filter(Boolean),
      };
    });

  const flat = blocks.flatMap((block) => block.words.map((word) => ({ word, start: 0, end: 0 })));
  if (flat.length === 0) return { raw, romanized: false };

  const result = await romanizeWords(flat);
  if (!result.romanized) return { raw, romanized: false, fallbackReason: result.fallbackReason };

  let cursor = 0;
  const rebuilt = blocks.map((block) => {
    if (block.words.length === 0) return block.head.join("\n");
    const text = result.words
      .slice(cursor, cursor + block.words.length)
      .map((w) => w.word)
      .join(" ");
    cursor += block.words.length;
    return `${block.head.join("\n")}\n${text}`;
  });
  return { raw: rebuilt.join("\n\n"), romanized: true };
}
