import {
  MEDIA_EFFECTS,
  MEDIA_ERROR_MESSAGES,
  MEDIA_HIDE,
  MEDIA_LOGO,
  MEDIA_SAFE_AREA,
} from "../constants";
import type {
  COVER_PLAN,
  HIDE_REGION,
  LOGO_INSETS,
  LOGO_OPTIONS,
  HIDE_STYLE,
  SPEED_OPTIONS,
  SPEED_PLAN,
} from "./types";

/**
 * Cover one region: split the frame, blur the crop, put it back where it came
 * from.
 *
 * ffmpeg has `delogo`, which interpolates a region away from its border
 * pixels, and it is the wrong tool here. It is built for a translucent station
 * bug over moving video; over an opaque mark it smears, and the smear reads as
 * damaged footage. A blur or a pixelate reads as a deliberate edit, which is
 * what this is.
 */
function patchFilter(style: HIDE_STYLE, region: HIDE_REGION, strength: number): string {
  const shortSide = Math.min(region.width, region.height);
  if (style === "pixelate") {
    // Block size, floored at 4: below that a "pixelation" is still legible.
    const block = Math.max(4, Math.min(Math.round(shortSide * strength), Math.floor(shortSide / 2)));
    return `pixelize=w=${block}:h=${block}`;
  }
  // boxblur rejects a radius larger than half the plane it runs on, and on
  // yuv420p the chroma planes are HALF the luma's size — so a radius that is
  // legal for luma is out of range for chroma on any region under ~4x the
  // radius. Both are clamped to their own plane, which is why chroma gets its
  // own number rather than inheriting the luma one.
  const luma = Math.max(2, Math.min(Math.round(shortSide * strength), Math.floor(shortSide / 2) - 1));
  const chroma = Math.max(1, Math.min(Math.floor(luma / 2), Math.floor(shortSide / 4) - 1));
  return `boxblur=luma_radius=${luma}:luma_power=2:chroma_radius=${chroma}:chroma_power=2`;
}

/**
 * Resolve a `speed` request into the filters that render it.
 *
 * Three filters, each doing one job, chosen deliberately:
 *
 *  - **`setpts`** for the video. It rewrites timestamps; it does not resample
 *    frames. So a speed-up keeps every frame and raises the frame rate, and a
 *    slowdown keeps every frame and lowers it — the source's own pictures,
 *    respaced. Nothing is interpolated, which is why a heavy slowdown looks
 *    choppy rather than smooth, and why that is a property of the tool and not
 *    a bug to fix with `minterpolate`.
 *  - **`atempo`** when the pitch must not move. It time-stretches, so a voice
 *    sped up still sounds like that person. This is the default because it is
 *    what "play it faster" means to almost everyone who asks for it.
 *  - **`asetrate` + `aresample`** when the pitch should ride the rate. The
 *    samples are reinterpreted at a different rate and then resampled back, so
 *    tempo and pitch move together: a record played faster. A genuinely
 *    different effect from the one above, not a cheaper version of it.
 *  - **`rubberband`** for pitch alone. It is the only filter here that can move
 *    pitch while leaving the tempo exactly where it was; `asetrate` cannot,
 *    because changing the pitch is how it changes the tempo.
 *
 * `hasAudio` is not an optimisation. Asking a filtergraph for `[0:a]` on a clip
 * with no audio stream fails the whole render, so a silent source gets the video
 * half of the request and a note saying the other half was skipped.
 */
export function buildSpeedPlan(speed: SPEED_OPTIONS, hasAudio: boolean): SPEED_PLAN {
  const rate = speed.rate ?? 1;
  const semitones = speed.semitones ?? 0;
  const pitchFollowsRate = speed.pitchFollowsRate === true;
  const plan: SPEED_PLAN = { rate, pitchFollowsRate, semitones };

  // Dividing the presentation timestamps by the rate is what makes the clip
  // shorter: every frame keeps its place in the sequence and loses part of its
  // share of the clock.
  if (rate !== 1) plan.videoFilter = `setpts=PTS/${rate}`;

  if (!hasAudio) {
    // The caller asked for something on the audio side and is not getting it.
    // `applyEffects` refuses outright when that was the ONLY thing asked for;
    // here the video is still being retimed, so it renders and says what was
    // dropped rather than reporting a clean success.
    plan.note = MEDIA_ERROR_MESSAGES.EFFECTS_SPEED_VIDEO_ONLY;
    return plan;
  }

  const audio: string[] = [];
  if (rate !== 1) {
    if (pitchFollowsRate) {
      const hz = MEDIA_EFFECTS.SPEED.RESAMPLE_HZ;
      // Normalise first so the target rate below is arithmetic on a known
      // number rather than on whatever the source happened to be recorded at.
      audio.push(`aresample=${hz}`);
      audio.push(`asetrate=${Math.round(hz * rate)}`);
      // And back, so the stream leaves at a normal rate with its new, shorter
      // duration and its shifted pitch baked in.
      audio.push(`aresample=${hz}`);
    } else {
      // One instance covers the whole exposed range — see SPEED_BOUNDS.RATE.
      audio.push(`atempo=${rate}`);
    }
  }
  if (semitones !== 0) {
    // rubberband takes a pitch SCALE, not semitones: twelve semitones is a
    // doubling, so the scale is the equal-tempered 2^(n/12).
    const pitchScale = Number(Math.pow(2, semitones / 12).toFixed(6));
    plan.pitchScale = pitchScale;
    audio.push(`rubberband=pitch=${pitchScale}`);
  }
  if (audio.length > 0) plan.audioFilters = audio;
  return plan;
}

