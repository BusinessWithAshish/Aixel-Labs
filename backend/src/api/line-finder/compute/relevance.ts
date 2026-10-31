import { skeleton, soundsOf } from "./sound";

function containsRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((word, i) => haystack[start + i] === word)) return true;
  }
  return false;
}

/**
 * Does this video's title or description name the person, by any of their spellings? (spec §2.3)
 * Compares skeletons, since a name written in the other script often differs only in its vowels
 * (`सुपरस्टार` / `superstar`).
 */
export function namesPerson(text: string, spellings: string[]): boolean {
  const words = soundsOf(text).map(skeleton);
  return spellings.some((spelling) => containsRun(words, soundsOf(spelling).map(skeleton)));
}
