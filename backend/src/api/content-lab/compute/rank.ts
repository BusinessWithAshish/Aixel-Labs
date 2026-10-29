import { CONTENT_LAB_MAX_AGE_DAYS, CONTENT_LAB_RANK as R } from "../constants";
import type { CONTENT_LAB_POST, ContentLabPlatform } from "../types";
import { CONTENT_LAB_FORMAT_FAMILY } from "./baseline";

const DAY_MS = 86_400_000;

export type ContentLabRankInput = Pick<
  CONTENT_LAB_POST,
  "platform" | "format" | "views" | "likes" | "multiple" | "publishedAt"
>;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Days since `publishedAt`; null when undated. */
export function ageDays(publishedAt: string | null, now: number = Date.now()): number | null {
  const t = publishedAt ? Date.parse(publishedAt) : NaN;
  return Number.isFinite(t) ? Math.max(0, (now - t) / DAY_MS) : null;
}

/** Too old for explore (it shows what works now); undated posts stay. */
export function isTooOld(publishedAt: string | null, now: number = Date.now()): boolean {
  const age = ageDays(publishedAt, now);
  return age !== null && age > CONTENT_LAB_MAX_AGE_DAYS;
}

/** Views, or likes × `likesToViews` for photo posts (their views are hidden). */
export function volumeOf(post: Pick<ContentLabRankInput, "format" | "views" | "likes">): number | null {
  if (CONTENT_LAB_FORMAT_FAMILY[post.format] === "photo") {
    return post.likes === null ? null : post.likes * R.likesToViews;
  }
  return post.views;
}

/** Clears the floor: enough views (plays), or likes for photo posts. Unknown counts don't. */
export function meetsFloor(post: Pick<ContentLabRankInput, "format" | "views" | "likes">): boolean {
  if (CONTENT_LAB_FORMAT_FAMILY[post.format] === "photo") return (post.likes ?? 0) >= R.minLikes;
  return (post.views ?? 0) >= R.minViews;
}

/**
 * 0-1: how far the post beat its creator's usual (log2 between
 * `multipleRange`), its volume (log10 between `volumeRange`) and how recent
 * it is (halves every `recencyHalfLifeDays`), weighted by `weights`.
 */
export function rankScore(post: ContentLabRankInput, now: number = Date.now()): number {
  const [mLo, mHi] = R.multipleRange;
  const m = Math.max(post.multiple ?? 1, 1e-3);
  const multipleScore = clamp01(Math.log2(m / mLo) / Math.log2(mHi / mLo));

  const [vLo, vHi] = R.volumeRange;
  const volume = volumeOf(post);
  const volumeScore = volume && volume > 0 ? clamp01(Math.log10(volume / vLo) / Math.log10(vHi / vLo)) : 0;

  const age = ageDays(post.publishedAt, now) ?? R.undatedAgeDays;
  const recencyScore = Math.pow(0.5, age / R.recencyHalfLifeDays);

  return R.weights.multiple * multipleScore + R.weights.volume * volumeScore + R.weights.recency * recencyScore;
}

/** Posts that clear the floor first, each group by score, highest first. */
export function rankPosts<T extends ContentLabRankInput>(posts: readonly T[], now: number = Date.now()): T[] {
  const scored = posts.map((post) => ({ post, floor: meetsFloor(post), score: rankScore(post, now) }));
  scored.sort((a, b) => Number(b.floor) - Number(a.floor) || b.score - a.score);
  return scored.map((s) => s.post);
}

/**
 * The top `limit` of `ranked` (already in rank order), keeping at least
 * `minPlatformShare` of the page for each platform that has the posts, so
 * one platform's bigger numbers can't push the other off the page. Only
 * posts that clear the floor get a reserved place. Rank order is kept.
 */
export function takeWithPlatformShare<T extends ContentLabRankInput>(ranked: readonly T[], limit: number): T[] {
  const platforms = [...new Set(ranked.map((p) => p.platform))];
  if (platforms.length < 2) return ranked.slice(0, limit);
  const reserve = Math.floor(limit * R.minPlatformShare);
  const picked = new Set<T>();
  for (const platform of platforms) {
    for (const post of ranked.filter((p) => p.platform === platform && meetsFloor(p)).slice(0, reserve)) picked.add(post);
  }
  for (const post of ranked) {
    if (picked.size >= limit) break;
    picked.add(post);
  }
  return ranked.filter((p) => picked.has(p)).slice(0, limit);
}
