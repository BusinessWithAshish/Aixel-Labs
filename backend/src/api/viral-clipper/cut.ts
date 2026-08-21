import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { snapClipBoundaries } from "./boundary-snap";
import { cleanupResolvedMediaSource, resolveMediaSource } from "./download";
import { cutClip, getMediaDurationSeconds } from "./ffmpeg-cut";
import type {
  CLIP_RANGE,
  VIRAL_CLIPPER_ASPECT_RATIO_VALUE,
  VIRAL_CLIPPER_CUT_RESPONSE,
  DIARIZED_TRANSCRIPT,
} from "./types";

/**
 * Where finished clips are written — local disk, not Blob storage. The host's
 * storage mount isn't known at code-authoring time, so it's configurable;
 * defaults to a project-relative folder for local dev.
 */
const VIRAL_CLIPPER_OUTPUT_DIR = resolve(
  process.env.VIRAL_CLIPPER_OUTPUT_DIR || join(process.cwd(), "storage", "viral-clipper-cuts"),
);

/**
 * Resolves the source video (local path or URL — see `resolveMediaSource`),
 * cuts each requested clip (boundary-snapped against `diarized` when
 * provided — see `boundary-snap.ts`) directly into `VIRAL_CLIPPER_OUTPUT_DIR`,
 * and cleans up the resolved source's own temp files. Content-agnostic
 * beyond that: doesn't care which pipeline produced the clip list.
 */
export async function cutClipsFromVideo(
  videoSource: string,
  clips: CLIP_RANGE[],
  diarized: DIARIZED_TRANSCRIPT | undefined,
  aspectRatio: VIRAL_CLIPPER_ASPECT_RATIO_VALUE,
): Promise<VIRAL_CLIPPER_CUT_RESPONSE> {
  const resolved = await resolveMediaSource(videoSource);

  try {
    await mkdir(VIRAL_CLIPPER_OUTPUT_DIR, { recursive: true });

    const sourceDurationSeconds = await getMediaDurationSeconds(resolved.path);
    const results = [];
    for (const clip of clips) {
      const { cutStartSeconds, cutEndSeconds, snapped } = snapClipBoundaries(
        clip.start,
        clip.end,
        diarized,
        sourceDurationSeconds,
      );

      /**
       * A clip-generating LLM call can suggest a timestamp past the real
       * source's end (transcript/duration mismatch, model error) — ffmpeg
       * doesn't error on `-ss` past EOF, it silently writes a near-empty
       * file (container boxes, no media). Catch that here instead of
       * shipping a broken clip.
       */
      if (cutStartSeconds >= sourceDurationSeconds - 0.5) {
        results.push({
          label: clip.label,
          requestedStart: clip.start,
          requestedEnd: clip.end,
          cutStartSeconds,
          cutEndSeconds,
          snapped,
          aspectRatio,
          error: `Requested start is at/past the source video's actual duration (${sourceDurationSeconds.toFixed(1)}s) — skipped rather than producing an empty clip.`,
        });
        continue;
      }

      const outputPath = join(VIRAL_CLIPPER_OUTPUT_DIR, `clip-${randomUUID()}.mp4`);
      await cutClip(resolved.path, cutStartSeconds, cutEndSeconds, outputPath, aspectRatio);

      results.push({
        label: clip.label,
        requestedStart: clip.start,
        requestedEnd: clip.end,
        cutStartSeconds,
        cutEndSeconds,
        snapped,
        aspectRatio,
        clipPath: outputPath,
      });
    }

    return { clips: results };
  } finally {
    await cleanupResolvedMediaSource(resolved);
  }
}
