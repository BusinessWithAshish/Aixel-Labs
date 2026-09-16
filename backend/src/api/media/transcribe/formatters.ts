import { MEDIA_TRANSCRIBE } from "./constants";
import type {
  GROQ_TRANSCRIPTION_SEGMENT,
  GROQ_TRANSCRIPTION_WORD,
  GROQ_VERBOSE_JSON_RESPONSE,
} from "./types";

/**
 * Drops the spans Whisper itself flags as probably invented: a looping phrase
 * ("I was like, I was like, …") inflates `compression_ratio`, and words
 * dreamt up over music or applause score a high `no_speech_prob`. Anything
 * that displays or times words (captions, natural clip edges) wants them gone
 * — on screen they are garbage, and as timings they are noise.
 */
export function dropUnreliableSpans(
  segments: GROQ_TRANSCRIPTION_SEGMENT[],
  words: GROQ_TRANSCRIPTION_WORD[],
): { segments: GROQ_TRANSCRIPTION_SEGMENT[]; words: GROQ_TRANSCRIPTION_WORD[] } {
  const unreliable = segments.filter(
    (s) =>
      (s.compression_ratio ?? 0) > MEDIA_TRANSCRIBE.MAX_COMPRESSION_RATIO ||
      (s.no_speech_prob ?? 0) > MEDIA_TRANSCRIBE.MAX_NO_SPEECH_PROB,
  );
  if (unreliable.length === 0) return { segments, words };
  const tolerance = MEDIA_TRANSCRIBE.SPAN_TOLERANCE_SECONDS;
  return {
    segments: segments.filter((s) => !unreliable.includes(s)),
    words: words.filter(
      (w) => !unreliable.some((s) => w.start >= s.start - tolerance && w.end <= s.end + tolerance),
    ),
  };
}

function formatTimestamp(seconds: number, msSeparator: "," | "."): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;

  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${msSeparator}${pad(ms, 3)}`;
}

export function toText(response: GROQ_VERBOSE_JSON_RESPONSE): string {
  return response.text.trim();
}

export function toJson(response: GROQ_VERBOSE_JSON_RESPONSE): string {
  return JSON.stringify(response, null, 2);
}

export function toSrt(segments: GROQ_TRANSCRIPTION_SEGMENT[]): string {
  return segments
    .map((segment, index) => {
      const start = formatTimestamp(segment.start, ",");
      const end = formatTimestamp(segment.end, ",");
      return `${index + 1}\n${start} --> ${end}\n${segment.text.trim()}\n`;
    })
    .join("\n");
}

export function toVtt(segments: GROQ_TRANSCRIPTION_SEGMENT[]): string {
  const cues = segments
    .map((segment, index) => {
      const start = formatTimestamp(segment.start, ".");
      const end = formatTimestamp(segment.end, ".");
      return `${index + 1}\n${start} --> ${end}\n${segment.text.trim()}\n`;
    })
    .join("\n");
  return `WEBVTT\n\n${cues}`;
}
