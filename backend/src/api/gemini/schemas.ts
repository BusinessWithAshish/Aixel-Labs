import { z } from "zod";

import { GEMINI, GEMINI_EXPECT, GEMINI_FIELD_DESCRIPTIONS, GEMINI_MODES } from "./constants";

export const GEMINI_REQUEST_SCHEMA = z
  .object({
    prompt: z.string().min(1).describe(GEMINI_FIELD_DESCRIPTIONS.prompt),
    project_url: z
      .string()
      .regex(GEMINI.PROJECT_URL_RE, "project_url must be a gemini.google.com/notebook/<id> or /gem/<id> URL")
      .nullable()
      .optional()
      .describe(GEMINI_FIELD_DESCRIPTIONS.project_url),
    mode: z.enum(GEMINI_MODES).default("new").describe(GEMINI_FIELD_DESCRIPTIONS.mode),
    conversation_id: z
      .string()
      .regex(/^[0-9a-fA-F]+$/, "conversation_id is the hex id after /app/")
      .nullable()
      .optional()
      .describe(GEMINI_FIELD_DESCRIPTIONS.conversation_id),
    conversation_url: z
      .string()
      .regex(GEMINI.CONVERSATION_URL_RE, "conversation_url must be a gemini.google.com/app/<id> URL")
      .nullable()
      .optional()
      .describe(GEMINI_FIELD_DESCRIPTIONS.conversation_url),
    revise_notes: z
      .string()
      .nullable()
      .optional()
      .describe(GEMINI_FIELD_DESCRIPTIONS.revise_notes),
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
    if (val.mode !== "new" && !val.conversation_id && !val.conversation_url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `conversation_id or conversation_url is required when mode is ${val.mode}`,
        path: ["conversation_id"],
      });
    }
  });
