import { z } from "zod";

import {
  CHATGPT_CODEX_FIELD_DESCRIPTIONS,
  CHATGPT_FIELD_DESCRIPTIONS,
  CHATGPT_MODES,
} from "./constants";

export const CHATGPT_REQUEST_SCHEMA = z
  .object({
    project_url: z
      .string()
      .url()
      .nullable()
      .optional()
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
    account: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)
      .optional()
      .describe(CHATGPT_FIELD_DESCRIPTIONS.account),
    attach_brand_logo: z
      .boolean()
      .optional()
      .describe(CHATGPT_FIELD_DESCRIPTIONS.attach_brand_logo),
    timeout_seconds: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(CHATGPT_FIELD_DESCRIPTIONS.timeout_seconds),
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

export const CHATGPT_CODEX_IMAGE_SCHEMA = z
  .object({
    prompt: z.string().min(1).describe(CHATGPT_CODEX_FIELD_DESCRIPTIONS.prompt),
    mode: z.enum(CHATGPT_MODES).default("new").describe(CHATGPT_CODEX_FIELD_DESCRIPTIONS.mode),
    session_id: z
      .string()
      .regex(/^[0-9a-fA-F-]{8,64}$/, "session_id is the id a prior call returned")
      .nullable()
      .optional()
      .describe(CHATGPT_CODEX_FIELD_DESCRIPTIONS.session_id),
    revise_notes: z
      .string()
      .nullable()
      .optional()
      .describe(CHATGPT_CODEX_FIELD_DESCRIPTIONS.revise_notes),
    images: z.array(z.string()).optional().describe(CHATGPT_CODEX_FIELD_DESCRIPTIONS.images),
    account: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)
      .optional()
      .describe(CHATGPT_CODEX_FIELD_DESCRIPTIONS.account),
    instructions_file: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .describe(CHATGPT_CODEX_FIELD_DESCRIPTIONS.instructions_file),
    timeout_seconds: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(CHATGPT_CODEX_FIELD_DESCRIPTIONS.timeout_seconds),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.mode === "revise" && !val.session_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "session_id is required when mode is revise",
        path: ["session_id"],
      });
    }
  });
