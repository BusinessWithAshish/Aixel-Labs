import { CONTENT_LAB_FORMAT_LABELS, CONTENT_LAB_OUTLIER_MULTIPLE } from "../constants";
import type {
  CONTENT_LAB_TEXT_SIGNALS,
  ContentLabFormat,
  ContentLabPlatform,
} from "../types";
import { CONTENT_LAB_SIGNAL_KEYS, type ContentLabSignalKey } from "./signals";

/** Where the text lives: a YouTube title, an Instagram caption's first line. */
export function textNoun(platform: ContentLabPlatform): string {
  return platform === "youtube" ? "title" : "first line";
}

/** Copy per signal: the reason chip, the check label, and the takeaway phrase ("5 of 6 winners …"). */
export function signalCopy(key: ContentLabSignalKey, noun: string) {
  const copy: Record<ContentLabSignalKey, { reason: string; label: string; winners: string }> = {
    hasNumber: { reason: `Number in the ${noun}`, label: "Number", winners: `put a number in the ${noun}` },
    hasPrice: { reason: `Price in the ${noun}`, label: "Price or budget", winners: `put a price or budget in the ${noun}` },
    hasQuestion: { reason: "Asks a question", label: "Question", winners: "ask a question" },
    hasYear: { reason: `Year in the ${noun}`, label: "Year", winners: `mention a year in the ${noun}` },
    isListicle: { reason: "Listicle", label: "Listicle", winners: "are listicles (7 ways, top 10)" },
    hasPov: { reason: "POV framing", label: "POV", winners: "use POV framing" },
    isChallenge: { reason: "Challenge or experiment", label: "Challenge", winners: "are a challenge or experiment" },
  };
  return copy[key];
}

/** "14x" (whole numbers from 10x up), "2.4x" below. */
export function formatMultiple(multiple: number): string {
  return `${multiple >= 10 ? Math.round(multiple) : multiple}x`;
}

export type ContentLabReasonInput = {
  platform: ContentLabPlatform;
  format: ContentLabFormat;
  title: string;
  multiple: number | null;
  signals: CONTENT_LAB_TEXT_SIGNALS;
};

/** Plain-language chips for a post: how far it beat the usual, its format, what its text does. */
export function computeReasons(post: ContentLabReasonInput): string[] {
  const reasons: string[] = [];
  if (post.multiple !== null && post.multiple >= CONTENT_LAB_OUTLIER_MULTIPLE) {
    reasons.push(`${formatMultiple(post.multiple)} their usual`);
  }
  reasons.push(CONTENT_LAB_FORMAT_LABELS[post.format]);

  const noun = textNoun(post.platform);
  const s = post.signals;
  for (const key of CONTENT_LAB_SIGNAL_KEYS) {
    if (!s[key]) continue;
    // A price, list or year already says "number"; don't repeat it.
    if (key === "hasNumber" && (s.hasPrice || s.isListicle || s.hasYear)) continue;
    if (key === "hasPrice" && post.title.includes("₹")) {
      reasons.push(`₹ price in the ${noun}`);
      continue;
    }
    reasons.push(signalCopy(key, noun).reason);
  }
  return reasons;
}

const HOOK_TYPE_COPY: Record<string, string> = {
  question: "Opens with a question, so you stay for the answer",
  bold_claim: "Opens with a bold claim",
  story: "Opens with a story",
  direct_address: "Talks straight to the viewer from the first line",
  shock_stat: "Opens with a surprising number",
  demonstration: "Shows instead of tells from the first seconds",
};

export type ContentLabWhyInput = ContentLabReasonInput & {
  hookType: string | null;
  cta: { text: string | null; atPercent: number | null } | null;
  slideCount: number;
};

/** Three "why it worked" bullets: the multiple, the hook, what the text or CTA does. */
export function computeWhyItWorked(input: ContentLabWhyInput): string[] {
  const bullets: string[] = [];
  if (input.multiple !== null && input.multiple >= 1.5) {
    bullets.push(`Got ${formatMultiple(input.multiple)} this creator's usual ${input.format === "post" || input.format === "carousel" ? "likes" : "views"}`);
  }
  const hook = input.hookType ? HOOK_TYPE_COPY[input.hookType] : undefined;
  if (hook) bullets.push(hook);

  const noun = textNoun(input.platform);
  const signalReasons = computeReasons({ ...input, multiple: null }).slice(1);
  if (signalReasons[0]) bullets.push(`${signalReasons[0]}: concrete and easy to click`);
  if (input.cta?.text) {
    const at = input.cta.atPercent !== null ? ` at ${Math.round(input.cta.atPercent)}%` : "";
    bullets.push(`Clear ask${at}: "${input.cta.text}"`);
  }
  if (input.format === "carousel" && input.slideCount > 1) {
    bullets.push(`${input.slideCount} slides keep people swiping`);
  }
  if (bullets.length < 3 && signalReasons[1]) bullets.push(signalReasons[1]);
  if (bullets.length === 0) bullets.push(`Nothing stands out in the ${noun}; the topic itself carried it`);
  return bullets.slice(0, 3);
}
