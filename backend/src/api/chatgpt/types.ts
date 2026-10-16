import type { z } from "zod";

import type { CHATGPT_CODEX_IMAGE_REQUEST_SCHEMA, CHATGPT_REQUEST_SCHEMA } from "./schemas";

export type CHATGPT_REQUEST = z.input<typeof CHATGPT_REQUEST_SCHEMA>;
export type CHATGPT_REQUEST_PARSED = z.output<typeof CHATGPT_REQUEST_SCHEMA>;

export type CHATGPT_RESPONSE = {
  text?: string;
  media_url?: string;
  conversation_url: string;
};

export type CHATGPT_HEALTH_RESPONSE = {
  ready: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
};

export type CHATGPT_CODEX_IMAGE_REQUEST = z.input<typeof CHATGPT_CODEX_IMAGE_REQUEST_SCHEMA>;
export type CHATGPT_CODEX_IMAGE_REQUEST_PARSED = z.output<typeof CHATGPT_CODEX_IMAGE_REQUEST_SCHEMA>;

export type CHATGPT_CODEX_IMAGE_RESPONSE = {
  /** The CLI's one-line answer, if it gave one. */
  text?: string;
  /** The generated image, staged to public media. */
  media_url: string;
  /** Pass back as session_id with mode=revise to change this image in context. */
  session_id: string;
};
