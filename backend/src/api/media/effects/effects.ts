import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

import { assertPersistentDisk } from "../../../config";
import {
  MEDIA_EFFECTS,
  MEDIA_EFFECTS_OUTPUT_DIR,
  MEDIA_ERROR_MESSAGES,
  MEDIA_HIDE,
  MEDIA_LOGO,
} from "../constants";
import { cleanupResolvedMediaSource, resolveMediaSource } from "../source";
import { probeMediaStreams } from "../cut/ffmpeg-cut";
import {
  buildFilterGraph,
  buildSpeedPlan,
  HIDE_DEFAULTS,
  proofFilter,
  resolveLogoInsets,
} from "./compose";
import { detectStaticOverlays, eraseRegion, normalizeRegion } from "./detect";
import { cornerColour, sampleSurroundColour } from "./surround";
import { buildGradeFilters, everyPresetChain } from "./grade";
import { buildPresetSheet } from "./preview";
import type {
  COVER_PLAN,
  DETECTED_REGION,
  HIDE_STYLE,
  SURROUND_COLOUR,
  EFFECTS_PREVIEW_SHEET,
  HIDE_REGION,
  MEDIA_EFFECTS_REQUEST_PARSED,
  MEDIA_EFFECTS_RESPONSE,
  SPEED_PLAN,
} from "./types";

const execFileAsync = promisify(execFile);

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

async function runFfmpeg(args: string[], failure: string): Promise<void> {
  if (!ffmpegPath) throw new Error(failure);
  try {
    await execFileAsync(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 16 });
  } catch (err) {
    // ffmpeg's LAST stderr line on a filtergraph error is the useless
    // "Conversion failed!"; the line that names the real cause (an out-of-range
    // filter argument, an unreadable path) sits above it. Prefer that one.
    const lines = ((err as { stderr?: string }).stderr ?? "").trim().split("\n").filter(Boolean);
    const detail =
      [...lines].reverse().find((line) => /error|invalid|out of range|no such|unable/i.test(line)) ??
      lines[lines.length - 1] ??
      "";
    throw new Error(detail ? `${failure}: ${detail}` : failure);
  }
}

/**
 * Apply a colour grade, cover regions, composite a mark, retime the clip — in
 * one pass.
 *
 * **Audio is stream-copied unless `speed` filtered it.** Re-encoding a track we
 * do not change would be slower and lossy for nothing; a track we DID filter has
 * to be encoded, and there is no third option. Video settings match `caption`'s
 * burn exactly, so a clip that goes through both is encoded twice at one quality
 * rather than degrading in steps.
 */
async function render(
  inputPath: string,
  graph: string | null,
  outLabel: string,
  imagePaths: string[],
  outputPath: string,
  audioOutLabel: string | undefined,
  retimed: boolean,
): Promise<void> {
  const args = ["-y", "-i", inputPath];
  for (const image of imagePaths) args.push("-i", image);
  if (graph) {
    // `outLabel` is still the raw input when the graph only touches audio — a
    // bracketed label there refers to a filter output that does not exist, so
    // the plain stream specifier is what -map needs.
    const videoMap = outLabel === "[0:v]" ? "0:v" : outLabel;
    args.push("-filter_complex", graph, "-map", videoMap, "-map", audioOutLabel ?? "0:a?");
  }
  if (retimed) {
    // `setpts` leaves the filter link with no declared frame rate, and ffmpeg
    // then falls back to 25 fps and RESAMPLES to it — silently dropping 79 of a
    // 180-frame clip at rate 1.5, and duplicating frames on a slowdown.
    // Passthrough keeps every source frame on the timestamps setpts gave it.
    args.push("-fps_mode", "passthrough");
  }
  args.push(
    "-c:a", audioOutLabel ? MEDIA_EFFECTS.ENCODE.audioCodec : "copy",
    "-c:v", "libx264",
    "-preset", MEDIA_EFFECTS.ENCODE.preset,
    "-crf", MEDIA_EFFECTS.ENCODE.crf,
    "-pix_fmt", MEDIA_EFFECTS.ENCODE.pixelFormat,
    "-movflags", "+faststart",
    outputPath,
  );
  await runFfmpeg(args, MEDIA_ERROR_MESSAGES.EFFECTS_RENDER_FAILED);
}

