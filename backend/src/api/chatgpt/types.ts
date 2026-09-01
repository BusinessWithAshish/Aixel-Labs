import type { z } from "zod";

import type {
  CHATGPT_REQUEST_SCHEMA,
  CHATGPT_STAGE_REQUEST_SCHEMA,
} from "./schemas";

export type CHATGPT_REQUEST = z.input<typeof CHATGPT_REQUEST_SCHEMA>;
export type CHATGPT_REQUEST_PARSED = z.output<typeof CHATGPT_REQUEST_SCHEMA>;

export type CHATGPT_STAGE_REQUEST = z.input<typeof CHATGPT_STAGE_REQUEST_SCHEMA>;
export type CHATGPT_STAGE_REQUEST_PARSED = z.output<
  typeof CHATGPT_STAGE_REQUEST_SCHEMA
>;

export type CHATGPT_STAGE_RESPONSE = {
  path: string;
  content_type: string;
  size_bytes: number;
};

export type CHATGPT_RESPONSE = {
  text?: string;
  media_url?: string;
  conversation_url: string;
};

export type CHATGPT_HEALTH_RESPONSE = {
  ready: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
};
