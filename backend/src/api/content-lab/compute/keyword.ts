import { CONTENT_LAB_KEYWORD as K } from "../constants";
import type {
  CONTENT_LAB_HASHTAG,
  CONTENT_LAB_KEYWORD_PLATFORM,
  CONTENT_LAB_KEYWORD_RESPONSE,
  CONTENT_LAB_KEYWORD_TREND,
  ContentLabKeywordLabel,
} from "../types";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Weekly 0-100 interest → now / change / direction; null when too few weeks
 * have any searches to say anything (Trends returns all zeros for those).
 */
export function summarizeTrend(weekly: readonly number[], rising: readonly string[]): CONTENT_LAB_KEYWORD_TREND | null {
  if (weekly.filter((v) => v > 0).length < K.minWeeks) return null;
  const recent = weekly.slice(-K.recentWeeks);
  const before = weekly.slice(-(K.recentWeeks + K.previousWeeks), -K.recentWeeks);
  const now = Math.round(mean(recent));
  const base = mean(before);
  const change = base > 0 ? Math.round(((mean(recent) - base) / base) * 100) : 0;
  const direction = change > K.steadyPercent ? "rising" : change < -K.steadyPercent ? "falling" : "steady";
  return { weekly: [...weekly], now, change, direction, rising: rising.slice(0, K.rising) };
}

/** "Lots of people search this on YouTube, and interest is up 23% in the last month." */
function keywordSummary(searchCount: number, trend: CONTENT_LAB_KEYWORD_TREND | null): string {
  const demand =
    searchCount >= K.demandSearches * 0.8
      ? "Lots of people search this on YouTube"
      : searchCount >= 3
        ? "Some people search this on YouTube"
        : "Few people search exactly this on YouTube";
  if (!trend) return `${demand}.`;
  const weeks = `the last ${K.recentWeeks} weeks`;
  if (trend.direction === "rising") return `${demand}, and interest is up ${trend.change}% in ${weeks}.`;
  if (trend.direction === "falling") return `${demand}, but interest is down ${Math.abs(trend.change)}% in ${weeks}.`;
  return `${demand}, and interest is steady.`;
}

const labelOf = (score: number): ContentLabKeywordLabel =>
  score >= K.labels.strong ? "strong" : score >= K.labels.okay ? "okay" : "weak";

/**
 * YouTube, 0-100 from demand (how many searches YouTube completes it to), how
 * busy it is now against its busiest week, and momentum; demand alone (capped
 * at `demandOnlyMax`) when there is no trend.
 */
export function scoreKeyword(searchCount: number, trend: CONTENT_LAB_KEYWORD_TREND | null): CONTENT_LAB_KEYWORD_PLATFORM {
  const demand = clamp01(searchCount / K.demandSearches);
  const score = trend
    ? Math.round(
        100 *
          (K.weights.demand * demand +
            K.weights.now * clamp01(trend.now / 100) +
            K.weights.momentum * clamp01(0.5 + trend.change / (2 * K.momentumRange))),
      )
    : Math.round(K.demandOnlyMax * demand);
  return { platform: "youtube", score, label: labelOf(score), summary: keywordSummary(searchCount, trend) };
}

/** "protein breakfast" → "proteinbreakfast", the way Instagram writes it as a hashtag. */
export const hashtagOf = (query: string) => query.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "");

/** 253695 → "254K". */
const compact = (n: number) =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);

/**
 * The hashtags to show for a topic: its own one first when Instagram has it,
 * then the most-used ones (the list comes most-used first).
 */
export function topicHashtags(query: string, hashtags: readonly CONTENT_LAB_HASHTAG[]): CONTENT_LAB_HASHTAG[] {
  const own = hashtagOf(query);
  const exact = hashtags.find((tag) => tag.name === own);
  return (exact ? [exact, ...hashtags.filter((tag) => tag !== exact)] : [...hashtags]).slice(0, K.instagram.hashtags);
}

/**
 * Instagram, 0-100 from how many posts use the topic's hashtag (or the most-used
 * one starting with it) on a log scale, and how many related hashtags are busy.
 * `hashtags` as `topicHashtags` orders them.
 */
export function scoreInstagramTopic(query: string, hashtags: readonly CONTENT_LAB_HASHTAG[]): CONTENT_LAB_KEYWORD_PLATFORM {
  const { weights, minPosts, maxPosts, busyPosts, busyTags } = K.instagram;
  const own = hashtagOf(query);
  const main = hashtags.find((tag) => tag.name.startsWith(own)) ?? null;
  const posts = main?.posts ?? 0;
  const depth = posts > 0 ? clamp01(Math.log10(posts / minPosts) / Math.log10(maxPosts / minPosts)) : 0;
  const breadth = clamp01(hashtags.filter((tag) => (tag.posts ?? 0) >= busyPosts).length / busyTags);
  const score = Math.round(100 * (weights.depth * depth + weights.breadth * breadth));
  const summary = !main
    ? "No Instagram hashtag matches this yet."
    : posts >= 100_000
      ? `#${main.name} is on ${compact(posts)} Instagram posts.`
      : posts >= busyPosts
        ? `#${main.name} is on ${compact(posts)} Instagram posts: a smaller niche.`
        : `Only ${posts} Instagram posts use #${main.name}.`;
  return { platform: "instagram", score, label: labelOf(score), summary };
}

const LABEL_WORD: Record<ContentLabKeywordLabel, string> = { strong: "Strong", okay: "Decent", weak: "Weak" };
const PLATFORM_NAME: Record<CONTENT_LAB_KEYWORD_PLATFORM["platform"], string> = { youtube: "YouTube", instagram: "Instagram" };

/** All the platforms asked for together: the average score, and "Strong on YouTube, weak on Instagram." */
export function combineKeyword(
  platforms: readonly CONTENT_LAB_KEYWORD_PLATFORM[],
): Pick<CONTENT_LAB_KEYWORD_RESPONSE, "score" | "label" | "summary"> {
  if (platforms.length === 1) {
    const [only] = platforms;
    return { score: only.score, label: only.label, summary: only.summary };
  }
  const score = Math.round(platforms.reduce((sum, p) => sum + p.score, 0) / platforms.length);
  const sameLabel = platforms.every((p) => p.label === platforms[0].label);
  const summary = sameLabel
    ? `${LABEL_WORD[platforms[0].label]} on ${platforms.map((p) => PLATFORM_NAME[p.platform]).join(" and ")}.`
    : `${platforms.map((p, i) => `${i ? LABEL_WORD[p.label].toLowerCase() : LABEL_WORD[p.label]} on ${PLATFORM_NAME[p.platform]}`).join(", ")}.`;
  return { score, label: labelOf(score), summary };
}
