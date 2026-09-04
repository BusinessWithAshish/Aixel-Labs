import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { assertPersistentDisk } from "../../../config";
import { snapClipBoundaries } from "./boundary-snap";
import { VIRAL_CLIPPER_ERROR_MESSAGES, VIRAL_CLIPPER_OUTPUT_DIR } from "../constants";
import { cleanupResolvedMediaSource, resolveVideoSourceForCut } from "../download";
import { cutClip, cutClipFromStream, getMediaDurationSeconds } from "./ffmpeg-cut";
import { parseProxyUrlForBridge, ProxyConnectBridge } from "./proxy-bridge";
import type {
  CLIP_RANGE,
  VIRAL_CLIPPER_ASPECT_RATIO_VALUE,
  VIRAL_CLIPPER_CUT_RESPONSE,
  DIARIZED_TRANSCRIPT,
} from "../types";

/**
 * Resolves the source video and cuts each requested clip (boundary-snapped
 * against `diarized` when provided — see `boundary-snap.ts`) directly into
 * `VIRAL_CLIPPER_OUTPUT_DIR`, then cleans up the resolved source's temp
 * files. Content-agnostic beyond that: doesn't care which pipeline
 * produced the clip list.
 *
 * YouTube sources take the stream-direct path (see `resolveVideoSourceForCut`):
 * ffmpeg cuts clips directly from the signed googlevideo stream URLs.
 * Evomi `-http_proxy` is used only when this host cannot fetch googlevideo
 * (VPS datacenter 403). Local files and non-YouTube URLs fall back to the
 * file path (download once, cut from disk).
 */
export async function cutClipsFromVideo(
  videoSource: string,
  clips: CLIP_RANGE[],
  diarized: DIARIZED_TRANSCRIPT | undefined,
  aspectRatio: VIRAL_CLIPPER_ASPECT_RATIO_VALUE,
): Promise<VIRAL_CLIPPER_CUT_RESPONSE> {
  assertPersistentDisk(VIRAL_CLIPPER_ERROR_MESSAGES.VERCEL);
  const resolved = await resolveVideoSourceForCut(videoSource);

  // For the youtube kind that still needs Evomi (VPS googlevideo 403),
  // start a local CONNECT bridge: ffmpeg's `-http_proxy` doesn't send
  // Proxy-Authorization, so it can't authenticate to Evomi directly.
  let bridge: ProxyConnectBridge | undefined;
  let ffmpegProxyUrl: string | undefined;
  if (resolved.kind === "youtube" && resolved.proxyUrl) {
    const parsed = parseProxyUrlForBridge(resolved.proxyUrl);
    if (parsed) {
      bridge = new ProxyConnectBridge(parsed.host, parsed.port, parsed.proxyAuthorization);
      await bridge.start();
      ffmpegProxyUrl = bridge.localProxyUrl;
    }
  }

  try {
    await mkdir(VIRAL_CLIPPER_OUTPUT_DIR, { recursive: true });

    const sourceDurationSeconds =
      resolved.kind === "youtube"
        ? resolved.durationSeconds
        : await getMediaDurationSeconds(resolved.path);

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
      if (resolved.kind === "youtube") {
        await cutClipFromStream(
          resolved.videoUrl,
          resolved.audioUrl,
          cutStartSeconds,
          cutEndSeconds,
          outputPath,
          aspectRatio,
          ffmpegProxyUrl,
        );
      } else {
        await cutClip(resolved.path, cutStartSeconds, cutEndSeconds, outputPath, aspectRatio);
      }

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
    await bridge?.stop().catch(() => {});
    await cleanupResolvedMediaSource(resolved);
  }
}