/**
 * Grade a clip, cover burned-in overlays, composite your own mark — or preview
 * every grade preset on the clip's own frames.
 *
 * Preview and render live in one op because they share the source resolution,
 * the probe and the preset table. A separate preview op would duplicate all
 * three and drift from what the render path actually does, and a preview that
 * does not show the real thing is worse than none.
 */
export async function applyEffects(
  input: MEDIA_EFFECTS_REQUEST_PARSED,
): Promise<MEDIA_EFFECTS_RESPONSE> {
  assertPersistentDisk(MEDIA_ERROR_MESSAGES.VERCEL);
  if (!input.preview && !input.grade && !input.hide && !input.logo && !input.speed) {
    throw new Error(MEDIA_ERROR_MESSAGES.EFFECTS_NOTHING_TO_DO);
  }
  if (input.speed) {
    // Both move the pitch, by different routes: pitchFollowsRate ties it to the
    // rate, semitones moves it while the rate stays put. Asking for both means
    // one of them is not what was wanted, so say so rather than compounding them.
    if (input.speed.pitchFollowsRate && input.speed.semitones !== undefined) {
      throw new Error(MEDIA_ERROR_MESSAGES.EFFECTS_SPEED_PITCH_CONFLICT);
    }
    // A `speed` block that resolves to no change is rejected rather than run: a
    // silently inert parameter is the failure that costs a whole clip, because
    // the output looks like a success and nothing says the treatment was dropped.
    const rate = input.speed.rate ?? 1;
    if (rate === 1 && (input.speed.semitones ?? 0) === 0) {
      throw new Error(MEDIA_ERROR_MESSAGES.EFFECTS_SPEED_NOTHING);
    }
  }
  if (input.hide?.style === "replace") {
    if (!input.hide.replaceWith) {
      throw new Error(MEDIA_ERROR_MESSAGES.EFFECTS_REPLACE_NO_IMAGE);
    }
    try {
      await access(input.hide.replaceWith);
    } catch {
      throw new Error(`${MEDIA_ERROR_MESSAGES.EFFECTS_LOGO_MISSING}: ${input.hide.replaceWith}`);
    }
  }
  if (input.logo) {
    try {
      await access(input.logo.file);
    } catch {
      throw new Error(`${MEDIA_ERROR_MESSAGES.EFFECTS_LOGO_MISSING}: ${input.logo.file}`);
    }
  }
  await mkdir(MEDIA_EFFECTS_OUTPUT_DIR, { recursive: true });

  const resolved = await resolveMediaSource(input.videoSource);
  const runId = randomUUID().slice(0, 8);

  try {
    // A still has no duration, so the video probe below cannot read it. Stills
    // take their own short path: grade and logo only, one frame out as a PNG.
    if (isStill(input.videoSource) || isStill(resolved.path)) {
      return await renderStill(resolved.path, runId, input);
    }

    const probe = await probeMediaStreams(resolved.path);
    if (!probe.hasVideo) throw new Error(MEDIA_ERROR_MESSAGES.EFFECTS_NO_VIDEO);
    const { width, height, durationSeconds } = probe;

    if (input.preview) {
      return await previewPresets(resolved.path, runId, probe, input.at);
    }
    if (!width || !height) {
      throw new Error(`${MEDIA_ERROR_MESSAGES.EFFECTS_RENDER_FAILED}: could not read frame size`);
    }

    // --- hide ---------------------------------------------------------------
    let regions: HIDE_REGION[] = [];
    let detected: DETECTED_REGION[] | undefined;
    let proofPath: string | undefined;
    let hideNote: string | undefined;

    if (input.hide) {
      if (input.hide.regions === "auto") {
        detected = await detectStaticOverlays(resolved.path, width, height, durationSeconds);
        regions = detected
          .filter((r) => r.confidence >= MEDIA_HIDE.DETECT.MIN_CONFIDENCE)
          .map(({ x, y, width: w, height: h }) => ({ x, y, width: w, height: h }));
        // `replace` pastes OUR mark into the region, so it is held to a much
        // higher bar than erasing: a weak candidate becomes our logo in a random
        // place on someone else's video, and a source with no mark at all must
        // yield no replacement. Best-scoring only, above MIN_CONFIDENCE_ON_REPLACE.
        if (input.hide.style === "replace") {
          regions = detected
            .filter((r) => r.confidence >= MEDIA_HIDE.DETECT.MIN_CONFIDENCE_ON_REPLACE)
            .slice(0, MEDIA_HIDE.DETECT.MAX_REGIONS_ON_REPLACE)
            .map(({ x, y, width: w, height: h }) => ({ x, y, width: w, height: h }));
        }
        if (regions.length === 0) hideNote = MEDIA_ERROR_MESSAGES.EFFECTS_DETECT_NONE;
        if (detected.length > 0) {
          // A still with every candidate outlined — including the ones below
          // the confidence floor, so a near miss is visible rather than silent.
          proofPath = join(MEDIA_EFFECTS_OUTPUT_DIR, `hide-detected-${runId}.png`);
          await runFfmpeg(
            [
              "-y",
              "-ss", (durationSeconds / 2).toFixed(3),
              "-i", resolved.path,
              "-frames:v", "1",
              "-vf", proofFilter(detected, width),
              proofPath,
            ],
            MEDIA_ERROR_MESSAGES.EFFECTS_PREVIEW_FAILED,
          );
        }
      } else {
        regions = input.hide.regions.map((r) => normalizeRegion(r, width, height));
      }
    }

    // --- speed --------------------------------------------------------------
    // Planned after the probe because it needs to know whether there is an
    // audio stream at all: asking a filtergraph for `[0:a]` on a silent source
    // fails the entire render.
    let speedPlan: SPEED_PLAN | undefined;
    if (input.speed) {
      speedPlan = buildSpeedPlan(input.speed, probe.hasAudio);
      // Pitch was the only thing asked for and there is nothing to pitch. The
      // render would exit 0 having changed nothing at all, so refuse instead.
      if (!probe.hasAudio && !speedPlan.videoFilter) {
        throw new Error(MEDIA_ERROR_MESSAGES.EFFECTS_SPEED_NO_AUDIO);
      }
    }

    // --- grade + logo -------------------------------------------------------
    const grade = input.grade ? buildGradeFilters(input.grade) : undefined;
    const logoPixelWidth = input.logo
      ? even(width * (input.logo.scale ?? MEDIA_LOGO.DEFAULT_SCALE))
      : 0;
    // Asymmetric, per-edge, and resolved from the frame's OWN width and height.
    // The number this replaces was one fraction of the WIDTH used on all four
    // edges, so on 1080x1920 the vertical inset came out at 2.2% of the height
    // while the horizontal one was 4.0% of the width — tightest exactly where a
    // notch is. `resolveLogoInsets` still honours an explicit `margin` verbatim.
    const logoInsets = input.logo
      ? resolveLogoInsets(input.logo.margin, width, height)
      : undefined;

    const keyedColour =
      input.logo?.keyColor === "auto"
        ? await cornerColour(input.logo.file)
        : input.logo?.keyColor;
    const replaceKeyColour =
      input.hide?.keyColor === "auto" && input.hide.replaceWith
        ? await cornerColour(input.hide.replaceWith)
        : input.hide?.keyColor;

    const covers = await planCovers(
      resolved.path,
      regions,
      input.hide?.style ?? HIDE_DEFAULTS.style,
      input.hide?.strength ?? HIDE_DEFAULTS.strength,
      width,
      height,
      durationSeconds,
      input.hide?.replaceWith,
      input.hide?.backing,
      replaceKeyColour,
    );

    // Every still that has to be pasted becomes an ffmpeg input. One entry per
    // distinct path, so a channel using its avatar as BOTH the replacement for
    // a source mark and its own corner watermark decodes it once.
    const imagePaths: string[] = [];
    const imageIndex = new Map<string, number>();
    for (const file of [...covers.map((c) => c.replaceWith), input.logo?.file]) {
      if (!file || imageIndex.has(file)) continue;
      imagePaths.push(file);
      imageIndex.set(file, imagePaths.length); // input 0 is the video
    }


    const { graph, outLabel, audioOutLabel } = buildFilterGraph({
      gradeFilters: grade?.filters ?? [],
      covers,
      imageIndex,
      logo: input.logo && logoInsets
        ? { ...input.logo, keyedColour, pixelWidth: logoPixelWidth, pixelInsets: logoInsets }
        : undefined,
      videoTimeFilter: speedPlan?.videoFilter,
      audioFilters: speedPlan?.audioFilters,
    });

    const name = [
      grade ? grade.preset : null,
      regions.length > 0 ? "hidden" : null,
      input.logo ? "marked" : null,
      speedPlan ? "retimed" : null,
    ]
      .filter(Boolean)
      .join("-");
    const outputPath = join(MEDIA_EFFECTS_OUTPUT_DIR, `${name || "effects"}-${runId}.mp4`);
    await render(
      resolved.path,
      graph,
      outLabel,
      imagePaths,
      outputPath,
      audioOutLabel,
      Boolean(speedPlan?.videoFilter),
    );

    // A rate change makes the output a different length from the source, so the
    // duration is read off the file that was actually written rather than the
    // one it came from. Derived arithmetic would be close and still wrong at the
    // last frame, and this number is what the caller plans a Short around.
    const outputDuration = speedPlan?.videoFilter
      ? (await probeMediaStreams(outputPath)).durationSeconds
      : durationSeconds;

    return {
      outputPath,
      applied: grade ? { preset: grade.preset, filters: grade.filters } : undefined,
      hide: input.hide
        ? {
            regions,
            style: input.hide.style ?? HIDE_DEFAULTS.style,
            covers: covers.map(({ region, style, surround, fellBackFrom }) => ({
              region,
              style,
              surround,
              fellBackFrom,
            })),
            detected,
            proofPath,
            note: hideNote,
          }
        : undefined,
      logo: input.logo && logoInsets
        ? {
            file: input.logo.file,
            position: input.logo.position ?? MEDIA_LOGO.DEFAULT_POSITION,
            widthPixels: logoPixelWidth,
            insets: logoInsets,
            ...(keyedColour ? { keyed: keyedColour } : {}),
          }
        : undefined,
      speed: speedPlan
        ? {
            rate: speedPlan.rate,
            pitchFollowsRate: speedPlan.pitchFollowsRate,
            semitones: speedPlan.semitones,
            ...(speedPlan.pitchScale !== undefined ? { pitchScale: speedPlan.pitchScale } : {}),
            filters: { video: speedPlan.videoFilter, audio: speedPlan.audioFilters },
            ...(speedPlan.note ? { note: speedPlan.note } : {}),
          }
        : undefined,
      durationSeconds: outputDuration,
      width,
      height,
    };
  } finally {
    await cleanupResolvedMediaSource(resolved);
  }
}

