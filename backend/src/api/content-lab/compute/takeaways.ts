import { CONTENT_LAB_FORMAT_LABELS, CONTENT_LAB_OUTLIER_MULTIPLE } from "../constants";
import type {
  CONTENT_LAB_EXPLORE_RESPONSE,
  CONTENT_LAB_POST,
  CONTENT_LAB_TAKEAWAY,
  ContentLabFormat,
  ContentLabPlatform,
} from "../types";
import { median } from "./baseline";
import { formatMultiple, signalCopy, textNoun } from "./reasons";
import { CONTENT_LAB_SIGNAL_KEYS } from "./signals";

type ScoredPost = Pick<CONTENT_LAB_POST, "platform" | "format" | "multiple" | "signals">;

const PLATFORM_LABEL: Record<ContentLabPlatform, string> = { youtube: "YouTube", instagram: "Instagram" };
const MIN_WINNERS = 3;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A multiple in words, ready for "… their creator usually gets":
 * "about 6 times the views", "about the same views as", "fewer likes than".
 */
export function timesPhrase(multiple: number, format: ContentLabFormat): string {
  const noun = format === "post" || format === "carousel" ? "likes" : "views";
  if (multiple >= 1.15) return `about ${formatMultiple(Math.round(multiple * 10) / 10)} times the ${noun}`;
  if (multiple >= 0.85) return `about the same ${noun} as`;
  return `fewer ${noun} than`;
}

/** Highest multiple first; posts without one last. */
export function sortByMultiple<T extends Pick<CONTENT_LAB_POST, "multiple">>(posts: readonly T[]): T[] {
  return [...posts].sort((a, b) => (b.multiple ?? -1) - (a.multiple ?? -1));
}

/**
 * Outliers (multiple ≥ CONTENT_LAB_OUTLIER_MULTIPLE); when there are fewer than
 * `min`, the top `min` posts by multiple stand in for them.
 */
export function pickWinners<T extends Pick<CONTENT_LAB_POST, "multiple">>(posts: readonly T[], min = MIN_WINNERS): T[] {
  const scored = sortByMultiple(posts.filter((p) => p.multiple !== null));
  const outliers = scored.filter((p) => p.multiple! >= CONTENT_LAB_OUTLIER_MULTIPLE);
  return outliers.length >= min ? outliers : scored.slice(0, min);
}

/** Format with the highest median multiple, per platform. */
export function bestFormatByPlatform(posts: readonly ScoredPost[]): Partial<Record<ContentLabPlatform, { format: ContentLabFormat; median: number; runnerUp: { format: ContentLabFormat; median: number } | null }>> {
  const groups = new Map<string, number[]>();
  for (const p of posts) {
    if (p.multiple === null) continue;
    const key = `${p.platform}:${p.format}`;
    groups.set(key, [...(groups.get(key) ?? []), p.multiple]);
  }
  const out: ReturnType<typeof bestFormatByPlatform> = {};
  const ranked = [...groups.entries()]
    .map(([key, values]) => {
      const [platform, format] = key.split(":") as [ContentLabPlatform, ContentLabFormat];
      return { platform, format, median: median(values)! };
    })
    .sort((a, b) => b.median - a.median);
  for (const row of ranked) {
    const current = out[row.platform];
    if (!current) out[row.platform] = { format: row.format, median: row.median, runnerUp: null };
    else current.runnerUp ??= { format: row.format, median: row.median };
  }
  return out;
}

export function computeNicheStats(posts: readonly ScoredPost[]): CONTENT_LAB_EXPLORE_RESPONSE["niche"] {
  const multiples = posts.flatMap((p) => (p.multiple === null ? [] : [p.multiple]));
  const best = bestFormatByPlatform(posts);
  const bestFormat: CONTENT_LAB_EXPLORE_RESPONSE["niche"]["bestFormat"] = {};
  for (const [platform, row] of Object.entries(best)) bestFormat[platform as ContentLabPlatform] = row.format;
  const med = median(multiples);
  return {
    postCount: posts.length,
    outlierCount: multiples.filter((m) => m >= CONTENT_LAB_OUTLIER_MULTIPLE).length,
    medianMultiple: med === null ? null : Math.round(med * 10) / 10,
    bestFormat,
  };
}

