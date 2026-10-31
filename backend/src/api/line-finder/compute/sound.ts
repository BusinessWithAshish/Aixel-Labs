/**
 * Sound forms (spec §3): rewrites Hindi and Roman spellings so they meet, so
 * `पैसा` and `paisa` are the same word. Rules only, no AI: this runs on every
 * caption line, and on every keystroke's worth of a search.
 */

const CONSONANTS: Record<string, string> = {
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "n",
  च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "n",
  ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n",
  त: "t", थ: "th", द: "d", ध: "dh", न: "n",
  प: "p", फ: "ph", ब: "b", भ: "bh", म: "m",
  य: "y", र: "r", ल: "l", व: "v",
  श: "sh", ष: "sh", स: "s", ह: "h",
};

/** A dot under the letter changes its sound (NFD splits it out as U+093C). */
const NUKTA_CONSONANTS: Record<string, string> = {
  ड: "r", ढ: "rh", क: "k", ख: "kh", ग: "g", ज: "z", फ: "f",
};
const NUKTA = "़";
const VIRAMA = "्";

const VOWELS: Record<string, string> = {
  अ: "a", आ: "aa", इ: "i", ई: "ii", उ: "u", ऊ: "uu", ऋ: "ri",
  ए: "e", ऐ: "ai", ओ: "o", औ: "au", ऑ: "o", ऍ: "e",
};

const VOWEL_SIGNS: Record<string, string> = {
  "ा": "aa", "ि": "i", "ी": "ii", "ु": "u", "ू": "uu", "ृ": "ri",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ॅ": "e",
};

const NASALS = new Set(["ं", "ँ"]);

type Syllable = { consonant: string; vowel: string | null; nasal: boolean };

const HAS_DEVANAGARI = /[ऀ-ॿ]/;

/** Common words Hindi spells one way and Roman another, that the letter rules alone can't bring together. */
const SOUND_ALIASES: Record<string, string> = {
  nahin: "nahi",
  hain: "hai",
  mein: "me",
  men: "me",
  mai: "main",
};

/** One Hindi word to Roman letters, dropping the silent `a` the way Hindi speech does (`करना` is `karna`, not `karana`). */
function devanagariWordToRoman(word: string): string {
  const chars = [...word.normalize("NFD")];
  const syllables: Syllable[] = [];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const last = syllables[syllables.length - 1];
    if (CONSONANTS[ch]) {
      const dotted = chars[i + 1] === NUKTA;
      if (dotted) i++;
      syllables.push({ consonant: dotted ? NUKTA_CONSONANTS[ch] ?? CONSONANTS[ch] : CONSONANTS[ch], vowel: null, nasal: false });
    } else if (VOWELS[ch]) {
      syllables.push({ consonant: "", vowel: VOWELS[ch], nasal: false });
    } else if (VOWEL_SIGNS[ch] && last) {
      last.vowel = VOWEL_SIGNS[ch];
    } else if (ch === VIRAMA && last) {
      last.vowel = "";
    } else if (NASALS.has(ch) && last) {
      last.nasal = true;
    }
  }

  return syllables
    .map((syllable, i) => {
      let vowel = syllable.vowel;
      if (vowel === null) {
        const next = syllables[i + 1];
        const isLast = !next;
        const nextHasOwnVowel = !!next && !!next.vowel;
        const dropped = isLast || (i > 0 && nextHasOwnVowel && !syllables[i - 1]?.nasal);
        vowel = dropped ? "" : "a";
      }
      return syllable.consonant + vowel + (syllable.nasal ? "n" : "");
    })
    .join("");
}

/** A word's sound form. Empty when the word has no letters. */
export function soundForm(word: string): string {
  const roman = HAS_DEVANAGARI.test(word) ? devanagariWordToRoman(word) : word.toLowerCase();
  const letters = roman.replace(/[^a-z0-9]/g, "");
  const sound = letters
    .replace(/ck/g, "k")
    .replace(/chh?/g, "c")
    .replace(/sh/g, "s")
    .replace(/ph/g, "f")
    .replace(/([bdgjkpt])h/g, "$1")
    .replace(/w/g, "v")
    .replace(/z/g, "j")
    .replace(/q/g, "k")
    .replace(/ee|ii/g, "i")
    .replace(/oo|uu/g, "u")
    .replace(/aa/g, "a")
    .replace(/([aeiou])y([aeiou])/g, "$1$2")
    .replace(/(.)\1+/g, "$1");
  return SOUND_ALIASES[sound] ?? sound;
}

const WORD_SPLIT = /[\s,.;:!?…|।॥"'“”‘’()[\]{}<>/\\\-–—_#@*&+=~`^%$]+/u;

/** Text to the words in it, each with its sound form. Words with no letters are dropped. */
export function soundWords(text: string): Array<{ word: string; sound: string }> {
  return text
    .split(WORD_SPLIT)
    .map((word) => ({ word, sound: soundForm(word) }))
    .filter(({ sound }) => sound.length > 0);
}

/** Text to its sound forms, in order. */
export function soundsOf(text: string): string[] {
  return soundWords(text).map(({ sound }) => sound);
}

/** A sound form without its inner vowels, for finding candidates (`paisa` → `ps`). */
export function skeleton(sound: string): string {
  return sound[0] + sound.slice(1).replace(/[aeiouy]/g, "");
}
