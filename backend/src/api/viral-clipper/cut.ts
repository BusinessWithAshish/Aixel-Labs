import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { put } from "@vercel/blob";

import { snapClipBoundaries } from "./boundary-snap";
import { VIRAL_CLIPPER_ERROR_MESSAGES } from "./constants";
import { downloadBlobToTempFile } from "./download";
import { cutClip, getMediaDurationSeconds } from "./ffmpeg-cut";
import type {
  CLIP_RANGE,
  VIRAL_CLIPPER_ASPECT_RATIO_VALUE,
  VIRAL_CLIPPER_CUT_RESPONSE,
  DIARIZED_TRANSCRIPT,
} from "./types";

/**
 * Downloads the source video once, cuts each requested clip (boundary-snapped
 * against `diarized` when provided — see `boundary-snap.ts`), uploads each
 * cut clip to Blob, and cleans up all temp files. Content-agnostic beyond
 * that: doesn't care which pipeline produced the clip list.
 */
export async function cutClipsFromVideo(
  videoBlobUrl: string,
  clips: CLIP_RANGE[],
  diarized: DIARIZED_TRANSCRIPT | undefined,
  aspectRatio: VIRAL_CLIPPER_ASPECT_RATIO_VALUE,
): Promise<VIRAL_CLIPPER_CUT_RESPONSE> {
  const sourcePath = await downloadBlobToTempFile(videoBlobUrl);
  const tempDir = dirname(sourcePath);

  try {
    const sourceDurationSeconds = await getMediaDurationSeconds(sourcePath);
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

      const outputPath = join(tempDir, `clip-${randomUUID()}.mp4`);
      await cutClip(sourcePath, cutStartSeconds, cutEndSeconds, outputPath, aspectRatio);

      const buffer = await readFile(outputPath);
      let blobUrl: string;
      try {
        const blob = await put(
          `viral-clipper-cuts/${clip.label ?? "clip"}-${randomUUID()}.mp4`,
          buffer,
          { access: "private", addRandomSuffix: true, contentType: "video/mp4" },
        );
        blobUrl = blob.url;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`${VIRAL_CLIPPER_ERROR_MESSAGES.BLOB_UPLOAD_FAILED}: ${message}`);
      } finally {
        await rm(outputPath, { force: true }).catch(() => {});
      }

      results.push({
        label: clip.label,
        requestedStart: clip.start,
        requestedEnd: clip.end,
        cutStartSeconds,
        cutEndSeconds,
        snapped,
        aspectRatio,
        clipUrl: blobUrl,
      });
    }

    return { clips: results };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
