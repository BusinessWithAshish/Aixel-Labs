import { z } from "zod";

import { MEDIA_NARRATE } from "./constants";

export const MEDIA_NARRATE_REQUEST_SCHEMA = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(MEDIA_NARRATE.MAX_TEXT_CHARS)
    .describe(
      "What to say — one sentence or a short beat, not a whole script (a sentence is the unit later steps re-do on its own). Hindi in Devanagari with English words left in Latin script. Markup: {pause 0.6} = a silence of that many seconds; {pace 0.85} = say what follows at that fraction of the base speed until the next {pace}; both are removed from the spoken text. The Hindi full stop । is read as a sentence end (the engine drops it otherwise and runs sentences together).",
    ),
  language: z
    .string()
    .optional()
    .default(MEDIA_NARRATE.DEFAULT_LANGUAGE)
    .describe("ISO 639-1 code: 'hi' (default) or 'en'."),
  voice: z
    .string()
    .optional()
    .default(MEDIA_NARRATE.DEFAULT_VOICE)
    .describe("Voice id. Hindi: hm_omega (default, male), hm_psi (male), hf_alpha (female), hf_beta (female)."),
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
      "Whole-word respellings applied before synthesis, e.g. {\"Vijay\":\"विजय\"}: write a name or word the way the engine should say it. Case-sensitive; the spoken words come back in `words` as respelled.",
    ),
  provider: z
    .enum(MEDIA_NARRATE.PROVIDERS)
    .optional()
    .default(MEDIA_NARRATE.DEFAULT_PROVIDER)
    .describe("Narration engine. 'kokoro' (self-hosted, free) is the only one built."),
});
