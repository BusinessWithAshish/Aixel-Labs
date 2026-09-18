import { execFile } from "node:child_process";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import { MEDIA_ERROR_MESSAGES, MEDIA_HIDE } from "../constants";
import type { HIDE_REGION, SURROUND_COLOUR } from "./types";

const execFileAsync = promisify(execFile);

/**
 * Clamp a rectangle into the frame, on EVEN coordinates and dimensions.
 *
 * The even part is not cosmetic. Cropping an odd width or height out of a
 * yuv420p source and asking for rgb24 back returns short — ffmpeg reports
 * success and hands over fewer bytes than `w * h * 3`. Measured: a box hugging
 * the frame's right edge clamped to a 269-pixel-wide window and the sample
 * silently failed, while an 82-wide one beside it worked. Round everything
 * down to even and the whole class of failure disappears.
 */
function clampRect(
  rect: HIDE_REGION,
  frameWidth: number,
  frameHeight: number,
): HIDE_REGION {
  const down = (value: number) => Math.max(2, Math.floor(value / 2) * 2);
  const x = Math.max(0, Math.min(Math.floor(rect.x / 2) * 2, frameWidth - 2));
  const y = Math.max(0, Math.min(Math.floor(rect.y / 2) * 2, frameHeight - 2));
  return {
    x,
    y,
    width: down(Math.min(rect.width, frameWidth - x)),
    height: down(Math.min(rect.height, frameHeight - y)),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function stddev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += (value - mean) * (value - mean);
  return Math.sqrt(total / values.length);
}

/** One frame's worth of a rectangle, as raw 8-bit RGB triplets. */
async function grabRgbRect(
  sourcePath: string,
  atSeconds: number,
  rect: HIDE_REGION,
): Promise<Uint8Array> {
  if (!ffmpegPath) throw new Error(MEDIA_ERROR_MESSAGES.EFFECTS_SURROUND_FAILED);
  const bytes = rect.width * rect.height * 3;
  const { stdout } = await execFileAsync(
    ffmpegPath,
    [
      "-v", "error",
      "-ss", atSeconds.toFixed(3),
      "-i", sourcePath,
      "-frames:v", "1",
      "-vf", `crop=${rect.width}:${rect.height}:${rect.x}:${rect.y}`,
      "-f", "rawvideo",
      "-pix_fmt", "rgb24",
      "-",
    ],
    { encoding: "buffer", maxBuffer: bytes * 4 + 1024 },
  );
  if (stdout.length < bytes) throw new Error(MEDIA_ERROR_MESSAGES.EFFECTS_SURROUND_FAILED);
  return new Uint8Array(stdout.buffer, stdout.byteOffset, bytes);
}

/**
 * Find the colour of the background immediately AROUND a region, so the region
 * can be painted out with a flat patch that matches its surroundings.
 *
 * Why a ring and not the region itself: the pixels behind an opaque logo are
 * never visible in any frame, so there is nothing to recover — no amount of
 * temporal averaging gets them back. What CAN be known is what the background
 * does right up to the logo's edge, and on a flat set that is the same colour
 * the logo is sitting on.
 *
 * Two measurements decide whether this is safe, and both must pass:
 *
 * - **spread** — how much the ring's colour varies WITHIN a frame. A flat
 *   studio wall is near zero. A ring that straddles a wall and a bright lamp
 *   is not, and a flat patch there would read as a sticker.
 * - **drift** — how much the ring's colour moves ACROSS frames. Someone
 *   walking behind the logo, or a lighting change, shows up here. A single
 *   colour cannot follow that.
 *
 * A `SAFETY` gap is left between the region and the ring because logo edges
 * are anti-aliased and often carry a soft glow: sampling flush against the box
 * pulls the logo's own colour into the average, which is exactly the thing we
 * are trying not to paint.
 */
export async function sampleSurroundColour(
  sourcePath: string,
  region: HIDE_REGION,
  frameWidth: number,
  frameHeight: number,
  durationSeconds: number,
): Promise<SURROUND_COLOUR> {
  const settings = MEDIA_HIDE.SURROUND;
  const shortSide = Math.min(region.width, region.height);
  const ring = Math.max(settings.MIN_RING_PX, Math.round(shortSide * settings.RING_FRACTION));
  const safety = Math.max(settings.MIN_SAFETY_PX, Math.round(shortSide * settings.SAFETY_FRACTION));

  const outer = clampRect(
    {
      x: region.x - ring - safety,
      y: region.y - ring - safety,
      width: region.width + (ring + safety) * 2,
      height: region.height + (ring + safety) * 2,
    },
    frameWidth,
    frameHeight,
  );

  // The excluded zone, in coordinates relative to `outer`.
  const holeX = region.x - safety - outer.x;
  const holeY = region.y - safety - outer.y;
  const holeRight = holeX + region.width + safety * 2;
  const holeBottom = holeY + region.height + safety * 2;

  const span = 1 - settings.EDGE_SKIP_FRACTION * 2;
  const timestamps = Array.from({ length: settings.FRAMES }, (_, i) =>
    durationSeconds * (settings.EDGE_SKIP_FRACTION + (span * i) / Math.max(1, settings.FRAMES - 1)),
  );

  const perFrameMedians: number[][] = [];
  const allChannels: number[][] = [[], [], []];

  for (const at of timestamps) {
    let pixels: Uint8Array;
    try {
      pixels = await grabRgbRect(sourcePath, at, outer);
    } catch {
      continue; // one unreadable seek is not a failed sample
    }
    const frameChannels: number[][] = [[], [], []];
    for (let y = 0; y < outer.height; y++) {
      for (let x = 0; x < outer.width; x++) {
        if (x >= holeX && x < holeRight && y >= holeY && y < holeBottom) continue;
        const i = (y * outer.width + x) * 3;
        for (let c = 0; c < 3; c++) {
          frameChannels[c].push(pixels[i + c]);
          allChannels[c].push(pixels[i + c]);
        }
      }
    }
    if (frameChannels[0].length > 0) {
      perFrameMedians.push(frameChannels.map(median));
    }
  }

  if (perFrameMedians.length < 2 || allChannels[0].length < settings.MIN_SAMPLE_PIXELS) {
    throw new Error(MEDIA_ERROR_MESSAGES.EFFECTS_SURROUND_FAILED);
  }

  const rgb = allChannels.map(median) as [number, number, number];
  const spread = Math.max(...allChannels.map((channel, c) => stddev(channel, rgb[c])));

  // Consensus: the share of sampled pixels that actually match the colour we
  // would paint. This is the gate, not `spread` — a ring whose far corner
  // clips into a bright object has a large stddev while every pixel along the
  // seam is still the same flat colour, and that fill would be invisible.
  let agreeing = 0;
  const total = allChannels[0].length;
  for (let i = 0; i < total; i++) {
    if (
      Math.abs(allChannels[0][i] - rgb[0]) <= settings.CONSENSUS_TOLERANCE &&
      Math.abs(allChannels[1][i] - rgb[1]) <= settings.CONSENSUS_TOLERANCE &&
      Math.abs(allChannels[2][i] - rgb[2]) <= settings.CONSENSUS_TOLERANCE
    ) {
      agreeing++;
    }
  }
  const consensus = Number((agreeing / total).toFixed(3));
  const drift = Math.max(
    ...[0, 1, 2].map((c) => {
      const perFrame = perFrameMedians.map((m) => m[c]);
      return Math.max(...perFrame) - Math.min(...perFrame);
    }),
  );

  const hex = `0x${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return {
    hex,
    rgb,
    spread: Number(spread.toFixed(2)),
    consensus,
    drift,
    samples: total,
    uniform: consensus >= settings.MIN_CONSENSUS && drift <= settings.MAX_DRIFT,
  };
}

/**
 * The colour of an image's top-left pixel, as `0xRRGGBB`.
 *
 * Used for `logo.keyColor: "auto"`. The corner is the right sample for a mark
 * drawn on a flat background — which is what a channel avatar is — and the
 * wrong one for a photograph, which is why `auto` is opt-in rather than the
 * default.
 */
export async function cornerColour(imagePath: string): Promise<string | undefined> {
  if (!ffmpegPath) return undefined;
  try {
    const { stdout } = await execFileAsync(
      ffmpegPath,
      ["-v", "error", "-i", imagePath, "-vf", "crop=1:1:0:0", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
      { encoding: "buffer", maxBuffer: 1024 },
    );
    if (stdout.length < 3) return undefined;
    return `0x${[...stdout.subarray(0, 3)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return undefined;
  }
}
