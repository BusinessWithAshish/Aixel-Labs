import { z } from "zod";


const PHRASE_SCHEMA = z.object({
  text: z.string().min(1).describe("The words shown as a caption while this phrase is spoken, as `narrate` returned them."),
  startSeconds: z
    .number()
    .min(0)
    .describe("When this phrase starts being spoken, seconds into its sentence's audio (`narrate` phrases[].startSeconds)."),
  endSeconds: z
    .number()
    .min(0)
    .describe("When it stops being spoken (`narrate` phrases[].endSeconds). Only used for the caption cue."),
  videoPath: z
    .string()
    .min(1)
    .describe("The footage for this phrase: a local clip (a `cut` output) at least `footageSeconds` long."),
  videoStartSeconds: z
    .number()
    .min(0)
    .optional()
    .default(0)
    .describe("Where in videoPath the footage starts. 0 for a clip cut to length."),
});

export const MEDIA_ASSEMBLE_REQUEST_SCHEMA = z.object({
  sentences: z
    .array(
      z.object({
        audioPath: z.string().min(1).describe("This sentence's narration (`narrate` audioPath)."),
        phrases: z
          .array(PHRASE_SCHEMA)
          .min(1)
          .describe(
            "The sentence's phrases in order, one per `narrate` phrase. Each phrase's footage runs from its startSeconds to the next phrase's startSeconds (the last to the end of the audio; the first also covers the lead-in), so the picture changes exactly where the words do.",
          ),
      }),
    )
    .min(1)
    .describe("The recap, in order."),
  sentencePauseSeconds: z
    .number()
    .min(0)
    .max(3)
    .optional()
    .default(0.22)
    .describe(
      "Silence added after every sentence but the last, on BOTH tracks: the audio gets silence and the picture holds its last frame, so the two stay exactly the same length. Added on top of the quiet tail the engine leaves after each sentence.",
    ),
  aspectRatio: z
    .enum(["9:16", "16:9", "1:1"])
    .optional()
    .default("9:16")
    .describe("Output frame. Clips already cut to this ratio pass through untouched; others are fitted inside it."),
});
