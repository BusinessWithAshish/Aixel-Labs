import type { JSON3_RESPONSE } from "../../youtube/transcript/types";
import { skeleton, soundWords, soundsOf } from "./sound";

export type CaptionLine = {
  startMs: number;
  text: string;
  /** When each word is said, in ms from the start of the video. Null when the track has no word timing. */
  wordMs: number[] | null;
  /** What this line is found by: the skeletons of its words and the next line's, since a sentence often crosses two. */
  keys: string[];
};

/**
 * JSON3 events to lines, keeping word timing. Auto captions give each word its own
 * `seg` with a `tOffsetMs`; human captions usually give one `seg` per line, which
 * has none.
 */
export function parseCaptionLines(json3: JSON3_RESPONSE): CaptionLine[] {
  const lines: Array<Omit<CaptionLine, "keys">> = [];

  for (const event of json3.events ?? []) {
    const segs = event.segs ?? [];
    const text = segs.map((seg) => seg.utf8 ?? "").join("").replace(/\n/g, " ").trim();
    if (!text) continue;

    const startMs = event.tStartMs ?? 0;
    const wordMs: number[] = [];
    for (const seg of segs) {
      for (const _word of soundWords(seg.utf8 ?? "")) wordMs.push(startMs + (seg.tOffsetMs ?? 0));
    }
    if (wordMs.length === 0) continue;

    lines.push({
      startMs,
      text,
      wordMs: segs.length > 1 ? wordMs : null,
    });
  }

  return lines.map((line, i) => ({
    ...line,
    keys: [...new Set([...soundsOf(line.text), ...soundsOf(lines[i + 1]?.text ?? "")].map(skeleton))],
  }));
}
