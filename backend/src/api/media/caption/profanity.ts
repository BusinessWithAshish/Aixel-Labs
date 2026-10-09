import type { GROQ_TRANSCRIPTION_WORD } from "../transcribe/types";

/**
 * `maskProfanity` — show a swear word as its first and last letter with stars
 * between ("f*****g", "c*****a").
 *
 * The clip's own audio is beeped or not by whoever published the episode; this
 * is only about what the channel burns onto the screen in its own name. The
 * length is kept so the caption's rhythm and width do not change, and the word
 * stays recognisable for anyone reading along.
 *
 * A word list rather than a model call: masking has to be the same every time,
 * and a model asked to mask does it for some words and not others (the listener
 * starred one Hindi abuse on its own and left "fucking" alone in the same clip).
 * Stems, so inflections are caught: English and the Hindi/Punjabi abuses that
 * actually turn up in podcasts, in the Roman spellings people type.
 */
const STEMS = [
  // English
  "fuck", "motherfuck", "shit", "bullshit", "bitch", "asshole", "bastard", "dick", "cunt", "pussy",
  "cock", "whore", "slut", "prick", "wank", "twat",
  // Hindi / Punjabi, Roman script
  "chutiy", "chutia", "chootiy", "chod", "chodu", "bhenchod", "behenchod", "bhainchod", "banchod",
  "pencho", "madarchod", "maderchod", "bhosd", "bhosad", "gaand", "gand", "gandu", "lund", "laud",
  "lavd", "lawd", "lodu", "loda", "randi", "rand", "harami", "haraam", "jhaat", "jhant", "tatte",
  "chinal", "kutiya", "kamin",
];
/** Whole words only: short stems that are also ordinary words when longer ("gand" in "gandhi", "rand" in "random"). */
const WHOLE_ONLY = new Set(["gand", "rand", "cock", "dick", "prick", "cunt", "twat", "laud", "loda", "chod", "kamin", "haraam", "tatte"]);

const key = (w: string): string => w.toLowerCase().replace(/[^a-z]/g, "");

function isProfane(word: string): boolean {
  const k = key(word);
  if (k.length < 3) return false;
  return STEMS.some((stem) =>
    WHOLE_ONLY.has(stem) ? k === stem || k === `${stem}s` || k === `${stem}a` || k === `${stem}e` : k.includes(stem),
  );
}

/** "Fucking," -> "F*****g," — first and last letter kept, punctuation around the word left alone. */
export function maskWord(word: string): string {
  // Already starred by whoever transcribed it: normalise to the same shape.
  const starred = /[a-zA-Z]\*+[a-zA-Z]?/.test(word);
  if (!starred && !isProfane(word)) return word;
  return word.replace(/[A-Za-z*]+/g, (run) => {
    const letters = run.replace(/\*/g, "");
    if (run.length < 3 || letters.length < 2) return run;
    if (!starred && !isProfane(run)) return run;
    return `${run[0]}${"*".repeat(run.length - 2)}${run[run.length - 1] === "*" ? letters[letters.length - 1] : run[run.length - 1]}`;
  });
}

export function maskProfanityInWords(words: GROQ_TRANSCRIPTION_WORD[]): GROQ_TRANSCRIPTION_WORD[] {
  return words.map((w) => ({ ...w, word: maskWord(w.word) }));
}

export function maskProfanityInText(text: string): string {
  return text
    .split(/(\s+)/)
    .map((part) => (/\s/.test(part) ? part : maskWord(part)))
    .join("");
}
