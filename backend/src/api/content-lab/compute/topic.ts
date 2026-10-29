/** Words too common to say what a search is about. */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "for", "from", "how", "in", "is", "it", "my", "of", "on", "or", "the", "to", "with",
  "your", "you", "best", "top", "easy", "ki", "ke", "ka", "aur", "mein",
]);

/** Lowercase words, with a plural "s" dropped so "breakfasts" matches "breakfast". */
function words(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{M}\p{Nd}]+/gu) ?? []).map((w) =>
    w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w,
  );
}

/** The words of a search that carry its topic: "skincare for men" → ["skincare", "men"]. */
export function topicWords(query: string): string[] {
  return [...new Set(words(query).filter((w) => !STOP_WORDS.has(w) && (w.length >= 3 || /\P{ASCII}/u.test(w))))];
}

/**
 * True when `text` (a title or caption) is about the search: it holds at
 * least half of the topic words. Used to add a creator's other recent
 * winners to explore only when they're on the same topic.
 */
export function matchesTopic(text: string, topic: readonly string[]): boolean {
  if (topic.length === 0 || !text) return false;
  const have = new Set(words(text));
  const hits = topic.filter((w) => have.has(w)).length;
  return hits >= Math.max(1, Math.ceil(topic.length / 2));
}
