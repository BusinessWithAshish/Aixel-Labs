import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";
import { z } from "zod";

import {
  MEDIA,
  MEDIA_ASPECT_RATIO_DIMENSIONS,
  MEDIA_ERROR_MESSAGES,
  MEDIA_REFRAME,
  MEDIA_REFRAME_LAYOUTS,
  MEDIA_REFRAME_MODES,
} from "../constants";
import type { CUT_CLIP_REFRAME, MEDIA_ASPECT_RATIO_VALUE } from "../types";
import { cutClip, getMediaDurationSeconds } from "./ffmpeg-cut";

const execFileAsync = promisify(execFile);

type CROPPING_ASPECT_RATIO = Exclude<MEDIA_ASPECT_RATIO_VALUE, "original">;

/**
 * `plan.json` written by the Python worker (`backend/workers/reframe`,
 * `python -m reframe`). Validated because it crosses a process boundary —
 * a malformed plan must degrade to the centre crop, not a broken render.
 */
const REFRAME_PLAN_SCHEMA = z.object({
  version: z.literal(1),
  mode: z.enum(MEDIA_REFRAME_MODES),
  fallbackReason: z.string().nullable().optional(),
  crop: z
    .object({ width: z.number().int().positive(), height: z.number().int().positive() })
    .nullable(),
  segments: z.array(
    z.object({
      start: z.number().nonnegative(),
      end: z.number().nonnegative(),
      x: z.number().int().nonnegative(),
      y: z.number().int().nonnegative(),
      layout: z.enum(MEDIA_REFRAME_LAYOUTS).optional().default("crop"),
    }),
  ),
});

type REFRAME_PLAN = z.infer<typeof REFRAME_PLAN_SCHEMA>;

function workerPython(): string {
  return MEDIA_REFRAME.PYTHON_BIN || join(MEDIA_REFRAME.WORKER_DIR, ".venv", "bin", "python");
}

/**
 * Piecewise crop position as ffmpeg expressions of `t`: `x` holds each
 * segment's value until that segment's end, so the crop jumps (a hard cut)
 * exactly at segment boundaries and never pans. Quoted like
 * `buildAspectRatioFilter`'s crop so the inner commas are not read as
 * filter separators.
 *
 * Wide segments show the whole frame instead: fitted to the output width and
 * centred on a blurred, zoomed copy of the same frame. Both looks come from a
 * `split` of the one input, and the wide look is laid over the crop only while
 * a wide segment runs, so a single encode covers the whole clip.
 */
export function buildSpeakerCropFilter(
  plan: REFRAME_PLAN,
  crop: { width: number; height: number },
  aspectRatio: CROPPING_ASPECT_RATIO,
): string {
  const { outputWidth, outputHeight } = MEDIA_ASPECT_RATIO_DIMENSIONS[aspectRatio];
  const piecewise = (key: "x" | "y"): string => {
    const segments = plan.segments;
    let expr = String(segments[segments.length - 1][key]);
    for (let i = segments.length - 2; i >= 0; i--) {
      expr = `if(lt(t,${segments[i].end.toFixed(3)}),${segments[i][key]},${expr})`;
    }
    return expr;
  };
  const cropped = `crop=${crop.width}:${crop.height}:'${piecewise("x")}':'${piecewise("y")}',scale=${outputWidth}:${outputHeight},setsar=1`;

  const wide = plan.segments.filter((segment) => segment.layout === "wide");
  if (wide.length === 0) {
    return cropped;
  }
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  const during = wide
    .map((segment) => `gte(t,${segment.start.toFixed(3)})*lt(t,${segment.end.toFixed(3)})`)
    .join("+");
  const blurWidth = even(outputWidth * MEDIA_REFRAME.WIDE_BACKGROUND_SCALE);
  const blurHeight = even(outputHeight * MEDIA_REFRAME.WIDE_BACKGROUND_SCALE);
  return [
    "split=3[tight][full][back]",
    `[tight]${cropped}[cropped]`,
    `[full]scale=${outputWidth}:-2,setsar=1[fitted]`,
    `[back]crop=${crop.width}:${crop.height},scale=${blurWidth}:${blurHeight},boxblur=${MEDIA_REFRAME.WIDE_BACKGROUND_BLUR_RADIUS}:2,scale=${outputWidth}:${outputHeight},setsar=1[blurred]`,
    "[blurred][fitted]overlay=(W-w)/2:(H-h)/2[framed]",
    `[cropped][framed]overlay=0:0:enable='${during}'`,
  ].join(";");
}

