import { readFile } from "node:fs/promises";

/**
 * The episode transcript research already has (YouTube's own captions, saved
 * by `youtube` op=diarize as `{ segments: [{ start: "m:ss", end, text }] }`),
 * cut down to the stretch this clip was taken from.
 *
 * A second witness for the editor, and a free one: no audio is sent anywhere.
 * Its lines carry whole-second times and overlap each other, so the excerpt
 * deliberately runs a little past both ends of the clip — the editor is told
 * that the first and last few words may not be in the clip at all.
 */
const SLACK_SECONDS = 3;

function toSeconds(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  const parts = value.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export async function readReferenceExcerpt(
  transcriptPath: string,
  startSeconds: number,
  endSeconds: number,
): Promise<string | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(transcriptPath, "utf8"));
  } catch {
    return undefined;
  }
  const segments = (parsed as { segments?: Array<{ start?: unknown; end?: unknown; text?: unknown }> }).segments;
  if (!Array.isArray(segments)) return undefined;
  const lines: string[] = [];
  let lastText = "";
  for (const seg of segments) {
    const start = toSeconds(seg.start);
    const end = toSeconds(seg.end) ?? start;
    if (start === undefined || end === undefined || typeof seg.text !== "string") continue;
    if (end < startSeconds - SLACK_SECONDS || start > endSeconds + SLACK_SECONDS) continue;
    const text = seg.text.replace(/\s+/g, " ").trim();
    if (!text || text === lastText) continue;
    lastText = text;
    lines.push(`[${Math.max(0, start - startSeconds).toFixed(0)}s] ${text}`);
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
}
