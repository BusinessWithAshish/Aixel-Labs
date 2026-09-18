import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

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
import { buildFilterGraph, HIDE_DEFAULTS, proofFilter } from "./compose";
import { detectStaticOverlays, normalizeRegion } from "./detect";
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
 * Apply a colour grade, cover regions, and composite a mark — in one pass.
 *
 * Audio is stream-copied throughout: nothing here touches it, and re-encoding
 * a track we do not change would be slower and lossy for nothing. Video
 * settings match `caption`'s burn exactly, so a clip that goes through both is
 * encoded twice at one quality rather than degrading in steps.
 */
async function render(
  inputPath: string,
  graph: string | null,
  outLabel: string,
  imagePaths: string[],
  outputPath: string,
): Promise<void> {
  const args = ["-y", "-i", inputPath];
  for (const image of imagePaths) args.push("-i", image);
  if (graph) {
    args.push("-filter_complex", graph, "-map", outLabel, "-map", "0:a?");
  }
  args.push(
    "-c:a", "copy",
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
  if (!input.preview && !input.grade && !input.hide && !input.logo) {
    throw new Error(MEDIA_ERROR_MESSAGES.EFFECTS_NOTHING_TO_DO);
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

    // --- grade + logo -------------------------------------------------------
    const grade = input.grade ? buildGradeFilters(input.grade) : undefined;
    const logoPixelWidth = input.logo
      ? even(width * (input.logo.scale ?? MEDIA_LOGO.DEFAULT_SCALE))
      : 0;
    const logoMargin = input.logo
      ? Math.round(width * (input.logo.margin ?? MEDIA_LOGO.DEFAULT_MARGIN))
      : 0;

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


    const { graph, outLabel } = buildFilterGraph({
      gradeFilters: grade?.filters ?? [],
      covers,
      imageIndex,
      logo: input.logo
        ? { ...input.logo, keyedColour, pixelWidth: logoPixelWidth, pixelMargin: logoMargin }
        : undefined,
    });

    const name = [grade ? grade.preset : null, regions.length > 0 ? "hidden" : null, input.logo ? "marked" : null]
      .filter(Boolean)
      .join("-");
    const outputPath = join(MEDIA_EFFECTS_OUTPUT_DIR, `${name || "effects"}-${runId}.mp4`);
    await render(resolved.path, graph, outLabel, imagePaths, outputPath);

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
      logo: input.logo
        ? {
            file: input.logo.file,
            position: input.logo.position ?? MEDIA_LOGO.DEFAULT_POSITION,
            widthPixels: logoPixelWidth,
            ...(keyedColour ? { keyed: keyedColour } : {}),
          }
        : undefined,
      durationSeconds,
      width,
      height,
    };
  } finally {
    await cleanupResolvedMediaSource(resolved);
  }
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
