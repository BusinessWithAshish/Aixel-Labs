import type { CONTENT_LAB_TEXT_SIGNALS } from "../types";

/** Boolean signals in a fixed order (reasons, takeaways and checks iterate this). */
export const CONTENT_LAB_SIGNAL_KEYS = [
  "hasNumber",
  "hasPrice",
  "hasQuestion",
  "hasYear",
  "isListicle",
  "hasPov",
  "isChallenge",
] as const satisfies ReadonlyArray<keyof CONTENT_LAB_TEXT_SIGNALS>;

export type ContentLabSignalKey = (typeof CONTENT_LAB_SIGNAL_KEYS)[number];

// Units that make "under 10" or "30 X" a time / weight, not a price or a list.
const UNIT = String.raw`(?:min|mins|minutes?|sec|secs|seconds?|hours?|hrs?|days?|din|weeks?|months?|years?|kg|kgs|g|grams?|gm|cal|kcal|calories|%|percent|lakh|lakhs|crore|crores|k|m)`;

const PRICE_PATTERNS = [
  /[₹$€£]\s?\d/,
  /\b(?:rs\.?|inr|usd)\s?\d/i,
  /\d\s?(?:₹|rs\b|rs\.|rupees?\b|rupaye\b|rupay\b|bucks\b|dollars?\b)/i,
  new RegExp(String.raw`\b(?:under|below|within|less than|sirf|only)\s*(?:₹|rs\.?|\$)?\s*\d+(?![\d.,])(?!\s*${UNIT}\b)`, "i"),
  /\b(?:budget|cheap|affordable|sasta|saste|sasti)\b/i,
];

const QUESTION_PATTERNS = [
  /[?？]/,
  /^(?:what|why|how|when|which|who|where|is|are|can|should|do|does|did|will|would)\b/i,
  // Hindi / Hinglish question words sit anywhere: "protein kaise badhaye".
  /\b(?:kya|kaise|kaisa|kyun|kyu|kab|kaun|kitna|kitne)\b|क्या|कैसे|क्यों/i,
];

// Not "₹2000" / "rs 2000" (a price) and not "2000 calories" (a quantity).
const YEAR_PATTERN = new RegExp(
  String.raw`(?<![₹$€£.,]\s?|rs\.?\s?)\b(?:199\d|20[0-3]\d)\b(?!\s*(?:${UNIT}|rs|rupees?)\b)`,
  "i",
);

const LISTICLE_PATTERNS = [
  /\b(?:top|best)\s+\d{1,2}\b/i,
  // "7 ways", "3 breakfasts", "4 simple high protein breakfasts", "5 tarike"
  new RegExp(
    String.raw`(?:^|[^\d₹$.,])(?:[2-9]|[1-9]\d)\s+(?!${UNIT}\b)(?:[\p{L}-]+\s+){0,3}(?:[\p{L}]+s|ways|tips|tarike|cheezein|cheeze|ideas|foods|recipes|hacks|steps|habits|mistakes|things|reasons|rules)\b`,
    "iu",
  ),
];

const POV_PATTERN = /\bpov\b/i;

const CHALLENGE_PATTERNS = [
  /\bi\s+(?:tried|tested|ate|only ate|did|survived|spent|lived|followed|quit|gave up|switched|replaced|made)\b/i,
  /\b\d+\s*(?:days?|din|hours?|weeks?|months?)\b/i,
  /\b(?:challenge|experiment|try kiya|try kia|tried)\b/i,
];

const NUMBER_PATTERN = /\p{Nd}/u;

/** Signals a title / first caption line carries. English, Hindi and Hinglish text all work (₹, any digits). */
export function computeTextSignals(text: string): CONTENT_LAB_TEXT_SIGNALS {
  const t = text.trim();
  return {
    hasNumber: NUMBER_PATTERN.test(t),
    hasPrice: PRICE_PATTERNS.some((re) => re.test(t)),
    hasQuestion: QUESTION_PATTERNS.some((re) => re.test(t)),
    hasYear: YEAR_PATTERN.test(t),
    isListicle: LISTICLE_PATTERNS.some((re) => re.test(t)),
    hasPov: POV_PATTERN.test(t),
    isChallenge: CHALLENGE_PATTERNS.some((re) => re.test(t)),
    length: [...t].length,
  };
}

/** First non-empty line of a caption: what shows above "more". */
export function firstLine(text: string | null | undefined): string {
  return (text ?? "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
}