function isStill(path: string): boolean {
  return MEDIA_EFFECTS.STILL.EXTENSIONS.test(path.split(/[?#]/)[0]);
}

/**
 * Grade and/or stamp a mark onto a still image, written out as a PNG.
 *
 * This exists because an image model never pastes a logo it is handed: it
 * redraws it, and the redraw misspells and restyles the mark often enough that a
 * brand cannot publish on it. Stamping the real file afterwards is the only way
 * the mark is exactly the mark. Same filter graph as a clip — grade first, mark
 * last, so the mark is never graded — so a still and a clip treated with the
 * same settings look the same.
 *
 * `hide` and `speed` are refused rather than half-supported: `hide` samples the
 * background across frames and `speed` retimes a clock, and a still has neither.
 * The default inset is a plain margin, not the Reels safe area a clip gets: a
 * feed image has no caption block or action rail laid over its bottom third.
 */
async function renderStill(
  sourcePath: string,
  runId: string,
  input: MEDIA_EFFECTS_REQUEST_PARSED,
): Promise<MEDIA_EFFECTS_RESPONSE> {
  if (input.preview || input.hide || input.speed) {
    throw new Error(MEDIA_ERROR_MESSAGES.EFFECTS_STILL_UNSUPPORTED);
  }
  const meta = await sharp(sourcePath).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) {
    throw new Error(`${MEDIA_ERROR_MESSAGES.EFFECTS_RENDER_FAILED}: could not read image size`);
  }

  const grade = input.grade ? buildGradeFilters(input.grade) : undefined;
  const logoPixelWidth = input.logo ? even(width * (input.logo.scale ?? MEDIA_LOGO.DEFAULT_SCALE)) : 0;
  const logoInsets = input.logo
    ? resolveLogoInsets(input.logo.margin ?? MEDIA_EFFECTS.STILL.DEFAULT_MARGIN, width, height)
    : undefined;
  const keyedColour =
    input.logo?.keyColor === "auto" ? await cornerColour(input.logo.file) : input.logo?.keyColor;

  const imageIndex = new Map<string, number>();
  if (input.logo) imageIndex.set(input.logo.file, 1);
  const { graph, outLabel } = buildFilterGraph({
    gradeFilters: grade?.filters ?? [],
    covers: [],
    imageIndex,
    logo: input.logo && logoInsets
      ? { ...input.logo, keyedColour, pixelWidth: logoPixelWidth, pixelInsets: logoInsets }
      : undefined,
  });

  const name = [grade ? grade.preset : null, input.logo ? "marked" : null].filter(Boolean).join("-");
  const outputPath = join(MEDIA_EFFECTS_OUTPUT_DIR, `${name || "effects"}-${runId}.png`);
  const args = ["-y", "-i", sourcePath];
  if (input.logo) args.push("-i", input.logo.file);
  if (graph) args.push("-filter_complex", graph, "-map", outLabel === "[0:v]" ? "0:v" : outLabel);
  args.push("-frames:v", "1", "-update", "1", outputPath);
  await runFfmpeg(args, MEDIA_ERROR_MESSAGES.EFFECTS_RENDER_FAILED);

  return {
    outputPath,
    applied: grade ? { preset: grade.preset, filters: grade.filters } : undefined,
    logo: input.logo && logoInsets
      ? {
          file: input.logo.file,
          position: input.logo.position ?? MEDIA_LOGO.DEFAULT_POSITION,
          widthPixels: logoPixelWidth,
          insets: logoInsets,
          ...(keyedColour ? { keyed: keyedColour } : {}),
        }
      : undefined,
    durationSeconds: 0,
    width,
    height,
  };
}

/** `preview: true` — render no video, tile every preset onto the clip's own frames instead. */
async function previewPresets(
  sourcePath: string,
  runId: string,
  probe: { width?: number; height?: number; durationSeconds: number },
  at: number[] | undefined,
): Promise<MEDIA_EFFECTS_RESPONSE> {
  const { width, height, durationSeconds } = probe;
  if (!width || !height) {
    throw new Error(`${MEDIA_ERROR_MESSAGES.EFFECTS_PREVIEW_FAILED}: could not read frame size`);
  }

  // Clamp inside the real duration: a timestamp past the end grabs no frame
  // and ffmpeg reports success having written nothing.
  const lastFrame = Math.max(0, durationSeconds - 0.1);
  const timestamps = (
    at ?? MEDIA_EFFECTS.PREVIEW.DEFAULT_AT_FRACTIONS.map((f) => durationSeconds * f)
  ).map((t) => Math.min(t, lastFrame));

  const workDir = join(MEDIA_EFFECTS_OUTPUT_DIR, `.preview-${runId}`);
  const previews: EFFECTS_PREVIEW_SHEET[] = [];
  try {
    for (const [index, atSeconds] of timestamps.entries()) {
      const sheetPath = join(MEDIA_EFFECTS_OUTPUT_DIR, `presets-${runId}-${index + 1}.png`);
      await buildPresetSheet(sourcePath, atSeconds, width, height, join(workDir, String(index)), sheetPath);
      previews.push({ atSeconds: Number(atSeconds.toFixed(2)), sheetPath });
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

  return {
    previews,
    tileOrder: [MEDIA_EFFECTS.PREVIEW.ORIGINAL_LABEL, ...everyPresetChain().map((p) => p.name)],
    durationSeconds,
    width,
    height,
  };
}

/**
 * Decide how each region actually gets covered.
 *
 * `fill` is the only style that can fail, and it fails for a reason worth
 * surfacing rather than swallowing: the background around the region has to be
 * flat and stable for a single colour to disappear into it. When it is not, a
 * flat patch is MORE visible than a blur, not less — so this falls back and
 * records what it did, rather than silently painting a rectangle that looks
 * like a sticker.
 *
 * The fallback is recorded per region (`fellBackFrom`, plus the `surround`
 * measurements that caused it) so the caller can see it happened and choose
 * differently — reframe to exclude the region entirely, say, which is the one
 * option that leaves no mark at all.
 */
async function planCovers(
  sourcePath: string,
  regions: HIDE_REGION[],
  style: HIDE_STYLE,
  strength: number,
  frameWidth: number,
  frameHeight: number,
  durationSeconds: number,
  replaceWith?: string,
  backing?: string,
  replaceKeyColour?: string,
): Promise<COVER_PLAN[]> {
  const plans: COVER_PLAN[] = [];
  for (const region of regions) {
    // `replace` needs a backing colour behind the image for the same reason
    // `fill` exists: the region must be a known flat colour before anything
    // lands on it, or the edges of the mark being covered show around it. An
    // explicit `backing` wins; otherwise the surrounding colour is sampled,
    // and black is the fallback when even that cannot be read.
    if (style === "replace") {
      let surround: SURROUND_COLOUR | undefined;
      if (!backing || backing === "sampled") {
        try {
          surround = await sampleSurroundColour(sourcePath, region, frameWidth, frameHeight, durationSeconds);
        } catch {
          surround = undefined;
        }
      }
      const colour =
        backing && backing !== "sampled" ? backing : (surround?.hex ?? "0x000000");
      plans.push({ region, style: "replace", replaceWith, replaceKeyColour, colour, strength, surround });
      continue;
    }
    if (style === "erase") {
      plans.push({ region: eraseRegion(region, frameWidth, frameHeight, false), style, strength });
      continue;
    }
    if (style !== "fill") {
      plans.push({ region, style, strength });
      continue;
    }
    let surround: SURROUND_COLOUR | undefined;
    try {
      surround = await sampleSurroundColour(
        sourcePath,
        region,
        frameWidth,
        frameHeight,
        durationSeconds,
      );
    } catch {
      surround = undefined;
    }
    if (surround?.uniform) {
      plans.push({ region, style: "fill", colour: surround.hex, strength, surround });
    } else {
      plans.push({
        region,
        style: "blur",
        strength,
        surround,
        fellBackFrom: "fill",
      });
    }
  }
  return plans;
}
