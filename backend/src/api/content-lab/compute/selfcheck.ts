/**
 * Self-check for Content Lab compute (no network).
 * Run: `pnpm --filter @aixellabs/backend exec tsx src/api/content-lab/compute/selfcheck.ts`
 */
import assert from "node:assert/strict";

import type { CONTENT_LAB_POST, ContentLabFormat, ContentLabPlatform } from "../types";
import {
  baselineByFamily,
  captionCta,
  computeDraftCheck,
  computeMultiple,
  computeNicheStats,
  computeReasons,
  computeTakeaways,
  computeTextSignals,
  computeWhyItWorked,
  firstLine,
  isTooOld,
  isWorthShowing,
  matchesTopic,
  median,
  meetsFloor,
  pickWinners,
  postMetric,
  rankPosts,
  rankScore,
  combineKeyword,
  hashtagOf,
  scoreInstagramTopic,
  scoreKeyword,
  summarizeTrend,
  topicHashtags,
  relativeTimeToIso,
  scorePost,
  takeWithPlatformShare,
  timesPhrase,
  topicWords,
  volumeOf,
} from "./index";
import { decodeCursor, encodeCursor, exploreKey, hashId } from "../cursor";
import { interleaveBy } from "../helpers";

// ─── signals ────────────────────────────────────────────────────────────────
const s = computeTextSignals;
assert.equal(s("7 ways to eat more protein").isListicle, true);
assert.equal(s("Top 10 protein breakfasts").isListicle, true);
assert.equal(s("3 breakfasts under ₹50").isListicle, true);
assert.equal(s("5 high protein breakfasts").isListicle, true);
assert.equal(s("5 High-Protein Husband Approved Breakfasts").isListicle, true);
assert.equal(s("4 Simple High Protein Breakfasts (for Building Muscle)").isListicle, true);
assert.equal(s("I ate eggs for 30 days").isListicle, false);
assert.equal(s("I ate eggs for 30 days").isChallenge, true);
assert.equal(s("I tested every protein bar").isChallenge, true);
assert.equal(s("3 breakfasts under ₹50").hasPrice, true);
assert.equal(s("Protein breakfast under 50").hasPrice, true);
assert.equal(s("Breakfast in under 10 minutes").hasPrice, false);
assert.equal(s("High protein meal for rs 99").hasPrice, true);
assert.equal(s("sirf 100 rupaye mein protein").hasPrice, true);
assert.equal(s("$5 meal prep").hasPrice, true);
assert.equal(s("Best breakfast of 2026").hasYear, true);
assert.equal(s("₹2000 grocery haul").hasYear, false);
assert.equal(s("2000 calories a day").hasYear, false);
assert.equal(s("Is oats actually healthy").hasQuestion, true);
assert.equal(s("Protein kaise badhaye").hasQuestion, true);
assert.equal(s("Why I quit whey?").hasQuestion, true);
assert.equal(s("POV: you finally hit your protein").hasPov, true);
assert.equal(s("Poverty line meals").hasPov, false);
assert.equal(s("प्रोटीन नाश्ता ५ मिनट में").hasNumber, true);
assert.equal(s("प्रोटीन नाश्ता").length, [..."प्रोटीन नाश्ता"].length);
assert.deepEqual(
  Object.values(s("My breakfast routine")).filter((v) => v === true),
  [],
);
assert.equal(firstLine("\n  Hook line here  \nmore text"), "Hook line here");
assert.equal(firstLine(null), "");

// ─── baseline ───────────────────────────────────────────────────────────────
assert.equal(median([]), null);
assert.equal(median([3, 1, 2]), 2);
assert.equal(median([4, 1, 3, 2]), 2.5);
assert.equal(postMetric({ format: "post", views: null, likes: 40 }), 40);
assert.equal(postMetric({ format: "reel", views: 900, likes: 40 }), 900);
const uploads = (format: ContentLabFormat, values: number[]) => values.map((views) => ({ format, views, likes: views / 10 }));
const base = baselineByFamily([
  ...uploads("video", [100, 200, 300, 400, 500]),
  ...uploads("short", [1000, 2000, 3000, 4000]), // 4 < minBaselineUploads (5)
  ...uploads("carousel", [10, 20]),
  ...uploads("post", [30, 40, 50]),
]);
assert.equal(base.long, 300);
assert.equal(base.short, null);
assert.equal(base.photo, 3); // likes: 1,2,3,4,5
assert.equal(computeMultiple(4200, 300), 14);
assert.equal(computeMultiple(100, 300), 0.3);
assert.equal(computeMultiple(100, 0), null);
assert.equal(computeMultiple(null, 10), null);
assert.deepEqual(scorePost({ format: "video", views: 900, likes: 1 }, base), { usualViews: 300, multiple: 3 });
assert.deepEqual(scorePost({ format: "short", views: 900, likes: 1 }, base), { usualViews: null, multiple: null });

