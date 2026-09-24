import { execFile } from "node:child_process";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import { MEDIA_ERROR_MESSAGES, MEDIA_HIDE } from "../constants";
import type { HIDE_REGION, DETECTED_REGION } from "./types";

const execFileAsync = promisify(execFile);

/** Even values only — an odd crop origin or size is rejected on yuv420p. */
function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/**
 * One frame as raw 8-bit grayscale pixels.
 *
 * Raw rather than PNG so there is nothing to decode: `-f rawvideo -pix_fmt
 * gray` hands back exactly `width * height` bytes on stdout, which is already
 * the array the analysis wants. Decoding PNGs would mean a new dependency for
 * data ffmpeg can emit directly.
 */
async function grabGrayFrame(
  sourcePath: string,
  atSeconds: number,
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (!ffmpegPath) throw new Error(MEDIA_ERROR_MESSAGES.EFFECTS_DETECT_FAILED);
  const { stdout } = await execFileAsync(
    ffmpegPath,
    [
      "-v", "error",
      "-ss", atSeconds.toFixed(3),
      "-i", sourcePath,
      "-frames:v", "1",
      "-vf", `scale=${width}:${height}`,
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      "-",
    ],
    { encoding: "buffer", maxBuffer: width * height * 4 },
  );
  if (stdout.length < width * height) {
    throw new Error(MEDIA_ERROR_MESSAGES.EFFECTS_DETECT_FAILED);
  }
  return new Uint8Array(stdout.buffer, stdout.byteOffset, width * height);
}

/** Max-filter the mask by `radius` in each axis, so a mark and the text under it become one region. */
function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const horizontal = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let hit = 0;
      for (let d = -radius; d <= radius && !hit; d++) {
        const nx = x + d;
        if (nx >= 0 && nx < width && mask[row + nx]) hit = 1;
      }
      horizontal[row + x] = hit;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = 0;
      for (let d = -radius; d <= radius && !hit; d++) {
        const ny = y + d;
        if (ny >= 0 && ny < height && horizontal[ny * width + x]) hit = 1;
      }
      out[y * width + x] = hit;
    }
  }
  return out;
}


type COMPONENT = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number;
  gradientSum: number;
  stddevSum: number;
};

/** 8-connected flood fill, iterative — a recursive fill overflows the stack on a large region. */
function components(mask: Uint8Array, width: number, height: number): COMPONENT[] {
  const seen = new Uint8Array(mask.length);
  const found: COMPONENT[] = [];
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const component: COMPONENT = {
      minX: width, minY: height, maxX: 0, maxY: 0,
      pixels: 0, gradientSum: 0, stddevSum: 0,
    };
    stack.push(start);
    seen[start] = 1;

    while (stack.length > 0) {
      const index = stack.pop() as number;
      const x = index % width;
      const y = (index - x) / width;
      component.pixels++;
      if (x < component.minX) component.minX = x;
      if (x > component.maxX) component.maxX = x;
      if (y < component.minY) component.minY = y;
      if (y > component.maxY) component.maxY = y;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    found.push(component);
  }
  return found;
}

/**
 * Find burned-in overlays by looking for pixels that are BOTH still across the
 * clip and structured.
 *
 * Neither test works alone. Temporal stillness on its own selects every locked
 * -off background — which on podcast footage is most of the frame. Spatial
 * structure on its own selects the speaker's own face. Their intersection is
 * almost exclusively graphics burned into the picture.
 *
 * What it will not find: an overlay that fades or animates (not still), one
 * over a static part of the frame it matches in tone (no gradient), and
 * anything away from the edges — an overlay hugs a corner, and requiring that
 * is what keeps a motionless prop in the middle of frame out of the results.
 * All three are reasons to pass explicit regions instead, which is the better
 * path anyway once a creator's mark is known.
 *
 * Both statistics here are MEDIAN-based, and that is not a refinement. A mean
 * and a standard deviation let a SINGLE unrepresentative frame decide the whole
 * result: sample a title card, a cut to white, or a B-roll insert, and every
 * pixel's spread jumps at once — the logo's included — so nothing passes the
 * still test and the detector reports no overlay at all. Measured on a PGX
 * episode carrying a plain white cutaway: with that one frame among twelve the
 * stillest pixel in the logo's own corner scored 24.7 and not one pixel read as
 * static; dropping it alone took the minimum to 0.0 and the mark appeared
 * immediately. The failure is silent and total, and it is why the clips from
 * that episode went out with the source's bug still on them.
 *
 * A median absolute deviation survives up to half the frames being unlike the
 * rest, so a cutaway or two costs nothing. It is scaled by 1/0.6745 into the
 * same units a standard deviation would have reported on well-behaved footage,
 * so `STATIC_MAX_STDDEV` keeps its existing meaning and needed no retuning.
 */
