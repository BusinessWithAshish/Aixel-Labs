import { MEDIA_CAPTION } from "../constants";
import type { GROQ_TRANSCRIPTION_SEGMENT, GROQ_TRANSCRIPTION_WORD } from "../transcribe/types";

/** One rendered subtitle cue: absolute seconds, already line-broken. */
export type CAPTION_CUE = {
  start: number;
  end: number;
  /** One entry per rendered line — joined with `\n` on serialize. */
  lines: string[];
};

export type WRAP_OPTIONS = {
  maxCharsPerLine: number;
  maxLinesPerCue: number;
  uppercase: boolean;
};

function formatTimestamp(seconds: number, msSeparator: "," | "."): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${pad(Math.floor(totalMs / 3_600_000))}:` +
    `${pad(Math.floor((totalMs % 3_600_000) / 60_000))}:` +
    `${pad(Math.floor((totalMs % 60_000) / 1000))}${msSeparator}` +
    `${pad(totalMs % 1000, 3)}`
  );
}

function parseTimestamp(raw: string): number {
  const m = raw.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
  if (!m) return Number.NaN;
  const [, h, mm, ss, ms] = m;
  return (
    Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, "0")) / 1000
  );
}

/**
 * Greedily pack words into lines of at most `maxCharsPerLine`. A single word
 * longer than the limit gets its own line rather than being hyphenated —
 * breaking a word mid-glyph reads far worse than one over-long line, and at
 * caption font sizes it is rare enough not to be worth the complexity.
 */
function packLines(words: string[], maxCharsPerLine: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Split one transcript segment into cues of at most `maxLinesPerCue` lines.
 *
 * Timing comes from real word timestamps when Groq returned them for this
 * span, which is the whole reason `wordTimestamps` is requested: a cue then
 * appears exactly when its first word is spoken. Without them we fall back to
 * apportioning the segment's duration by character count — defensible, but
 * visibly looser on segments that mix a long pause with fast speech.
 */
function segmentToCues(
  segment: GROQ_TRANSCRIPTION_SEGMENT,
  words: GROQ_TRANSCRIPTION_WORD[],
  options: WRAP_OPTIONS,
): CAPTION_CUE[] {
  const text = segment.text.trim();
  if (!text) return [];

  const spoken = words.filter((w) => w.start >= segment.start - 0.01 && w.end <= segment.end + 0.01);
  const tokens = text.split(/\s+/).filter(Boolean);
  const lines = packLines(tokens, options.maxCharsPerLine);

  const cues: CAPTION_CUE[] = [];
  let tokenCursor = 0;
  const totalChars = tokens.join(" ").length || 1;
  let charCursor = 0;
  const segmentDuration = Math.max(0, segment.end - segment.start);

  for (let i = 0; i < lines.length; i += options.maxLinesPerCue) {
    const group = lines.slice(i, i + options.maxLinesPerCue);
    const groupTokenCount = group.reduce((n, line) => n + line.split(" ").length, 0);
    const groupChars = group.join(" ").length;

    const groupWords = spoken.slice(tokenCursor, tokenCursor + groupTokenCount);
    let start: number;
    let end: number;
    if (spoken.length === tokens.length && groupWords.length > 0) {
      start = groupWords[0].start;
      end = groupWords[groupWords.length - 1].end;
    } else {
      start = segment.start + (charCursor / totalChars) * segmentDuration;
      end = segment.start + ((charCursor + groupChars) / totalChars) * segmentDuration;
    }

    cues.push({
      start,
      end: Math.max(end, start + MEDIA_CAPTION.MIN_CUE_SECONDS),
      lines: options.uppercase ? group.map((l) => l.toUpperCase()) : group,
    });

    tokenCursor += groupTokenCount;
    charCursor += groupChars + 1;
  }

  return cues;
}

/** Whisper segments (+ optional word timings) -> readable, line-broken cues. */
export function buildCues(
  segments: GROQ_TRANSCRIPTION_SEGMENT[],
  words: GROQ_TRANSCRIPTION_WORD[],
  options: WRAP_OPTIONS,
): CAPTION_CUE[] {
  const cues = segments.flatMap((segment) => segmentToCues(segment, words, options));
  // Overlapping cues make libass stack two captions on screen at once. Word
  // timings from adjacent segments can overlap slightly, so clamp forward.
  for (let i = 1; i < cues.length; i += 1) {
    if (cues[i].start < cues[i - 1].end) {
      cues[i - 1].end = Math.max(cues[i - 1].start, cues[i].start - 0.01);
    }
  }
  return cues.filter((cue) => cue.end > cue.start && cue.lines.length > 0);
}

/**
 * Parse caller-supplied SRT or VTT into the same cue shape. Deliberately
 * lenient about the things that differ between the two formats (the `WEBVTT`
 * header, `.` vs `,` before milliseconds, cue identifiers being optional)
 * because callers paste both interchangeably; strict about timing, since a
 * malformed timestamp silently mistimes the whole clip.
 */
export function parseSubtitles(raw: string, options: WRAP_OPTIONS): CAPTION_CUE[] {
  const body = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/^WEBVTT[^\n]*\n/, "");
  const cues: CAPTION_CUE[] = [];

  for (const block of body.split(/\n{2,}/)) {
    const blockLines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (blockLines.length === 0) continue;

    const arrowIndex = blockLines.findIndex((l) => l.includes("-->"));
    if (arrowIndex === -1) continue; // no timing line: a stray index or comment block

    const [rawStart, rawEnd] = blockLines[arrowIndex].split("-->");
    const start = parseTimestamp(rawStart ?? "");
    const end = parseTimestamp((rawEnd ?? "").split(/\s+/)[0] ?? "");
    if (Number.isNaN(start) || Number.isNaN(end)) continue;

    const text = blockLines.slice(arrowIndex + 1).join(" ").trim();
    if (!text) continue;

    // Re-wrap supplied text too: whatever produced it had no idea what font
    // size or frame width it would land in.
    const lines = packLines(text.split(/\s+/), options.maxCharsPerLine).slice(
      0,
      options.maxLinesPerCue,
    );
    cues.push({
      start,
      end: Math.max(end, start + MEDIA_CAPTION.MIN_CUE_SECONDS),
      lines: options.uppercase ? lines.map((l) => l.toUpperCase()) : lines,
    });
  }

  return cues;
}

export function cuesToSrt(cues: CAPTION_CUE[]): string {
  return cues
    .map((cue, index) => {
      const start = formatTimestamp(cue.start, ",");
      const end = formatTimestamp(cue.end, ",");
      return `${index + 1}\n${start} --> ${end}\n${cue.lines.join("\n")}\n`;
    })
    .join("\n");
}