// ─── reasons ────────────────────────────────────────────────────────────────
const reasons = computeReasons({
  platform: "instagram",
  format: "reel",
  title: "3 breakfasts under ₹50",
  multiple: 14.2,
  signals: s("3 breakfasts under ₹50"),
});
assert.deepEqual(reasons, ["14 times their usual views", "Reel", "Mentions a ₹ price in the first line", "A list, like \"7 ways\""]);
assert.deepEqual(
  computeReasons({ platform: "youtube", format: "video", title: "Day 7", multiple: 1.2, signals: s("Day 7") }),
  ["Long video", "Has a number in the title"],
);
assert.equal(
  computeReasons({ platform: "instagram", format: "carousel", title: "hi", multiple: 2.5, signals: s("hi") })[0],
  "2.5 times their usual likes",
);
const why = computeWhyItWorked({
  platform: "youtube",
  format: "video",
  title: "7 ways to eat more protein",
  multiple: 5.5,
  signals: s("7 ways to eat more protein"),
  hookType: "question",
  cta: { text: "comment below", atPercent: 88 },
  slideCount: 0,
});
assert.equal(why.length, 3);
assert.equal(why[0], "Got 6 times more views than this creator usually gets");
assert.match(why[1]!, /question/);
assert.ok(computeWhyItWorked({ platform: "instagram", format: "post", title: "hi", multiple: null, signals: s("hi"), hookType: null, cta: null, slideCount: 0 }).length === 1);

// ─── cta ────────────────────────────────────────────────────────────────────
assert.equal(captionCta("3 breakfasts\nRecipe below.\nComment PROTEIN and I'll DM you the plan"), "Comment PROTEIN and I'll DM you the plan");
assert.equal(captionCta("Save this for your next grocery run! #protein"), "Save this for your next grocery run!");
assert.equal(captionCta("Just a nice breakfast"), null);
assert.equal(captionCta(null), null);

// ─── time ───────────────────────────────────────────────────────────────────
const now = new Date("2026-10-27T00:00:00.000Z");
assert.equal(relativeTimeToIso("3 days ago", now), "2026-10-24T00:00:00.000Z");
assert.equal(relativeTimeToIso("Streamed 1 week ago", now), "2026-10-20T00:00:00.000Z");
assert.equal(relativeTimeToIso("Premiered on 3 Oct", now), null);
assert.equal(relativeTimeToIso(null, now), null);

// ─── takeaways + niche ──────────────────────────────────────────────────────
type P = Pick<CONTENT_LAB_POST, "platform" | "format" | "multiple" | "signals">;
const post = (platform: ContentLabPlatform, format: ContentLabFormat, multiple: number | null, title: string): P => ({
  platform,
  format,
  multiple,
  signals: s(title),
});
const niche: P[] = [
  post("instagram", "reel", 14, "3 breakfasts under ₹50"),
  post("instagram", "reel", 6, "5 high protein snacks"),
  post("instagram", "reel", 4, "POV: 7 ways to hit 100g"),
  post("instagram", "carousel", 2.5, "My breakfast"),
  post("instagram", "carousel", 0.8, "Morning vibes"),
  post("instagram", "post", 0.5, "Sunday"),
  post("youtube", "short", 3, "Top 10 protein foods"),
  post("youtube", "video", 1.1, "What I eat in a day"),
  post("youtube", "video", 0.9, "Breakfast vlog"),
  post("youtube", "video", null, "No baseline"),
];
const winners = pickWinners(niche);
assert.equal(winners.length, 5);
assert.equal(winners[0]!.multiple, 14);
assert.equal(pickWinners([post("youtube", "video", 1, "a"), post("youtube", "video", 0.5, "b")]).length, 2);
assert.equal(pickWinners([post("youtube", "video", null, "a")]).length, 0);

