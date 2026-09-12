import { z } from "zod";

import { GEMINI, GEMINI_EXPECT, GEMINI_FIELD_DESCRIPTIONS, GEMINI_MODES } from "./constants";

export const GEMINI_REQUEST_SCHEMA = z
  .object({
    prompt: z.string().min(1).describe(GEMINI_FIELD_DESCRIPTIONS.prompt),
    mode: z.enum(GEMINI_MODES).default("new").describe(GEMINI_FIELD_DESCRIPTIONS.mode),
    conversation_id: z
      .string()
      .nullable()
      .optional()
      .describe(GEMINI_FIELD_DESCRIPTIONS.conversation_id),
    images: z.array(z.string()).optional().describe(GEMINI_FIELD_DESCRIPTIONS.images),
    videos: z.array(z.string()).optional().describe(GEMINI_FIELD_DESCRIPTIONS.videos),
    expect: z.enum(GEMINI_EXPECT).default("auto").describe(GEMINI_FIELD_DESCRIPTIONS.expect),
    timeout_seconds: z
      .number()
      .int()
      .positive()
      .optional()
      .default(GEMINI.DEFAULT_TURN_TIMEOUT_SEC)
      .describe(GEMINI_FIELD_DESCRIPTIONS.timeout_seconds),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "resume" && !val.conversation_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "conversation_id is required when mode is resume",
        path: ["conversation_id"],
      });
    }
  });
