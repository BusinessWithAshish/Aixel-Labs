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
  median,
  pickWinners,
  postMetric,
  relativeTimeToIso,
  scorePost,
} from "./index";
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
assert.deepEqual(reasons, ["14x their usual", "Reel", "₹ price in the first line", "Listicle"]);
assert.deepEqual(
  computeReasons({ platform: "youtube", format: "video", title: "Day 7", multiple: 1.2, signals: s("Day 7") }),
  ["Long video", "Number in the title"],
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
assert.match(why[0]!, /5\.5x/);
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
assert.equal(takeaways[0]!.headline, "4 of 5");
assert.match(takeaways[0]!.detail, /number/);
assert.match(takeaways[1]!.headline, /Reels on Instagram/);
assert.match(takeaways[1]!.headline, /Shorts on YouTube/);
assert.match(takeaways[2]!.headline, /^Gap: Listicle/);
assert.deepEqual(computeTakeaways([]), []);

// ─── check ──────────────────────────────────────────────────────────────────
const strong = computeDraftCheck("5 protein breakfasts under ₹50", "instagram", winners);
const weak = computeDraftCheck("My protein breakfast routine that I really love so much every day", "instagram", winners);
assert.ok(strong.score > weak.score, `${strong.score} should beat ${weak.score}`);
assert.ok(strong.score >= 0 && strong.score <= 100 && weak.score >= 0);
const numberCheck = strong.checks.find((c) => c.label === "Number")!;
assert.equal(numberCheck.passed, true);
assert.match(numberCheck.detail, /^4 of 5 winners/);
assert.equal(weak.checks.find((c) => c.label === "Number")!.passed, false);
assert.equal(weak.checks.at(-1)!.label, "Length");
assert.deepEqual(computeDraftCheck("x", "youtube", []), { score: 0, checks: [] });

// ─── helpers (pure parts) ───────────────────────────────────────────────────
assert.deepEqual(
  interleaveBy(["p1", "p2", "p3", "r1", "r2"], (x) => x[0]!),
  ["p1", "r1", "p2", "r2", "p3"],
);
assert.deepEqual(interleaveBy([], (x: string) => x), []);

console.log("content-lab compute selfcheck: ok");