const stats = computeNicheStats(niche);
assert.equal(stats.postCount, 10);
assert.equal(stats.outlierCount, 5);
assert.equal(stats.medianMultiple, 2.5);
assert.deepEqual(stats.bestFormat, { instagram: "reel", youtube: "short" });

const takeaways = computeTakeaways(niche);
assert.equal(takeaways.length, 3);
assert.equal(takeaways[0]!.headline, "4 of 5 top posts");
assert.equal(takeaways[0]!.detail, "4 of the 5 top posts put a number in the title.");
assert.match(takeaways[1]!.headline, /Reels on Instagram/);
assert.match(takeaways[1]!.headline, /Shorts on YouTube/);
assert.match(takeaways[1]!.detail, /^On Instagram, reels do best: they got about 6 times the views their creator usually gets\. Carousels got about 1\.7 times the likes/);
assert.equal(takeaways[2]!.headline, "Try: a list");
assert.deepEqual(computeTakeaways([]), []);
// No jargon reaches the UI.
const jargon = /\b(multiple|median|baseline|outlier|winners?)\b|\dx\b/i;
for (const t of takeaways) assert.doesNotMatch(`${t.headline} ${t.detail}`, jargon);
for (const r of [...reasons, ...why]) assert.doesNotMatch(r, jargon);
assert.equal(timesPhrase(1, "reel"), "about the same views as");
assert.equal(timesPhrase(0.4, "post"), "fewer likes than");

// ─── check ──────────────────────────────────────────────────────────────────
const strong = computeDraftCheck("5 protein breakfasts under ₹50", "instagram", winners);
const weak = computeDraftCheck("My protein breakfast routine that I really love so much every day", "instagram", winners);
assert.ok(strong.score > weak.score, `${strong.score} should beat ${weak.score}`);
assert.ok(strong.score >= 0 && strong.score <= 100 && weak.score >= 0);
const numberCheck = strong.checks.find((c) => c.label === "A number")!;
assert.equal(numberCheck.passed, true);
assert.equal(numberCheck.detail, "4 of the 5 top posts put a number in the first line. Yours does too.");
for (const c of [...strong.checks, ...weak.checks]) assert.doesNotMatch(c.detail, jargon);
assert.equal(weak.checks.find((c) => c.label === "A number")!.passed, false);
assert.equal(weak.checks.at(-1)!.label, "Length");
assert.deepEqual(computeDraftCheck("x", "youtube", []), { score: 0, checks: [] });

// ─── helpers (pure parts) ───────────────────────────────────────────────────
assert.deepEqual(
  interleaveBy(["p1", "p2", "p3", "r1", "r2"], (x) => x[0]!),
  ["p1", "r1", "p2", "r2", "p3"],
);
assert.deepEqual(interleaveBy([], (x: string) => x), []);

// ─── rank ───────────────────────────────────────────────────────────────────
const at = Date.parse("2026-10-28T00:00:00.000Z");
const daysAgo = (d: number) => new Date(at - d * 86_400_000).toISOString();
type R = Parameters<typeof rankScore>[0] & { id: string; platform: ContentLabPlatform };
const r = (id: string, platform: ContentLabPlatform, format: ContentLabFormat, views: number | null, likes: number | null, multiple: number | null, age: number | null): R =>
  ({ id, platform, format, views, likes, multiple, publishedAt: age === null ? null : daysAgo(age) });
