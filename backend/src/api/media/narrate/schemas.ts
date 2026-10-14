import { z } from "zod";

import { MEDIA_NARRATE, MEDIA_NARRATE_GEMINI } from "./constants";

export const MEDIA_NARRATE_REQUEST_SCHEMA = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(MEDIA_NARRATE.MAX_TEXT_CHARS)
    .describe(
      "What to say. provider 'kokoro': one sentence or a short beat, not a whole script (a sentence is the unit later steps re-do on its own). provider 'gemini': the WHOLE script in one call (its free tier allows only 10 calls a day); the response then carries `sentences[]`, one audio file per sentence. Hindi in Devanagari with English words left in Latin script. Markup: {pause 0.6} = a silence of that many seconds (gemini: a short or long pause); {pace 0.85} = say what follows at that fraction of the base speed until the next {pace} (kokoro only); both are removed from the spoken text. gemini also honours inline English tags such as <short pause>, <long pause>, <sigh>, <laugh>, <whispers>. The Hindi full stop । is read as a sentence end.",
    ),
  language: z
    .string()
    .optional()
    .default(MEDIA_NARRATE.DEFAULT_LANGUAGE)
    .describe("ISO 639-1 code: 'hi' (default) or 'en'."),
  voice: z
    .string()
    .optional()
    .describe(
      `Voice id. kokoro: hm_omega (default, male), hm_psi (male), hf_alpha (female), hf_beta (female). gemini: a studio voice — ${MEDIA_NARRATE_GEMINI.DEFAULT_VOICE} (default), Puck, Orus, Fenrir, Algenib, ... — or an extended-library id such as en-in-storyteller-11.`,
    ),
  direction: z
    .string()
    .trim()
    .max(300)
    .optional()
    .describe(
      "gemini only: how the whole script should be delivered, in plain English, e.g. 'energetic YouTube movie-recap narrator, conversational, a little dramatic'. Shapes the delivery and is never read aloud. Ignored by kokoro.",
    ),
  speed: z
    .number()
    .min(MEDIA_NARRATE.SPEED_MIN)
    .max(MEDIA_NARRATE.SPEED_MAX)
    .optional()
    .default(MEDIA_NARRATE.DEFAULT_SPEED)
    .describe("Base speaking speed, 1.0 = the voice's natural pace. 1.15 is a brisk storyteller."),
  pronunciations: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      "Per-call respellings applied before synthesis, e.g. {\"Vijay\":\"विजय्\"}: write a name or word the way the engine should say it. Case-sensitive, single words; they win over the built-in corrections (kokoro only: final-cluster and -य endings, a list of common Indian names and words). The captions keep the written form; `respelled` lists what was changed.",
    ),
  provider: z
    .enum(MEDIA_NARRATE.PROVIDERS)
    .optional()
    .default(MEDIA_NARRATE.DEFAULT_PROVIDER)
    .describe(
      "Narration engine. 'kokoro' (default): self-hosted, unlimited, flat delivery. 'gemini': Google Gemini TTS, far better pronunciation and expression, but the free tier allows 10 calls a day per Google project — fall back to 'kokoro' when it says the key pool is exhausted.",
    ),
});
