import { z } from "zod";

import { CLAUDE_ASK, CLAUDE_ASK_FIELD_DESCRIPTIONS } from "./constants";

export const CLAUDE_ASK_REQUEST_SCHEMA = z.object({
  task: z.string().min(1).describe(CLAUDE_ASK_FIELD_DESCRIPTIONS.task),
  session_id: z.string().optional().describe(CLAUDE_ASK_FIELD_DESCRIPTIONS.session_id),
  model: z.string().optional().describe(CLAUDE_ASK_FIELD_DESCRIPTIONS.model),
  effort: z
    .enum(["low", "medium", "high"])
    .optional()
    .describe(CLAUDE_ASK_FIELD_DESCRIPTIONS.effort),
  home_dir: z.string().optional().describe(CLAUDE_ASK_FIELD_DESCRIPTIONS.home_dir),
  allow_tools: z.string().optional().describe(CLAUDE_ASK_FIELD_DESCRIPTIONS.allow_tools),
  max_turns: z
    .number()
    .int()
    .optional()
    .default(CLAUDE_ASK.DEFAULT_MAX_TURNS)
    .describe(CLAUDE_ASK_FIELD_DESCRIPTIONS.max_turns),
  timeout_seconds: z
    .number()
    .int()
    .optional()
    .default(CLAUDE_ASK.DEFAULT_TIMEOUT_SEC)
    .describe(CLAUDE_ASK_FIELD_DESCRIPTIONS.timeout_seconds),
});

export const CLAUDE_BUDGET_STATUS_REQUEST_SCHEMA = z.object({});