const bigRecent = r("big", "youtube", "video", 2_000_000, null, 4, 10);
const tinyOutlier = r("tiny", "youtube", "video", 300, null, 3, 5);
const oldHit = r("old", "youtube", "video", 2_000_000, null, 4, 300);
const smallBeat = r("small", "youtube", "short", 20_000, null, 6, 10);
assert.ok(rankScore(bigRecent, at) > rankScore(smallBeat, at));
assert.ok(rankScore(bigRecent, at) > rankScore(oldHit, at));
assert.equal(meetsFloor(tinyOutlier), false);
assert.equal(meetsFloor(r("photo", "instagram", "carousel", null, 150, 2, 3)), true);
assert.equal(volumeOf(r("photo", "instagram", "post", null, 100, 2, 3)), 2_500);
assert.equal(isWorthShowing(r("beat", "instagram", "reel", 20_000, null, 1.2, 3)), true); // beat their usual
assert.equal(isWorthShowing(r("viral", "instagram", "reel", 800_000, null, 0.4, 3)), true); // big on its own
assert.equal(isWorthShowing(r("weak", "instagram", "reel", 50_000, null, 0.2, 3)), false); // below usual and small
assert.equal(isWorthShowing(r("nobase", "instagram", "carousel", null, 1_100, null, 3)), false); // no usual, ~27K
assert.equal(isWorthShowing(r("tiny", "instagram", "reel", 1_000, null, 5, 3)), false); // under the floor
assert.deepEqual(rankPosts([tinyOutlier, oldHit, smallBeat, bigRecent], at).map((p) => p.id), ["big", "small", "old", "tiny"]);
assert.equal(isTooOld(daysAgo(730), at), true);
assert.equal(isTooOld(daysAgo(365), at), false);
assert.equal(isTooOld(null, at), false);
const mixed = [
  ...Array.from({ length: 10 }, (_, i) => r(`y${i}`, "youtube", "video", 1e6, null, 5, 5)),
  ...Array.from({ length: 5 }, (_, i) => r(`i${i}`, "instagram", "reel", 1e4, null, 2, 5)),
];
const share = takeWithPlatformShare(rankPosts(mixed, at), 10);
assert.equal(share.length, 10);
assert.equal(share.filter((p) => p.platform === "instagram").length, 5); // floor(10 × 0.5)
assert.deepEqual(share.slice(0, 5).map((p) => p.platform), Array(5).fill("youtube")); // rank order kept
const tinyIg = [...mixed.slice(0, 10), ...Array.from({ length: 5 }, (_, i) => r(`t${i}`, "instagram", "reel", 300, null, 2, 5))];
assert.equal(takeWithPlatformShare(rankPosts(tinyIg, at), 10).filter((p) => p.platform === "instagram").length, 0); // no place held for tiny posts

// ─── keyword ────────────────────────────────────────────────────────────────
const flat = Array(52).fill(50);
assert.equal(summarizeTrend(Array(52).fill(0), []), null); // too few searches to chart
assert.equal(summarizeTrend([...Array(48).fill(0), 10, 10, 10, 10], []), null);
assert.equal(summarizeTrend(flat, [])?.direction, "steady");
const up = summarizeTrend([...Array(40).fill(40), ...Array(8).fill(40), 60, 60, 60, 60], ["a", "b", "c", "d", "e", "f"])!;
assert.equal(up.direction, "rising");
assert.equal(up.change, 50);
assert.equal(up.now, 60);
assert.equal(up.rising.length, 5);
assert.equal(summarizeTrend([...Array(44).fill(80), 40, 40, 40, 40, 40, 40, 40, 40], [])?.direction, "falling");
const strongKeyword = scoreKeyword(14, up);
assert.equal(strongKeyword.label, "strong");
assert.ok(strongKeyword.score > scoreKeyword(14, summarizeTrend(flat, [])).score);
assert.equal(strongKeyword.summary, "Lots of people search this on YouTube, and interest is up 50% in the last 4 weeks.");
assert.equal(scoreKeyword(0, null).score, 0);
assert.equal(scoreKeyword(0, null).label, "weak");
assert.equal(scoreKeyword(14, null).score, 70); // demand alone is capped
assert.equal(scoreKeyword(4, null).summary, "Some people search this on YouTube.");
const igTags = [
  { name: "proteinbreakfastideas", posts: 2_459 },
  { name: "proteinbreakfast", posts: 253_695 },
  { name: "proteinbreakfasts", posts: 1_989 },
];
assert.equal(hashtagOf("Protein breakfast!"), "proteinbreakfast");
assert.equal(topicHashtags("protein breakfast", igTags)[0].name, "proteinbreakfast"); // its own hashtag first
const igStrong = scoreInstagramTopic("protein breakfast", topicHashtags("protein breakfast", igTags));
assert.equal(igStrong.platform, "instagram");
assert.equal(igStrong.score, 60); // 0.8 × log-scaled 254K posts + 0.2 × 3 busy tags of 10
assert.equal(igStrong.summary, "#proteinbreakfast is on 254K Instagram posts.");
const igTiny = scoreInstagramTopic("claude motion", [{ name: "claudemotion", posts: 454 }]);
assert.equal(igTiny.label, "weak");
assert.equal(igTiny.summary, "Only 454 Instagram posts use #claudemotion.");
assert.equal(scoreInstagramTopic("zzqx", []).score, 0);
assert.equal(scoreInstagramTopic("zzqx", []).summary, "No Instagram hashtag matches this yet.");
const both = combineKeyword([strongKeyword, igTiny]);
assert.equal(both.score, Math.round((strongKeyword.score + igTiny.score) / 2));
assert.equal(both.summary, "Strong on YouTube, weak on Instagram.");
assert.equal(combineKeyword([igTiny]).summary, igTiny.summary);

