import type {
  CONTENT_LAB_CHECK_ITEM,
  CONTENT_LAB_TEXT_SIGNALS,
  ContentLabPlatform,
} from "../types";
import { median } from "./baseline";
import { signalCopy, textNoun } from "./reasons";
import { CONTENT_LAB_SIGNAL_KEYS, computeTextSignals } from "./signals";

/** A signal counts once at least this share of winners use it. */
const MIN_PREVALENCE = 0.25;
/** Within this share of the winners' median length passes. */
const LENGTH_TOLERANCE = 0.35;
/** Signals carry this share of the score; length the rest. */
const SIGNAL_WEIGHT = 0.75;

/**
 * Scores a draft 0-100 against winners: each signal weighs as much as its
 * prevalence among winners, the draft earns the weight of the ones it shares,
 * plus how close its length is to the winners' median.
 */
export function computeDraftCheck(
  text: string,
  platform: ContentLabPlatform,
  winners: ReadonlyArray<{ signals: CONTENT_LAB_TEXT_SIGNALS }>,
): { score: number; checks: CONTENT_LAB_CHECK_ITEM[] } {
  const draft = computeTextSignals(text);
  const n = winners.length;
  if (n === 0) return { score: 0, checks: [] };
  const noun = textNoun(platform);
  const checks: CONTENT_LAB_CHECK_ITEM[] = [];
  let total = 0;
  let earned = 0;

  for (const key of CONTENT_LAB_SIGNAL_KEYS) {
    const hits = winners.filter((w) => w.signals[key]).length;
    const prevalence = hits / n;
    if (prevalence < MIN_PREVALENCE) continue;
    total += prevalence;
    if (draft[key]) earned += prevalence;
    checks.push({
      label: signalCopy(key, noun).label,
      passed: draft[key],
      detail: `${hits} of the ${n} top posts ${signalCopy(key, noun).winners}. ${draft[key] ? "Yours does too." : "Yours doesn't."}`,
    });
  }

  const target = median(winners.map((w) => w.signals.length))!;
  const gap = target > 0 ? Math.abs(draft.length - target) / target : 0;
  const lengthPassed = gap <= LENGTH_TOLERANCE;
  // Full marks inside the tolerance, falling to 0 at twice the target's distance.
  const lengthScore = lengthPassed ? 1 : Math.max(0, 1 - (gap - LENGTH_TOLERANCE));
  checks.push({
    label: "Length",
    passed: lengthPassed,
    detail: `Top posts' ${noun}s are about ${Math.round(target)} characters long. Yours is ${draft.length}.`,
  });

  const signalScore = total > 0 ? earned / total : 1;
  const score = Math.round(100 * (SIGNAL_WEIGHT * signalScore + (1 - SIGNAL_WEIGHT) * lengthScore));
  return { score, checks };
}