async function runWorker(
  sourcePath: string,
  planPath: string,
  aspectRatio: CROPPING_ASPECT_RATIO,
): Promise<{ plan?: REFRAME_PLAN & { crop: { width: number; height: number } }; fallbackReason?: string }> {
  const python = workerPython();
  if (!existsSync(python)) {
    return { fallbackReason: MEDIA_ERROR_MESSAGES.REFRAME_WORKER_MISSING };
  }

  const args = ["-m", "reframe", sourcePath, "--out", planPath, "--aspect", aspectRatio];
  if (ffmpegPath) args.push("--ffmpeg", ffmpegPath);
  if (MEDIA_REFRAME.MODELS_DIR) args.push("--models-dir", MEDIA_REFRAME.MODELS_DIR);

  try {
    await execFileAsync(python, args, {
      cwd: MEDIA_REFRAME.WORKER_DIR,
      timeout: MEDIA_REFRAME.WORKER_TIMEOUT_MS,
      maxBuffer: MEDIA_REFRAME.WORKER_MAX_BUFFER_BYTES,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { fallbackReason: `${MEDIA_ERROR_MESSAGES.REFRAME_WORKER_FAILED}: ${message.slice(-500)}` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(planPath, "utf8"));
  } catch {
    return { fallbackReason: MEDIA_ERROR_MESSAGES.REFRAME_PLAN_INVALID };
  }
  const parsed = REFRAME_PLAN_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    return { fallbackReason: MEDIA_ERROR_MESSAGES.REFRAME_PLAN_INVALID };
  }
  const plan = parsed.data;
  if (plan.mode !== "speaker" || !plan.crop || plan.segments.length === 0) {
    return { fallbackReason: plan.fallbackReason ?? MEDIA_ERROR_MESSAGES.REFRAME_NO_PLAN };
  }
  return { plan: { ...plan, crop: plan.crop } };
}

/**
 * Renders `sourcePath` (an unframed cut of the requested range) into
 * `outputPath` at `aspectRatio`, following whoever is talking. The Python
 * worker only plans; this renders with the same ffmpeg settings as `cutClip`.
 * Any worker problem — not installed, error, timeout, no faces — renders the
 * plain centre crop instead and says why, so a clip never fails here.
 */
export async function reframeClipBySpeaker(
  sourcePath: string,
  outputPath: string,
  aspectRatio: CROPPING_ASPECT_RATIO,
): Promise<CUT_CLIP_REFRAME> {
  if (!ffmpegPath) {
    throw new Error(MEDIA_ERROR_MESSAGES.FFMPEG_CUT_FAILED);
  }

  const planPath = outputPath.replace(/\.[^./]+$/, "") + ".reframe.json";
  const { plan, fallbackReason } = await runWorker(sourcePath, planPath, aspectRatio);
  const keptPlanPath = existsSync(planPath) ? planPath : undefined;

  if (!plan) {
    const duration = await getMediaDurationSeconds(sourcePath);
    await cutClip(sourcePath, 0, duration, outputPath, aspectRatio, true);
    return { mode: "center", fallbackReason, planPath: keptPlanPath };
  }

  try {
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      sourcePath,
      "-vf",
      buildSpeakerCropFilter(plan, plan.crop, aspectRatio),
      "-map",
      "0:v",
      "-map",
      "0:a?",
      "-c:v",
      MEDIA.FFMPEG_VIDEO_CODEC,
      "-preset",
      MEDIA.FFMPEG_PRESET,
      "-crf",
      MEDIA.FFMPEG_CRF,
      "-c:a",
      MEDIA.FFMPEG_AUDIO_CODEC,
      "-avoid_negative_ts",
      "make_zero",
      outputPath,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${MEDIA_ERROR_MESSAGES.FFMPEG_REFRAME_FAILED}: ${message}`);
  }

  return {
    mode: "speaker",
    segments: plan.segments.length,
    wideSegments: plan.segments.filter((segment) => segment.layout === "wide").length,
    planPath: keptPlanPath,
  };
}
