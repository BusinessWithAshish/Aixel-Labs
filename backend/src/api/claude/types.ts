import type { z } from "zod";

import type {
  CLAUDE_ASK_REQUEST_SCHEMA,
  CLAUDE_BUDGET_STATUS_REQUEST_SCHEMA,
} from "./schemas";

export type CLAUDE_ASK_REQUEST = z.input<typeof CLAUDE_ASK_REQUEST_SCHEMA>;
export type CLAUDE_ASK_REQUEST_PARSED = z.output<typeof CLAUDE_ASK_REQUEST_SCHEMA>;

export type CLAUDE_BUDGET_STATUS_REQUEST = z.input<
  typeof CLAUDE_BUDGET_STATUS_REQUEST_SCHEMA
>;

export type CLAUDE_USAGE = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export type CLAUDE_ASK_RESPONSE = {
  ok: boolean;
  session_id?: string;
  text?: string;
  error?: string;
  usage?: CLAUDE_USAGE;
};

export type CLAUDE_BUDGET_LEDGER = {
  day: string;
  sessions: number;
  resumes: number;
  tokens_in: number;
  tokens_out: number;
  approaching_limit: boolean;
  limit_hit_at: string | null;
  last_warning: string | null;
};

export type CLAUDE_BUDGET_STATUS_RESPONSE = {
  day: string;
  new_sessions_today: number;
  follow_ups_today: number;
  tokens_today: number;
  session_budget: number | "unlimited";
  token_budget: number | "unlimited";
  sessions_remaining: number | "unlimited";
  approaching_limit: boolean;
  last_warning: string | null;
  breaker_open: boolean;
  limit_hit_at: string | null;
  safe_to_delegate: boolean;
  ledger: string;
  note: string;
};
