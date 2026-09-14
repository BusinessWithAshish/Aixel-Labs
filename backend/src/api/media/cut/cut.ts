import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { assertPersistentDisk } from "../../../config";
import { snapClipBoundaries } from "./boundary-snap";
import { MEDIA_ERROR_MESSAGES, MEDIA_CUT_OUTPUT_DIR, MEDIA_REFRAME } from "../constants";
import { cleanupResolvedMediaSource, resolveVideoSourceForCut } from "../source";
import { cutClip, cutClipFromStream, probeMediaStreams } from "./ffmpeg-cut";
import { parseProxyUrlForBridge, ProxyConnectBridge } from "./proxy-bridge";
import { reframeClipBySpeaker } from "./reframe";
import type {
  CLIP_RANGE,
  CUT_CLIP_REFRAME,
  MEDIA_ASPECT_RATIO_VALUE,
  MEDIA_CUT_RESPONSE,
  MEDIA_REFRAME_VALUE,
  DIARIZED_TRANSCRIPT,
} from "../types";

/**
 * Resolves the source video and cuts each requested clip (boundary-snapped
 * against `diarized` when provided — see `boundary-snap.ts`) directly into
 * `MEDIA_CUT_OUTPUT_DIR`, then cleans up the resolved source's temp
 * files. Content-agnostic beyond that: doesn't care which pipeline
 * produced the clip list.
 *
 * YouTube sources take the stream-direct path (see `resolveVideoSourceForCut`):
 * ffmpeg cuts clips directly from the signed googlevideo stream URLs.
 * Evomi `-http_proxy` is used only when this host cannot fetch googlevideo
 * (VPS datacenter 403). Local files and non-YouTube URLs fall back to the
 * file path (download once, cut from disk).
 *
 * `reframe: "speaker"` (video, cropping aspect ratios only) cuts each range
 * unframed into a sibling temp file, then hands it to `reframeClipBySpeaker`,
 * which plans the crop with the Python worker and renders the final clip.
 */
export async function cutClipsFromVideo(
  videoSource: string,
  clips: CLIP_RANGE[],
  diarized: DIARIZED_TRANSCRIPT | undefined,
  aspectRatio: MEDIA_ASPECT_RATIO_VALUE,
  reframe: MEDIA_REFRAME_VALUE = MEDIA_REFRAME.DEFAULT_MODE,
): Promise<MEDIA_CUT_RESPONSE> {
  assertPersistentDisk(MEDIA_ERROR_MESSAGES.VERCEL);
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
    await mkdir(MEDIA_CUT_OUTPUT_DIR, { recursive: true });

    // A YouTube source is always video by construction (its own adaptive
    // video+audio streams) — no probe needed there. `kind: "file"` is the
    // one case that might be audio-only, so that's the one we probe (once).
    const fileProbe = resolved.kind === "file" ? await probeMediaStreams(resolved.path) : null;
    const durationSeconds =
      resolved.kind === "youtube" ? resolved.durationSeconds : fileProbe!.durationSeconds;
    const hasVideo = resolved.kind === "youtube" ? true : fileProbe!.hasVideo;
    const mediaType: "video" | "audio" = hasVideo ? "video" : "audio";
    const outputExt = mediaType === "video" ? "mp4" : "m4a";
    // Echoed in the response as "original" for audio results — no reframe was
    // actually applied, so echoing back whatever the caller requested would
    // claim a framing decision that never happened.
    const responseAspectRatio: MEDIA_ASPECT_RATIO_VALUE = hasVideo ? aspectRatio : "original";

    const results = [];
    for (const clip of clips) {
      const { cutStartSeconds, cutEndSeconds, snapped } = snapClipBoundaries(
        clip.start,
        clip.end,
        diarized,
        durationSeconds,
      );

      /**
       * A clip-generating LLM call can suggest a timestamp past the real
       * source's end (transcript/duration mismatch, model error) — ffmpeg
       * doesn't error on `-ss` past EOF, it silently writes a near-empty
       * file (container boxes, no media). Catch that here instead of
       * shipping a broken clip.
       */
      if (cutStartSeconds >= durationSeconds - 0.5) {
        results.push({
          label: clip.label,
          requestedStart: clip.start,
          requestedEnd: clip.end,
          cutStartSeconds,
          cutEndSeconds,
          snapped,
          mediaType,
          aspectRatio: responseAspectRatio,
          error: `Requested start is at/past the source's actual duration (${durationSeconds.toFixed(1)}s) — skipped rather than producing an empty clip.`,
        });
        continue;
      }

      const outputPath = join(MEDIA_CUT_OUTPUT_DIR, `clip-${randomUUID()}.${outputExt}`);
      // Following the speaker needs the whole frame to analyse, so that path
      // cuts the range unframed into a temp file and frames it afterwards.
      const followSpeaker = reframe === "speaker" && hasVideo && aspectRatio !== "original";
      const cutTarget = followSpeaker
        ? join(MEDIA_CUT_OUTPUT_DIR, `.reframe-src-${randomUUID()}.${outputExt}`)
        : outputPath;
      const cutAspect: MEDIA_ASPECT_RATIO_VALUE = followSpeaker ? "original" : aspectRatio;
      if (resolved.kind === "youtube") {
        await cutClipFromStream(
          resolved.videoUrl,
          resolved.audioUrl,
          cutStartSeconds,
          cutEndSeconds,
          cutTarget,
          cutAspect,
          ffmpegProxyUrl,
        );
      } else {
        await cutClip(
          resolved.path,
          cutStartSeconds,
          cutEndSeconds,
          cutTarget,
          cutAspect,
          hasVideo,
        );
      }

      let reframeInfo: CUT_CLIP_REFRAME | undefined;
      if (followSpeaker) {
        try {
          reframeInfo = await reframeClipBySpeaker(cutTarget, outputPath, aspectRatio);
        } finally {
          await rm(cutTarget, { force: true });
        }
      }

      results.push({
        label: clip.label,
        requestedStart: clip.start,
        requestedEnd: clip.end,
        cutStartSeconds,
        cutEndSeconds,
        snapped,
        mediaType,
        aspectRatio: responseAspectRatio,
        clipPath: outputPath,
        ...(reframeInfo ? { reframe: reframeInfo } : {}),
      });
    }

    return { clips: results };
  } finally {
    await bridge?.stop().catch(() => {});
    await cleanupResolvedMediaSource(resolved);
  }
}
