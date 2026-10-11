/**
 * Hindi spelling corrections applied before synthesis.
 *
 * The engine's Hindi phonemiser (espeak-ng) gets the inherent vowel ("schwa")
 * wrong in predictable places, and reads Latin-script Indian names with
 * English rules. Both are fixed by changing what is *sent*, never what is
 * shown: every rewrite is a one-for-one swap of a word, so the caller's own
 * spelling still goes into the captions.
 *
 * Every entry and rule below was checked against the engine's phoneme output
 * (`/dev/phonemize`), not guessed.
 */

const CONSONANT = "\\u0915-\\u0939\\u0958-\\u095F";
const NUKTA = "\\u093C";
const VIRAMA = "\\u094D";
const YA = "\\u092F";

/**
 * Final consonant cluster ("फ़िल्म", "कब्र", "कृष्ण", "मित्र"): Hindi drops the
 * last schwa, the engine keeps it ("filma", "kabra"). An explicit final virama
 * says so. Not applied when the cluster ends in य — "सत्य", "रहस्य" keep their
 * final vowel in speech ("satya").
 */
const CONSONANT_NOT_YA = "\\u0915-\\u092E\\u0930-\\u0939\\u0958-\\u095F";
const FINAL_CLUSTER = new RegExp(`[${CONSONANT}]${NUKTA}?${VIRAMA}[${CONSONANT_NOT_YA}]${NUKTA}?$`, "u");

/**
 * A single consonant then final य ("विजय", "समय", "अभय"): the engine reads the
 * ending as "-ey" (vijey, samey); a final virama makes it "-ay".
 */
const FINAL_YA = new RegExp(`[${CONSONANT}]${NUKTA}?${YA}$`, "u");

/** Respellings verified to read right. Latin keys are matched case-insensitively. */
const LEXICON: Record<string, string> = {
  // Words where a medial vowel is dropped or changed
  "अजनबी": "अज्नबी",
  "इंतज़ार": "इंतेज़ार",
  "इंतजार": "इंतेज़ार",
  "मुंबई": "मुम्बई",
  // Names written in Latin script: read with English rules, they come out wrong
  vijay: "विजय्",
  ajay: "अजय्",
  sanjay: "संजय्",
  jay: "जय्",
  jai: "जय्",
  arjun: "अर्जुन",
  raghav: "राघव",
  priya: "प्रिया",
  rahul: "राहुल",
  raj: "राज",
  ravi: "रवि",
  karan: "करण",
  amit: "अमित",
  amitabh: "अमिताभ",
  rohit: "रोहित",
  kabir: "कबीर",
  krishna: "कृष्ण्",
  ram: "राम",
  sita: "सीता",
  shiva: "शिव",
  hanuman: "हनुमान",
  ganesh: "गणेश",
  ramesh: "रमेश",
  suresh: "सुरेश",
  mahesh: "महेश",
  dinesh: "दिनेश",
  veeru: "वीरू",
  basanti: "बसंती",
  gabbar: "गब्बर",
  thakur: "ठाकुर",
  mumbai: "मुम्बई",
  delhi: "दिल्ली",
};

export type RESPELLING = { from: string; to: string; source: "channel" | "lexicon" | "rule" };

/** Splits a token into leading punctuation, the word, trailing punctuation. */
const TOKEN = /^([^\p{L}\p{N}\p{M}]*)(.*?)([^\p{L}\p{N}\p{M}]*)$/su;

/**
 * Returns how a single whitespace-delimited token should be SPOKEN. `own` is
 * the caller's per-call respellings and always wins.
 */
export function respellToken(
  token: string,
  own: Record<string, string> | undefined,
): { spoken: string; respelling?: RESPELLING } {
  const match = TOKEN.exec(token);
  if (!match || !match[2]) return { spoken: token };
  const [, lead, core, tail] = match;

  const mine = own?.[core];
  if (mine !== undefined) {
    return { spoken: `${lead}${mine}${tail}`, respelling: { from: core, to: mine, source: "channel" } };
  }
  const listed = LEXICON[core] ?? LEXICON[core.toLowerCase()];
  if (listed !== undefined) {
    return { spoken: `${lead}${listed}${tail}`, respelling: { from: core, to: listed, source: "lexicon" } };
  }
  if (FINAL_YA.test(core) || FINAL_CLUSTER.test(core)) {
    const fixed = `${core}\u094D`;
    return { spoken: `${lead}${fixed}${tail}`, respelling: { from: core, to: fixed, source: "rule" } };
  }
  return { spoken: token };
}