/**
 * Even pixels, rounded UP.
 *
 * Even because odd numbers out of a yuv420p chain are the failure that still
 * exits 0 — the chroma planes are half size, so an odd offset or dimension is
 * resolved by ffmpeg however it likes rather than reported. UP because these are
 * insets: rounding one DOWN is the only direction that puts furniture back into
 * the zone it was being moved out of.
 */
function evenInsetUp(value: number): number {
  return Math.max(0, Math.ceil(value / 2) * 2);
}

/**
 * How far in from each edge the mark sits, in real frame pixels.
 *
 * Two modes, and which one applies is decided by whether the caller said
 * anything. An explicit `margin` is honoured verbatim as it always was — one
 * fraction of frame WIDTH on all four edges — because that is the knob channels
 * and callers use to put a mark somewhere specific, `margin: 0` included, and
 * taking it away to force a policy would be the wrong trade.
 *
 * Silence gets `MEDIA_SAFE_AREA.DEFAULT` instead: asymmetric, per-edge, each
 * side measured against the axis it insets. The default is the one that has to
 * be safe, since it is what every caller who has not thought about notches gets.
 */
export function resolveLogoInsets(
  margin: number | undefined,
  width: number,
  height: number,
): LOGO_INSETS & { source: "safe-area" | "margin" } {
  if (margin !== undefined) {
    const uniform = evenInsetUp(width * margin);
    return { top: uniform, right: uniform, bottom: uniform, left: uniform, source: "margin" };
  }
  const safe = MEDIA_SAFE_AREA.DEFAULT;
  const side = evenInsetUp(width * safe.SIDE_WIDTH_RATIO);
  return {
    top: evenInsetUp(height * safe.TOP_HEIGHT_RATIO),
    bottom: evenInsetUp(height * safe.BOTTOM_HEIGHT_RATIO),
    right: side,
    left: side,
    source: "safe-area",
  };
}

/**
 * `top-right` etc -> an ffmpeg overlay x:y pair, from insets already resolved to
 * pixels.
 *
 * Four insets rather than one scalar. The safe areas a phone and a host app take
 * out of a vertical frame are asymmetric by a factor of five — the top loses a
 * notch, the bottom loses the platform's whole caption and action block — so one
 * number cannot place a mark safely at more than one corner. See
 * `MEDIA_SAFE_AREA` for what each edge is and where it comes from.
 */
function logoPlacement(position: string, insets: LOGO_INSETS): { x: string; y: string } {
  const top = `${insets.top}`;
  const left = `${insets.left}`;
  const right = `W-w-${insets.right}`;
  const bottom = `H-h-${insets.bottom}`;
  switch (position) {
    case "top-left":
      return { x: left, y: top };
    case "bottom-left":
      return { x: left, y: bottom };
    case "bottom-right":
      return { x: right, y: bottom };
    default:
      return { x: right, y: top };
  }
}

/**
 * Build the whole treatment as ONE filtergraph, so a clip carrying a grade, two
 * blurred regions and a logo is still a single decode and a single encode.
 *
 * The order is fixed and it matters:
 *
 *  1. **grade** first, so the look applies to the footage as shot.
 *  2. **hide** second. Blurring after the grade means the covered patch is
 *     made of already-graded pixels and blends; blurring first would leave a
 *     patch the grade then pushes in a different direction to its surroundings.
 *  3. **logo** last, and this is the one that is not merely tidy. Your own mark
 *     must not be graded — a channel mark that shifts hue with every preset
 *     stops being a constant — and it must not be within reach of `hide`,
 *     which is in the business of blurring exactly the kind of thing it is.
 *
 * `speed` sits outside that ordering rather than in it. `setpts` goes first
 * because it touches the clock and not the picture: every pixel filter after it
 * sees exactly the frames it would have seen anyway, so the documented
 * grade -> hide -> logo chain is unchanged and stays readable. The audio chain
 * is a second, independent chain in the same `-filter_complex`, so a clip
 * carrying a grade, two covered regions, a mark, a new tempo and a new pitch is
 * still ONE decode and ONE encode.
 */
