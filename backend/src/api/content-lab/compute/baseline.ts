import { CONTENT_LAB_LIMITS } from "../constants";
import type { ContentLabFormat } from "../types";

/** Posts are only compared with the same creator's posts of the same family. */
export type ContentLabFormatFamily = "long" | "short" | "photo";

export const CONTENT_LAB_FORMAT_FAMILY: Record<ContentLabFormat, ContentLabFormatFamily> = {
  video: "long",
  short: "short",
  reel: "short",
  carousel: "photo",
  post: "photo",
};

export type ContentLabMetricInput = {
  format: ContentLabFormat;
  views: number | null;
  likes: number | null;
};

/** What a post is measured by: views, or likes for photo posts (Instagram hides their views). */
export function postMetric(post: ContentLabMetricInput): number | null {
  const value = CONTENT_LAB_FORMAT_FAMILY[post.format] === "photo" ? post.likes : post.views;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Median metric per format family; null where fewer than `minBaselineUploads` posts carry the metric. */
export function baselineByFamily(
  posts: readonly ContentLabMetricInput[],
  minUploads: number = CONTENT_LAB_LIMITS.minBaselineUploads,
): Record<ContentLabFormatFamily, number | null> {
  const values: Record<ContentLabFormatFamily, number[]> = { long: [], short: [], photo: [] };
  for (const post of posts) {
    const value = postMetric(post);
    if (value !== null) values[CONTENT_LAB_FORMAT_FAMILY[post.format]].push(value);
  }
  const pick = (list: number[]) => (list.length >= minUploads ? median(list) : null);
  return { long: pick(values.long), short: pick(values.short), photo: pick(values.photo) };
}

/** value ÷ usual, one decimal; null when either side is missing or the usual is 0. */
export function computeMultiple(value: number | null, usual: number | null): number | null {
  if (value === null || usual === null || usual <= 0) return null;
  return Math.round((value / usual) * 10) / 10;
}

/** usualViews + multiple for one post against its creator's baselines. */
export function scorePost(
  post: ContentLabMetricInput,
  baselines: Record<ContentLabFormatFamily, number | null>,
): { usualViews: number | null; multiple: number | null } {
  const usual = baselines[CONTENT_LAB_FORMAT_FAMILY[post.format]];
  const usualViews = usual === null ? null : Math.round(usual);
  return { usualViews, multiple: computeMultiple(postMetric(post), usual) };
}
