import { readFileSync } from "node:fs";

import { z } from "zod";

/**
 * Per-channel Gemini/Groq API keys, kept OUTSIDE this repo and outside
 * `AIXEL_MEDIA_ROOT` — one small JSON file per Sage channel, next to that
 * channel's other Hermes-side state, never committed anywhere. A cron run
 * that shares one org-wide `GEMINI_API_KEY_FREE`/`GROQ_API_KEY` pool across
 * every channel means one channel's heavy day (or one bad key) exhausts the
 * quota every OTHER channel also needs the same afternoon — this lets a
 * channel carry its own key(s) instead, while every caller that omits
 * `channel` keeps working exactly as before, unchanged.
 *
 * Deliberately NOT passed through as a raw secret value from the MCP tool
 * caller: the caller passes only the (non-secret) channel slug, and the
 * backend resolves it server-side. Keeping the key itself off the wire means
 * it never lands in a cron's transcript, its delivered Telegram message, or
 * the model's own context — all of which are plaintext and persisted.
 */

const CHANNEL_KEYS_DIR =
  process.env.CHANNEL_API_KEYS_DIR || "/home/ubuntu/.hermes/profiles/sage/channel-keys";

/** Slug shape only — this arrives from MCP tool input, so it must never reach a filesystem path unescaped. */
const CHANNEL_SLUG = /^[a-z0-9][a-z0-9-]*$/;

const CHANNEL_KEY_FILE_SCHEMA = z.object({
  gemini: z.string().min(1).optional(),
  groq: z.string().min(1).optional(),
});

/** Optional, non-secret field every op that can use a per-channel key accepts. */
export const CHANNEL_FIELD = z
  .string()
  .regex(CHANNEL_SLUG)
  .optional()
  .describe(
    "Sage channel slug (e.g. 'podcast-scissors'). When given and that channel has its own Gemini/Groq key on file, this call uses it instead of the shared org-wide pool — keeps one channel's usage from exhausting another's quota. Optional; omit for the shared default. Never pass an actual API key here.",
  );

function readChannelKeyFile(channel: string): z.infer<typeof CHANNEL_KEY_FILE_SCHEMA> | undefined {
  if (!CHANNEL_SLUG.test(channel)) return undefined;
  try {
    const raw = readFileSync(`${CHANNEL_KEYS_DIR}/${channel}.json`, "utf8");
    const result = CHANNEL_KEY_FILE_SCHEMA.safeParse(JSON.parse(raw));
    return result.success ? result.data : undefined;
  } catch {
    // Missing file is the normal case for a channel with no key of its own yet.
    return undefined;
  }
}

/** `undefined` means "no channel-specific key — caller falls back to its shared pool/env var". */
export function resolveGeminiKeyForChannel(channel?: string): string | undefined {
  return channel ? readChannelKeyFile(channel)?.gemini : undefined;
}

export function resolveGroqKeyForChannel(channel?: string): string | undefined {
  return channel ? readChannelKeyFile(channel)?.groq : undefined;
}
