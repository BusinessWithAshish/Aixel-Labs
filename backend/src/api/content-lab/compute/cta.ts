const CAPTION_CTA_PATTERNS = [
  /\bcomment\b/i,
  /\bsave (?:this|it|for later)\b/i,
  /\blink (?:is )?in (?:my |the )?bio\b/i,
  /\bfollow (?:me |us )?(?:for|@)/i,
  /\bshare (?:this|it|with)\b/i,
  /\b(?:dm|message) (?:me|us)\b/i,
  /\btag (?:a|your|someone)\b/i,
  /\b(?:karo|kar do|kijiye)\b/i,
];

const MAX_CTA_CHARS = 140;

/** The caption sentence (or line) that asks for something: comment X, save, link in bio, follow, DM. */
export function captionCta(caption: string | null | undefined): string | null {
  if (!caption) return null;
  const parts = caption
    .split(/\r?\n|(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Last match wins: captions put the ask at the end.
  const hit = [...parts].reverse().find((s) => CAPTION_CTA_PATTERNS.some((re) => re.test(s)));
  return hit ? hit.slice(0, MAX_CTA_CHARS) : null;
}
