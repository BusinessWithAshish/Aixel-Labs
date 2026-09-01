import { z } from "zod";

import {
  CHATGPT_FIELD_DESCRIPTIONS,
  CHATGPT_MODES,
} from "./constants";

export const CHATGPT_REQUEST_SCHEMA = z
  .object({
    project_url: z
      .string()
      .url()
      .describe(CHATGPT_FIELD_DESCRIPTIONS.project_url),
    prompt: z
      .string()
      .min(1)
      .describe(CHATGPT_FIELD_DESCRIPTIONS.prompt),
    mode: z
      .enum(CHATGPT_MODES)
      .describe(CHATGPT_FIELD_DESCRIPTIONS.mode),
    conversation_url: z
      .string()
      .url()
      .nullable()
      .optional()
      .describe(CHATGPT_FIELD_DESCRIPTIONS.conversation_url),
    revise_notes: z
      .string()
      .nullable()
      .optional()
      .describe(CHATGPT_FIELD_DESCRIPTIONS.revise_notes),
    images: z
      .array(z.string())
      .optional()
      .describe(CHATGPT_FIELD_DESCRIPTIONS.images),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "revise" && !val.conversation_url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "conversation_url is required when mode is revise",
        path: ["conversation_url"],
      });
    }
  });

export const CHATGPT_STAGE_REQUEST_SCHEMA = z.object({
  url: z.string().url().describe(CHATGPT_FIELD_DESCRIPTIONS.stage_url),
});