export async function detectStaticOverlays(
  sourcePath: string,
  sourceWidth: number,
  sourceHeight: number,
  durationSeconds: number,
): Promise<DETECTED_REGION[]> {
  const settings = MEDIA_HIDE.DETECT;
  const width = even(settings.WIDTH);
  const height = even((width * sourceHeight) / sourceWidth);
  const pixels = width * height;

  const span = 1 - settings.EDGE_SKIP_FRACTION * 2;
  const timestamps = Array.from({ length: settings.FRAMES }, (_, i) =>
    durationSeconds * (settings.EDGE_SKIP_FRACTION + (span * i) / Math.max(1, settings.FRAMES - 1)),
  );

  // The frames are kept rather than folded into running sums: a median needs
  // every value, and at 320px wide by 12 frames that is well under a megabyte.
  const frames: Uint8Array[] = [];
  for (const at of timestamps) {
    try {
      frames.push(await grabGrayFrame(sourcePath, at, width, height));
    } catch {
      continue; // A single unreadable seek is not a failed detection.
    }
  }
  const sampled = frames.length;
  if (sampled < 3) throw new Error(MEDIA_ERROR_MESSAGES.EFFECTS_DETECT_FAILED);

  /** Median of `count` values held at the front of `scratch`, sorted in place. */
  function medianOf(scratch: Float64Array, count: number): number {
    const values = scratch.subarray(0, count);
    values.sort();
    const middle = count >> 1;
    return count % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  }

  const median = new Float64Array(pixels);
  const spread = new Float64Array(pixels);
  const scratch = new Float64Array(sampled);
  for (let i = 0; i < pixels; i++) {
    for (let f = 0; f < sampled; f++) scratch[f] = frames[f][i];
    const mid = medianOf(scratch, sampled);
    median[i] = mid;
    // Reuse the scratch for |value - median|, then take its median: the MAD.
    for (let f = 0; f < sampled; f++) scratch[f] = Math.abs(frames[f][i] - mid);
    spread[i] = medianOf(scratch, sampled) / MEDIA_HIDE.DETECT.MAD_TO_STDDEV;
  }

  // Gradient of the MEDIAN frame: how much structure sits at this pixel. The
  // median frame matters as much as the median spread — averaging a cut to
  // white into the reference washes out the very edges this then looks for.
  const gradient = new Float64Array(pixels);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      gradient[i] =
        Math.abs(median[i + 1] - median[i - 1]) + Math.abs(median[i + width] - median[i - width]);
    }
  }

  const mask = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    mask[i] =
      spread[i] <= settings.STATIC_MAX_STDDEV && gradient[i] >= settings.MIN_GRADIENT ? 1 : 0;
  }

  const radius = Math.max(1, Math.round(width * settings.DILATE_FRACTION));
  const found = components(dilate(mask, width, height, radius), width, height);

  const scaleX = sourceWidth / width;
  const scaleY = sourceHeight / height;
  const regions: DETECTED_REGION[] = [];

  for (const component of found) {
    const boxWidth = component.maxX - component.minX + 1;
    const boxHeight = component.maxY - component.minY + 1;
    const areaFraction = (boxWidth * boxHeight) / pixels;
    if (areaFraction < settings.MIN_AREA_FRACTION || areaFraction > settings.MAX_AREA_FRACTION) {
      continue;
    }

    // Nearest-edge gap, as a fraction of the dimension it is measured along.
    /**
     * Compactness is measured on the UN-DILATED extent, and that detail is the
     * whole test.
     *
     * Dilation exists to merge a mark with the sponsor strip under it, but it
     * inflates everything by the same radius — which disguises a thin line as
     * a chunky blob. Measured on real 2.39:1 footage, the edge where the black
     * letterbox bar meets the picture is perfectly static with a hard edge, so
     * it scores like a logo on every other test; dilated it looked like
     * 270x102, while its true extent was nearer 200x30. Shrinking back before
     * judging the shape tells a bug (roughly square) from a bar edge (a line)
     * without needing to know the bars are there at all.
     */
    const tightMinX = component.minX + radius;
    const tightMaxX = component.maxX - radius;
    const tightMinY = component.minY + radius;
    const tightMaxY = component.maxY - radius;
    const tightWidth = Math.max(1, tightMaxX - tightMinX + 1);
    const tightHeight = Math.max(1, tightMaxY - tightMinY + 1);
    if (
      tightWidth / width > settings.MAX_EXTENT_FRACTION ||
      tightHeight / height > settings.MAX_EXTENT_FRACTION
    ) {
      continue;
    }
    const aspect = tightWidth / tightHeight;
    if (aspect > settings.MAX_ASPECT || aspect < 1 / settings.MAX_ASPECT) continue;

    const gap = Math.min(
      component.minX / width,
      component.minY / height,
      (width - 1 - component.maxX) / width,
      (height - 1 - component.maxY) / height,
    );
    if (gap > settings.MAX_EDGE_GAP_FRACTION) continue;

    // Score the original (undilated) mask pixels inside the box, so the
    // dilation that merged the region does not dilute its own evidence.
    let maskPixels = 0;
    let gradientSum = 0;
    let stddevSum = 0;
    for (let y = component.minY; y <= component.maxY; y++) {
      for (let x = component.minX; x <= component.maxX; x++) {
        const i = y * width + x;
        if (!mask[i]) continue;
        maskPixels++;
        gradientSum += gradient[i];
        stddevSum += spread[i];
      }
    }
    if (maskPixels === 0) continue;

    const staticness = Math.max(
      0,
      1 - stddevSum / maskPixels / settings.STATIC_MAX_STDDEV,
    );
    const structure = Math.min(1, gradientSum / maskPixels / (settings.MIN_GRADIENT * 3));
    const anchoring = Math.max(0, 1 - gap / settings.MAX_EDGE_GAP_FRACTION);
    const confidence = Number((staticness * 0.4 + structure * 0.4 + anchoring * 0.2).toFixed(3));

    // Grow the box out to the mark's real extent on the weak threshold before
    // padding. See GROW_GRADIENT in constants for why two thresholds.
    const weak = (x: number, y: number): boolean =>
      spread[y * width + x] <= settings.STATIC_MAX_STDDEV &&
      gradient[y * width + x] >= settings.GROW_GRADIENT;

    let { minX: gMinX, maxX: gMaxX, minY: gMinY, maxY: gMaxY } = component;
    const limitX = Math.ceil(boxWidth * settings.GROW_MAX_FRACTION);
    const limitY = Math.ceil(boxHeight * settings.GROW_MAX_FRACTION);

    const rowShare = (y: number, x0: number, x1: number): number => {
      let hits = 0;
      for (let x = x0; x <= x1; x++) if (weak(x, y)) hits++;
      return hits / Math.max(1, x1 - x0 + 1);
    };
    const colShare = (x: number, y0: number, y1: number): number => {
      let hits = 0;
      for (let y = y0; y <= y1; y++) if (weak(x, y)) hits++;
      return hits / Math.max(1, y1 - y0 + 1);
    };

    for (let step = 0; step < limitY && gMinY > 0; step++) {
      if (rowShare(gMinY - 1, gMinX, gMaxX) < settings.GROW_MIN_SHARE) break;
      gMinY--;
    }
    for (let step = 0; step < limitY && gMaxY < height - 1; step++) {
      if (rowShare(gMaxY + 1, gMinX, gMaxX) < settings.GROW_MIN_SHARE) break;
      gMaxY++;
    }
    for (let step = 0; step < limitX && gMinX > 0; step++) {
      if (colShare(gMinX - 1, gMinY, gMaxY) < settings.GROW_MIN_SHARE) break;
      gMinX--;
    }
    for (let step = 0; step < limitX && gMaxX < width - 1; step++) {
      if (colShare(gMaxX + 1, gMinY, gMaxY) < settings.GROW_MIN_SHARE) break;
      gMaxX++;
    }

    const grownWidth = gMaxX - gMinX + 1;
    const grownHeight = gMaxY - gMinY + 1;
    const padX = grownWidth * settings.PAD_FRACTION;
    const padY = grownHeight * settings.PAD_FRACTION;
    const x = Math.max(0, (gMinX - padX) * scaleX);
    const y = Math.max(0, (gMinY - padY) * scaleY);

    regions.push({
      x: even(x),
      y: even(y),
      width: even(Math.min(sourceWidth - even(x), (grownWidth + padX * 2) * scaleX)),
      height: even(Math.min(sourceHeight - even(y), (grownHeight + padY * 2) * scaleY)),
      confidence,
      staticness: Number(staticness.toFixed(3)),
      structure: Number(structure.toFixed(3)),
    });
  }

  return regions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, settings.MAX_REGIONS);
}

/** Clamp a caller-supplied region into the frame, on even coordinates. */
export function normalizeRegion(
  region: HIDE_REGION,
  sourceWidth: number,
  sourceHeight: number,
): HIDE_REGION {
  const x = even(Math.max(0, Math.min(region.x, sourceWidth - 2)));
  const y = even(Math.max(0, Math.min(region.y, sourceHeight - 2)));
  return {
    x,
    y,
    width: even(Math.max(2, Math.min(region.width, sourceWidth - x))),
    height: even(Math.max(2, Math.min(region.height, sourceHeight - y))),
  };
}