/**
 * Three plain-English takeaways: what most winners' text shares, the best
 * format per platform, and a gap (a signal winners use that the rest skip).
 */
export function computeTakeaways(posts: readonly ScoredPost[]): CONTENT_LAB_TAKEAWAY[] {
  const winners = pickWinners(posts);
  if (winners.length === 0) return [];
  const rest = posts.filter((p) => !winners.includes(p));
  const platforms = [...new Set(posts.map((p) => p.platform))];
  const noun = platforms.length === 1 ? textNoun(platforms[0]!) : "title";
  const takeaways: CONTENT_LAB_TAKEAWAY[] = [];
  const n = winners.length;
  const count = (list: readonly ScoredPost[], key: (typeof CONTENT_LAB_SIGNAL_KEYS)[number]) =>
    list.filter((p) => p.signals[key]).length;

  // 1. The signal most top posts share.
  const common = CONTENT_LAB_SIGNAL_KEYS.map((key) => ({ key, hits: count(winners, key) }))
    .sort((a, b) => b.hits - a.hits)[0]!;
  const usedCommon = common.hits >= Math.max(2, Math.ceil(n / 2));
  if (usedCommon) {
    takeaways.push({
      headline: `${common.hits} of ${n} top posts`,
      detail: `${common.hits} of the ${n} top posts ${signalCopy(common.key, noun).winners}.`,
    });
  }

  // 2. Best format per platform.
  const best = bestFormatByPlatform(posts);
  const formatLines = platforms.flatMap((platform) => {
    const row = best[platform];
    if (!row) return [];
    const label = CONTENT_LAB_FORMAT_LABELS[row.format];
    const lower = (f: ContentLabFormat) => `${CONTENT_LAB_FORMAT_LABELS[f].toLowerCase()}s`;
    const vs = row.runnerUp
      ? ` ${capitalize(lower(row.runnerUp.format))} got ${timesPhrase(row.runnerUp.median, row.runnerUp.format)} their creator usually gets.`
      : "";
    return [{
      label: `${label}s on ${PLATFORM_LABEL[platform]}`,
      detail: `On ${PLATFORM_LABEL[platform]}, ${lower(row.format)} do best: they got ${timesPhrase(row.median, row.format)} their creator usually gets.${vs}`,
    }];
  });
  if (formatLines.length > 0) {
    takeaways.push({
      headline: `${formatLines.map((l) => l.label).join(", ")} do best`,
      detail: formatLines.map((l) => l.detail).join(" "),
    });
  }

  // 3. Something to try: common among top posts, rare in the rest.
  if (rest.length > 0) {
    const gap = CONTENT_LAB_SIGNAL_KEYS.filter((key) => !usedCommon || key !== common.key)
      .map((key) => {
        const w = count(winners, key);
        const r = count(rest, key);
        return { key, w, r, lift: w / n - r / rest.length };
      })
      .sort((a, b) => b.lift - a.lift)[0];
    if (gap && gap.w >= 2 && gap.lift >= 0.25) {
      takeaways.push({
        headline: `Try: ${signalCopy(gap.key, noun).label.toLowerCase()}`,
        detail: `${gap.w} of the ${n} top posts ${signalCopy(gap.key, noun).winners}, but only ${gap.r} of the other ${rest.length} posts do.`,
      });
    }
  }

  // Fallback so the page always has something: how many posts took off.
  if (takeaways.length < 3) {
    const stats = computeNicheStats(posts);
    takeaways.push({
      headline: `${stats.outlierCount} of ${stats.postCount} took off`,
      detail: `${stats.outlierCount} of ${stats.postCount} posts got at least ${CONTENT_LAB_OUTLIER_MULTIPLE} times the views their creator usually gets${stats.medianMultiple !== null ? `. A typical post here got ${timesPhrase(stats.medianMultiple, "video")} its creator usually gets` : ""}.`,
    });
  }
  return takeaways.slice(0, 3);
}
