import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import { AIXEL_MEDIA } from "../../../media";
import type { DIARIZED_TRANSCRIPT } from "../types";
import { DIARIZED_TRANSCRIPT_SCHEMA } from "./schemas";

/**
 * Server-side transcript handoff between the diarize ops and `segment`.
 *
 * A diarized transcript is large — a 72-minute, 8-speaker episode measured
 * 186KB of JSON, ~47K tokens (2026-09-10). Returned inline, it floods the
 * agent's context on the way out of diarize, and `segment` then needs the
 * model to re-emit the whole thing as a tool argument, which it cannot do
 * reliably; the cron run that surfaced this ended up slicing the transcript
 * into windows with jq and a Python script. So the diarize ops always write
 * the transcript here and return its path, and `segment` accepts that path.
 * The transcript never has to pass through the model at all.
 */

export type TRANSCRIPT_SUMMARY = {
  speaker_count: number;
  speakers: DIARIZED_TRANSCRIPT["speakers"];
  segmentCount: number;
  durationSeconds: number;
  textChars: number;
};

function toSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function summarizeTranscript(t: DIARIZED_TRANSCRIPT): TRANSCRIPT_SUMMARY {
  const last = t.segments[t.segments.length - 1];
  return {
    speaker_count: t.speaker_count,
    speakers: t.speakers,
    segmentCount: t.segments.length,
    durationSeconds: last ? toSeconds(last.end) : 0,
    textChars: t.segments.reduce((n, s) => n + s.text.length, 0),
  };
}

/** Pretty-printed (one field per line) so an agent can `read_file` a line range around a moment. */
export async function saveDiarizedTranscript(t: DIARIZED_TRANSCRIPT, label: string): Promise<string> {
  await mkdir(AIXEL_MEDIA.MEDIA_TRANSCRIPTS, { recursive: true });
  const safe = label.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "transcript";
  const path = join(AIXEL_MEDIA.MEDIA_TRANSCRIPTS, `${safe}-${randomUUID().slice(0, 8)}.json`);
  await writeFile(path, JSON.stringify(t, null, 2), "utf8");
  return path;
}

/**
 * Load a transcript written by a diarize op. Only paths inside the transcripts
 * directory are accepted: `segment` sends whatever it loads to an LLM, so a
 * free-form path would let a tool call ship any file on this host to a model.
 */
export async function loadDiarizedTranscript(path: string): Promise<DIARIZED_TRANSCRIPT> {
  const root = resolve(AIXEL_MEDIA.MEDIA_TRANSCRIPTS) + sep;
  const full = resolve(path);
  if (!full.startsWith(root)) {
    throw new Error(`diarizedPath must be a transcriptPath returned by a diarize op (under ${root})`);
  }
  const parsed = DIARIZED_TRANSCRIPT_SCHEMA.safeParse(JSON.parse(await readFile(full, "utf8")));
  if (!parsed.success) {
    throw new Error(`diarizedPath does not contain a valid diarized transcript: ${full}`);
  }
  return parsed.data;
}

/**
 * Wrap a diarize result: always write the transcript and add `transcriptPath`
 * + a summary; drop the inline transcript when `includeTranscript` is false.
 */
export async function withTranscriptFile<T extends { transcript: DIARIZED_TRANSCRIPT }>(
  result: T,
  label: string,
  includeTranscript: boolean | undefined,
): Promise<Omit<T, "transcript"> & { transcript?: DIARIZED_TRANSCRIPT; transcriptPath: string; transcriptSummary: TRANSCRIPT_SUMMARY }> {
  const transcriptPath = await saveDiarizedTranscript(result.transcript, label);
  const { transcript, ...rest } = result;
  return {
    ...rest,
    ...(includeTranscript === false ? {} : { transcript }),
    transcriptPath,
    transcriptSummary: summarizeTranscript(transcript),
  };
}