// ─── topic ──────────────────────────────────────────────────────────────────
assert.deepEqual(topicWords("skincare for men"), ["skincare", "men"]);
assert.deepEqual(topicWords("Protein Breakfast"), ["protein", "breakfast"]);
assert.equal(matchesTopic("5 High Protein Breakfasts", topicWords("protein breakfast")), true);
assert.equal(matchesTopic("My protein shake", topicWords("protein breakfast")), true); // half the words is enough
assert.equal(matchesTopic("Morning vlog", topicWords("protein breakfast")), false);
assert.equal(matchesTopic("anything", []), false);

// ─── cursor ─────────────────────────────────────────────────────────────────
const key = exploreKey("Protein breakfast", "IN");
assert.equal(key, exploreKey(" protein BREAKFAST ", "IN"));
assert.notEqual(key, exploreKey("protein breakfast", "US"));
const cursor = { v: 1 as const, k: key, yt: { s: [{ t: "tok", o: 3 }, null] }, ig: null, seen: [hashId("youtube:abc")] };
assert.deepEqual(decodeCursor(encodeCursor(cursor), key), cursor);
assert.throws(() => decodeCursor(encodeCursor(cursor), exploreKey("other", "IN")));
assert.throws(() => decodeCursor("not-a-cursor", key));
assert.notEqual(hashId("youtube:abc"), hashId("youtube:abd"));
// Carried items survive a round trip, and an oversized cursor drops carried items (last first), never the streams.
// Hash-made ids and titles, so the test cursor compresses like a real one.
const noise = (seed: string, words: number) => Array.from({ length: words }, (_, k) => hashId(`${seed}:${k}`)).join(" ");
const pendingHit = (i: number) => ({ v: noise(`v${i}`, 2).slice(0, 11), c: `UC${noise(`c${i}`, 4).replace(/ /g, "")}`.slice(0, 24), t: noise(`t${i}`, 14).slice(0, 100), n: 1000 + i * 7919, d: 60 + i, p: 1_790_000_000 + i * 3_607, a: 1 });
const carry = { ...cursor, yt: { s: [{ t: "tok".repeat(200), o: 3, f: 1 }, null], p: [pendingHit(0)] }, ig: { i: 4, r: [1], tags: ["proteinbreakfast"], p: [["DUNRxWVgU5P", 2]] as Array<[string, number]> } };
assert.deepEqual(decodeCursor(encodeCursor(carry), key), carry);
const huge = { ...carry, yt: { ...carry.yt, p: Array.from({ length: 400 }, (_, i) => pendingHit(i)) } };
const hugeEncoded = encodeCursor(huge);
assert.ok(hugeEncoded.length <= 12_000, `cursor ${hugeEncoded.length} chars`);
const hugeBack = decodeCursor(hugeEncoded, key);
assert.ok(hugeBack.yt!.p!.length > 0 && hugeBack.yt!.p!.length < 400);
assert.deepEqual(hugeBack.yt!.p![0], pendingHit(0)); // best (first) kept
assert.deepEqual(hugeBack.yt!.s, huge.yt.s);
assert.equal(huge.yt.p.length, 400); // the caller's cursor isn't mutated

console.log("content-lab compute selfcheck: ok");
