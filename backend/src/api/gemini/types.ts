import type { z } from "zod";

import type { GEMINI_REQUEST_SCHEMA } from "./schemas";

export type GEMINI_REQUEST = z.input<typeof GEMINI_REQUEST_SCHEMA>;
export type GEMINI_REQUEST_PARSED = z.output<typeof GEMINI_REQUEST_SCHEMA>;

export type GEMINI_MEDIA_KIND = "image" | "video";

export type GEMINI_MEDIA = {
  kind: GEMINI_MEDIA_KIND;
  /** Public URL under {AIXEL_MEDIA_PUBLIC_BASE}, staged from the browser. */
  url: string;
};

export type GEMINI_RESPONSE = {
  /** Assistant text for the turn, if any (a pure image/video turn may have none). */
  text?: string;
  /** Generated images and/or video, staged to public media, in the order produced. */
  media: GEMINI_MEDIA[];
  /** The Gemini model label reported for the turn, if the UI exposed it (e.g. "3.6 Flash"). */
  model?: string;
  /** The /app/<id> conversation id — pass back as conversation_id + mode=resume to continue. */
  conversation_id: string;
  conversation_url: string;
};

export type GEMINI_HEALTH_RESPONSE = {
  ready: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
};
