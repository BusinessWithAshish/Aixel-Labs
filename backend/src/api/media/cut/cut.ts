import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { assertPersistentDisk } from "../../../config";
import { parseTimestampToSeconds, snapClipBoundaries } from "./boundary-snap";
import {
  MEDIA,
  MEDIA_ERROR_MESSAGES,
  MEDIA_CUT_OUTPUT_DIR,
  MEDIA_NATURAL_BOUNDARIES,
  MEDIA_REFRAME,
} from "../constants";
import { cleanupResolvedMediaSource, resolveVideoSourceForCut } from "../source";
import { cutClip, cutClipFromStream, probeMediaStreams } from "./ffmpeg-cut";
import { findNaturalRange } from "./natural-boundaries";
import { parseProxyUrlForBridge, ProxyConnectBridge } from "./proxy-bridge";
import { reframeClipBySpeaker } from "./reframe";
import { planLogoCover } from "./logo";
import type {
  CLIP_RANGE,
  CUT_LOGO_PLAN,
  CUT_LOGO_REQUEST,
  CUT_CLIP_BOUNDARIES,
  CUT_CLIP_REFRAME,
  MEDIA_ASPECT_RATIO_VALUE,
  MEDIA_BOUNDARY_VALUE,
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
 * `boundaries: "natural"` cuts a slightly wider range unframed, lets
 * `findNaturalRange` re-place the edges on that audio (no mid-word starts, the
 * laugh after a punchline kept), and trims to the result.
 *
 * `reframe: "speaker"` (video, cropping aspect ratios only) cuts each range
 * unframed into a sibling temp file, then hands it to `reframeClipBySpeaker`,
 * which plans the crop with the Python worker and renders the final clip.
 * With both, the trim happens first so the crop is planned on the final clip.
 */
export async function cutClipsFromVideo(
  videoSource: string,
  clips: CLIP_RANGE[],
  diarized: DIARIZED_TRANSCRIPT | undefined,
  aspectRatio: MEDIA_ASPECT_RATIO_VALUE,
  reframe: MEDIA_REFRAME_VALUE = MEDIA_REFRAME.DEFAULT_MODE,
  boundaries: MEDIA_BOUNDARY_VALUE = MEDIA_NATURAL_BOUNDARIES.DEFAULT_MODE,
  /** Spoken-language hint for `boundaries: "natural"` (ISO 639-1). */
  language?: string,
  /** Take a burned-in logo out of the source BEFORE any crop — see `cut/logo.ts`. */
  logo?: CUT_LOGO_REQUEST,
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

    // Planned once per call, not per clip: the logo is nailed to one place in
    // the source frame, so one probe answers for every range. Absent `logo`,
    // nothing below changes at all — `logoFilter` stays undefined and every
    // ffmpeg invocation is byte-identical to before.
    let logoPlan: CUT_LOGO_PLAN | undefined;
    if (logo && hasVideo) {
      const firstStart = clips.length > 0 ? parseTimestampToSeconds(clips[0].start) : 0;
      logoPlan = await planLogoCover({
        logo,
        probePath: join(MEDIA_CUT_OUTPUT_DIR, `.logo-probe-${randomUUID()}.mp4`),
        probeStartSeconds: Math.min(firstStart, Math.max(0, durationSeconds - 1)),
        sourceDurationSeconds: durationSeconds,
        // Stream-direct already uses inputs 0 (video) and 1 (audio), so the
        // image lands at 2 there and at 1 for a plain file source.
        imageInputIndex: resolved.kind === "youtube" ? 2 : 1,
        cutProbe: async (start, end, out) => {
          if (resolved.kind === "youtube") {
            await cutClipFromStream(
              resolved.videoUrl,
              resolved.audioUrl,
              start,
              end,
              out,
              "original",
              ffmpegProxyUrl,
            );
          } else {
            await cutClip(resolved.path, start, end, out, "original", hasVideo);
          }
        },
      });
    }
    const logoFilter = logoPlan?.filter;
    const logoImage = logoPlan?.replaceWith;

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
      const workPath = () => join(MEDIA_CUT_OUTPUT_DIR, `.cut-work-${randomUUID()}.${outputExt}`);
      // Following the speaker needs the whole frame to analyse, and natural
      // edges need audio past the requested range, so either path cuts
      // unframed into a temp file and finishes the clip afterwards.
      const followSpeaker = reframe === "speaker" && hasVideo && aspectRatio !== "original";
      const natural = boundaries === "natural";
      // Natural edges are placed on the audio itself, so they start from the
      // raw requested times: the diarize snap and its padding are guesses at
      // the same thing from seconds-coarse segments.
      const requestedStart = parseTimestampToSeconds(clip.start);
      const requestedEnd = Math.min(parseTimestampToSeconds(clip.end), durationSeconds);
      const rangeStart = natural
        ? Math.max(0, requestedStart - MEDIA_NATURAL_BOUNDARIES.WINDOW_BEFORE_SECONDS)
        : cutStartSeconds;
      const rangeEnd = natural
        ? Math.min(durationSeconds, requestedEnd + MEDIA_NATURAL_BOUNDARIES.WINDOW_AFTER_SECONDS)
        : cutEndSeconds;
      const unframed = followSpeaker || natural;

      let appliedStart = cutStartSeconds;
      let appliedEnd = cutEndSeconds;
      let boundariesInfo: CUT_CLIP_BOUNDARIES | undefined;
      let reframeInfo: CUT_CLIP_REFRAME | undefined;
      const temps: string[] = [];
      try {
        let current = unframed ? workPath() : outputPath;
        if (unframed) temps.push(current);
        const rangeAspect: MEDIA_ASPECT_RATIO_VALUE = unframed ? "original" : aspectRatio;
        if (resolved.kind === "youtube") {
          await cutClipFromStream(
            resolved.videoUrl,
            resolved.audioUrl,
            rangeStart,
            rangeEnd,
            current,
            rangeAspect,
            ffmpegProxyUrl,
            logoFilter,
            logoImage,
          );
        } else {
          await cutClip(
            resolved.path,
            rangeStart,
            rangeEnd,
            current,
            rangeAspect,
            hasVideo,
            undefined,
            logoFilter,
            logoImage,
          );
        }

        if (natural) {
          const plan = await findNaturalRange(
            current,
            requestedStart - rangeStart,
            requestedEnd - rangeStart,
            rangeEnd - rangeStart,
            language,
            // Decide the edges on the source's own audio. `current` is a
            // re-encode, and Whisper times and punctuates re-encoded speech
            // differently — enough to move the end further than the edge is
            // allowed to travel.
            {
              source: resolved.kind === "youtube" ? resolved.audioUrl : resolved.path,
              start: rangeStart,
              end: rangeEnd,
              ...(ffmpegProxyUrl ? { proxyUrl: ffmpegProxyUrl } : {}),
            },
          );
          appliedStart = rangeStart + plan.start;
          appliedEnd = rangeStart + plan.end;
          boundariesInfo = {
            mode: "natural",
            endReason: plan.endReason,
            ...(plan.fallbackReason ? { fallbackReason: plan.fallbackReason } : {}),
          };
          const trimmed = followSpeaker ? workPath() : outputPath;
          if (followSpeaker) temps.push(trimmed);
          await cutClip(
            current,
            plan.start,
            plan.end,
            trimmed,
            followSpeaker ? "original" : aspectRatio,
            hasVideo,
            {
              inSeconds: MEDIA_NATURAL_BOUNDARIES.FADE_IN_SECONDS,
              outSeconds: MEDIA_NATURAL_BOUNDARIES.FADE_OUT_SECONDS,
            },
          );
          current = trimmed;
        }

        if (followSpeaker) {
          reframeInfo = await reframeClipBySpeaker(current, outputPath, aspectRatio);
        }
      } finally {
        await Promise.all(temps.map((path) => rm(path, { force: true })));
      }

      // A stream that drops mid-download does not fail ffmpeg: it reads the
      // truncated input as end-of-input and exits 0, leaving a clip that is
      // simply short — or, when the video stream is the one that died, one with
      // no video at all. Nothing downstream would notice, so check the file.
      const produced = await probeMediaStreams(outputPath);
      const expectedSeconds = appliedEnd - appliedStart;
      const missingVideo = hasVideo && !produced.hasVideo;
      const shortBy = expectedSeconds - (produced.durationSeconds ?? 0);
      const truncated =
        missingVideo ||
        shortBy >
          Math.max(MEDIA.CLIP_TRUNCATION_SLACK_SECONDS, expectedSeconds * MEDIA.CLIP_TRUNCATION_SLACK_RATIO);
      if (truncated) {
        await rm(outputPath, { force: true });
      }

      results.push({
        label: clip.label,
        requestedStart: clip.start,
        requestedEnd: clip.end,
        cutStartSeconds: Math.round(appliedStart * 100) / 100,
        cutEndSeconds: Math.round(appliedEnd * 100) / 100,
        // "The edges are not the raw requested ones" — a diarize snap, or
        // natural boundaries having moved either edge.
        snapped: natural ? appliedStart !== requestedStart || appliedEnd !== requestedEnd : snapped,
        mediaType,
        aspectRatio: responseAspectRatio,
        ...(truncated
          ? {
              error: `${MEDIA_ERROR_MESSAGES.CLIP_TRUNCATED} (expected ${expectedSeconds.toFixed(2)}s, got ${(produced.durationSeconds ?? 0).toFixed(2)}s${missingVideo ? ", no video track" : ""})`,
            }
          : { clipPath: outputPath }),
        ...(boundariesInfo ? { boundaries: boundariesInfo } : {}),
        ...(reframeInfo ? { reframe: reframeInfo } : {}),
      });
    }

    return { clips: results, ...(logoPlan ? { logo: logoPlan } : {}) };
  } finally {
    await bridge?.stop().catch(() => {});
    await cleanupResolvedMediaSource(resolved);
  }
}
