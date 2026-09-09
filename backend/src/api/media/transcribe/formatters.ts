import type { GROQ_TRANSCRIPTION_SEGMENT, GROQ_VERBOSE_JSON_RESPONSE } from "./types";

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