export function buildFilterGraph(options: {
  gradeFilters: string[];
  covers: COVER_PLAN[];
  logo?: LOGO_OPTIONS & { pixelWidth: number; pixelInsets: LOGO_INSETS };
  /** Local image path -> ffmpeg input index. The video is always input 0. */
  imageIndex: Map<string, number>;
  /** `setpts`, when `speed.rate` rescales the timeline. */
  videoTimeFilter?: string;
  /** The `speed` audio chain. Its presence is what makes the render re-encode audio. */
  audioFilters?: string[];
}): { graph: string | null; outLabel: string; audioOutLabel?: string } {
  const { gradeFilters, covers, logo, imageIndex, videoTimeFilter, audioFilters } = options;
  const steps: string[] = [];
  let label = "[0:v]";

  if (videoTimeFilter) {
    steps.push(`${label}${videoTimeFilter}[timed]`);
    label = "[timed]";
  }

  if (gradeFilters.length > 0) {
    steps.push(`${label}${gradeFilters.join(",")}[graded]`);
    label = "[graded]";
  }

  covers.forEach((cover, i) => {
    const { region } = cover;
    if (cover.style === "replace" && cover.replaceWith) {
      // Cover their mark with ours, in the same place, rather than erasing it.
      //
      // Two steps and both matter. The backing box is painted first so the
      // region is a known flat colour before anything lands on it — without it
      // any part of their mark the replacement does not fully cover shows
      // around the edges. Then the image is fitted INSIDE the region with
      // `force_original_aspect_ratio=decrease` and centred, so a square mark
      // over a tall region stays square instead of being stretched to fit.
      const index = imageIndex.get(cover.replaceWith);
      const backing = cover.colour ?? "0x000000";
      steps.push(
        `${label}drawbox=x=${region.x}:y=${region.y}:w=${region.width}:h=${region.height}` +
          `:color=${backing}:t=fill:replace=1[backed${i}]`,
      );
      // Key before format=rgba, same as the corner logo: an avatar drawn on a
      // flat background otherwise lands as a square sticker sitting on top of
      // the footage instead of as the mark itself.
      const repKey = cover.replaceKeyColour
        ? `colorkey=${cover.replaceKeyColour}:${MEDIA_LOGO.KEY.SIMILARITY}:${MEDIA_LOGO.KEY.BLEND},`
        : "";
      steps.push(
        `[${index}:v]scale=${region.width}:${region.height}` +
          `:force_original_aspect_ratio=decrease,${repKey}format=rgba[rep${i}]`,
      );
      steps.push(
        `[backed${i}][rep${i}]overlay=` +
          `${region.x}+(${region.width}-overlay_w)/2:` +
          `${region.y}+(${region.height}-overlay_h)/2[hidden${i}]`,
      );
      label = `[hidden${i}]`;
      return;
    }
    if (cover.style === "fill") {
      // A flat patch needs no crop-and-overlay dance: drawbox paints straight
      // onto the frame. `replace=1` writes the colour rather than blending it,
      // so the result is exactly the sampled colour and not a tint of whatever
      // was underneath.
      steps.push(
        `${label}drawbox=x=${region.x}:y=${region.y}:w=${region.width}:h=${region.height}` +
          `:color=${cover.colour}:t=fill:replace=1[hidden${i}]`,
      );
      label = `[hidden${i}]`;
      return;
    }
    const crop = `crop=${region.width}:${region.height}:${region.x}:${region.y}`;
    steps.push(`${label}split=2[keep${i}][cut${i}]`);
    steps.push(`[cut${i}]${crop},${patchFilter(cover.style, region, cover.strength)}[cover${i}]`);
    steps.push(`[keep${i}][cover${i}]overlay=${region.x}:${region.y}[hidden${i}]`);
    label = `[hidden${i}]`;
  });

  if (logo) {
    const place = logoPlacement(logo.position ?? MEDIA_LOGO.DEFAULT_POSITION, logo.pixelInsets);
    const index = imageIndex.get(logo.file) ?? 1;
    // `colorkey` before `format=rgba` so the keyed pixels become transparent
    // rather than being flattened first. This is what lets a JPEG avatar serve
    // as the overlay mark: the flat background it was drawn on is keyed out at
    // render time instead of needing a separate file with a real alpha channel.
    const key = logo.keyedColour
      ? `colorkey=${logo.keyedColour}:${MEDIA_LOGO.KEY.SIMILARITY}:${MEDIA_LOGO.KEY.BLEND},`
      : "";
    // format=rgba before the mixer: a source with no alpha channel has nothing
    // for `aa` to scale until one is added.
    steps.push(
      `[${index}:v]scale=${logo.pixelWidth}:-1,${key}format=rgba,colorchannelmixer=aa=${
        logo.opacity ?? MEDIA_LOGO.DEFAULT_OPACITY
      }[mark]`,
    );
    steps.push(`${label}[mark]overlay=${place.x}:${place.y}[marked]`);
    label = "[marked]";
  }

  let audioOutLabel: string | undefined;
  if (audioFilters && audioFilters.length > 0) {
    audioOutLabel = "[aout]";
    steps.push(`[0:a]${audioFilters.join(",")}${audioOutLabel}`);
  }

  if (steps.length === 0) return { graph: null, outLabel: label };
  return { graph: steps.join(";"), outLabel: label, audioOutLabel };
}

