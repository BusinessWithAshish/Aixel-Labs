import { rm } from "node:fs/promises";

import { MEDIA_HIDE } from "../constants";
import { buildCoverChain } from "../effects/compose";
import { cornerColour } from "../effects/surround";
import { detectStaticOverlays, normalizeRegion } from "../effects/detect";
import { sampleSurroundColour } from "../effects/surround";
import type {
  COVER_PLAN,
  DETECTED_REGION,
  HIDE_REGION,
  SURROUND_COLOUR,
} from "../effects/types";
import { getMediaDurationSeconds, probeMediaStreams } from "./ffmpeg-cut";
import type { CUT_LOGO_PLAN, CUT_LOGO_REQUEST } from "../types";

/**
 * Work out how to take a burned-in logo out of a source, and return it as a
 * filter chain to run before anything crops.
 *
 * **Why this belongs in `cut` and not in `effects`.** A logo is nailed to one
 * place in the source frame and never moves. The moment a clip has been
 * reframed, that is no longer true: a speaker-following crop slides different
 * parts of the picture through the output, so the same logo lands in different
 * places at different times — and in a wide segment it lands somewhere else
 * again. Covering it after the fact means tracking a moving target. Covering
 * it before the crop means covering a rectangle that never moves. The ordering
 * is the whole trick, and it is why nothing downstream of the first cut needs
 * to know a logo ever existed.
 *
 * Detection needs frames at SOURCE resolution, which for a YouTube source
 * means going back through the signed stream URLs and the proxy. Rather than
 * teach this module about either, the caller passes a `cutProbe` that already
 * knows how — so one short unframed clip is cut with exactly the machinery
 * that cuts every other range, and detection runs on that.
 */
export async function planLogoCover(options: {
  logo: CUT_LOGO_REQUEST;
  /** Cuts an unframed, source-resolution clip of the given range to `outputPath`. */
  cutProbe: (startSeconds: number, endSeconds: number, outputPath: string) => Promise<void>;
  probePath: string;
  /** Where in the source to look. Normally the first requested clip range. */
  probeStartSeconds: number;
  sourceDurationSeconds: number;
  /** Which ffmpeg input the replacement image will be: 1 for a file source, 2 for stream-direct. */
  imageInputIndex: number;
}): Promise<CUT_LOGO_PLAN> {
  const { logo, cutProbe, probePath, probeStartSeconds, sourceDurationSeconds, imageInputIndex } =
    options;
  const style = logo.style ?? MEDIA_HIDE.DEFAULT_STYLE;
  const strength = logo.strength ?? MEDIA_HIDE.DEFAULT_STRENGTH;
  const replaceKeyColour =
    style === "replace" && logo.replaceWith && logo.keyColor === "auto"
      ? await cornerColour(logo.replaceWith)
      : logo.keyColor;

  const probeLength = Math.min(
    MEDIA_HIDE.PROBE_SECONDS,
    Math.max(1, sourceDurationSeconds - probeStartSeconds),
  );

  try {
    await cutProbe(probeStartSeconds, probeStartSeconds + probeLength, probePath);
    const probe = await probeMediaStreams(probePath);
    if (!probe.hasVideo || !probe.width || !probe.height) {
      return { regions: [], covers: [], note: "probe had no video" };
    }
    const duration = await getMediaDurationSeconds(probePath);

    let regions: HIDE_REGION[];
    let detected: DETECTED_REGION[] | undefined;

    if (logo.regions === "auto") {
      detected = await detectStaticOverlays(probePath, probe.width, probe.height, duration);
      regions = detected
        .filter((r) => r.confidence >= MEDIA_HIDE.DETECT.MIN_CONFIDENCE)
        .map(({ x, y, width, height }) => ({ x, y, width, height }));
      // `replace` pastes OUR mark into the region, so it is held to a much
      // higher bar than erasing: a weak candidate becomes our logo in a random
      // place on someone else's video, and a source with no mark at all must
      // yield no replacement. Best-scoring only, above MIN_CONFIDENCE_ON_REPLACE.
      if (style === "replace") {
        regions = detected
          .filter((r) => r.confidence >= MEDIA_HIDE.DETECT.MIN_CONFIDENCE_ON_REPLACE)
          .slice(0, MEDIA_HIDE.DETECT.MAX_REGIONS_ON_REPLACE)
          .map(({ x, y, width, height }) => ({ x, y, width, height }));
      }
    } else {
      regions = logo.regions.map((r) => normalizeRegion(r, probe.width!, probe.height!));
    }

    if (regions.length === 0) {
      return { regions: [], covers: [], detected, note: "no logo found in the probe" };
    }

    const covers: COVER_PLAN[] = [];
    for (const region of regions) {
      if (style === "replace" || style === "fill") {
        // Both need the surrounding colour: `fill` paints with it, and
        // `replace` uses it as the backing the mark sits on so nothing of the
        // original shows around the edges.
        let surround: SURROUND_COLOUR | undefined;
        try {
          surround = await sampleSurroundColour(probePath, region, probe.width, probe.height, duration);
        } catch {
          surround = undefined;
        }
        if (style === "replace") {
          covers.push({
            region,
            style: "replace",
            replaceWith: logo.replaceWith,
            replaceKeyColour,
            colour: surround?.hex ?? "0x000000",
            strength,
            surround,
          });
          continue;
        }
        covers.push(
          surround?.uniform
            ? { region, style: "fill", colour: surround.hex, strength, surround }
            : { region, style: "blur", strength, surround, fellBackFrom: "fill" },
        );
        continue;
      }
      {
        covers.push({ region, style, strength });
        continue;
      }
    }

    return {
      regions,
      covers: covers.map(({ region, style: used, surround, fellBackFrom }) => ({
        region,
        style: used,
        surround,
        fellBackFrom,
      })),
      detected,
      filter: buildCoverChain(covers, style === "replace" ? imageInputIndex : undefined),
      replaceWith: style === "replace" ? logo.replaceWith : undefined,
    };
  } finally {
    await rm(probePath, { force: true });
  }
}