/** Outline every detected region on a still, so what will be covered can be seen before it is. */
export function proofFilter(regions: HIDE_REGION[], frameWidth: number): string {
  const thickness = Math.max(2, Math.round(frameWidth * 0.004));
  return regions
    .map(
      (r) =>
        `drawbox=x=${r.x}:y=${r.y}:w=${r.width}:h=${r.height}:color=red@0.9:t=${thickness}`,
    )
    .join(",");
}

export const HIDE_DEFAULTS = {
  style: MEDIA_HIDE.DEFAULT_STYLE,
  strength: MEDIA_HIDE.DEFAULT_STRENGTH,
};

/**
 * The same covers as a plain `-vf` chain, with no input/output labels.
 *
 * `buildFilterGraph` above labels its inputs because it may have a second one
 * (the logo image) and therefore needs `-filter_complex`. `cut` has only the
 * video, so it uses `-vf`, where the first filter's input and the last
 * filter's output are implicit. A `split`/`overlay` pair is still legal there
 * — it is one graph with one input and one output — so the blur fallback
 * works in both forms.
 *
 * Returned WITHOUT a trailing comma. The caller joins it to whatever follows.
 */
export function buildCoverChain(
  covers: COVER_PLAN[],
  /**
   * ffmpeg input index of the replacement image, when any cover uses
   * `replace`. Its absence is what makes this a `-vf`-safe single-input chain;
   * its presence means the caller must build a `-filter_complex` instead.
   */
  imageInputIndex?: number,
): string | undefined {
  if (covers.length === 0) return undefined;
  if (covers.some((cover) => cover.style === "replace") && imageInputIndex === undefined) {
    throw new Error("a replace cover needs an image input index");
  }
  const steps: string[] = [];
  let label = "";

  covers.forEach((cover, i) => {
    const { region } = cover;
    const next = i === covers.length - 1 ? "" : `[hidden${i}]`;
    if (cover.style === "replace") {
      const repKey = cover.replaceKeyColour
        ? `colorkey=${cover.replaceKeyColour}:${MEDIA_LOGO.KEY.SIMILARITY}:${MEDIA_LOGO.KEY.BLEND},`
        : "";
      steps.push(
        `${label}drawbox=x=${region.x}:y=${region.y}:w=${region.width}:h=${region.height}` +
          `:color=${cover.colour ?? "0x000000"}:t=fill:replace=1[backed${i}]`,
      );
      steps.push(
        `[${imageInputIndex}:v]scale=${region.width}:${region.height}` +
          `:force_original_aspect_ratio=decrease,${repKey}format=rgba[rep${i}]`,
      );
      steps.push(
        `[backed${i}][rep${i}]overlay=` +
          `${region.x}+(${region.width}-overlay_w)/2:` +
          `${region.y}+(${region.height}-overlay_h)/2${next}`,
      );
      label = next;
      return;
    }
    if (cover.style === "erase") {
      // Rebuilt from the surrounding pixels. The region is already inside the
      // frame by a pixel (`eraseRegion`), which `delogo` requires.
      steps.push(
        `${label}delogo=x=${region.x}:y=${region.y}:w=${region.width}:h=${region.height}${next}`,
      );
      label = next;
      return;
    }
    if (cover.style === "fill") {
      steps.push(
        `${label}drawbox=x=${region.x}:y=${region.y}:w=${region.width}:h=${region.height}` +
          `:color=${cover.colour}:t=fill:replace=1${next}`,
      );
    } else {
      const crop = `crop=${region.width}:${region.height}:${region.x}:${region.y}`;
      steps.push(`${label}split=2[keep${i}][cut${i}]`);
      steps.push(`[cut${i}]${crop},${patchFilter(cover.style, region, cover.strength)}[cover${i}]`);
      steps.push(`[keep${i}][cover${i}]overlay=${region.x}:${region.y}${next}`);
    }
    label = next;
  });

  return steps.join(";");
}
