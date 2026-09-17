export const SEGMENT_PROVIDERS = ["claude", "gemini"] as const;

/**
 * ChatGPT deliberately excluded. Its only generation primitive in this
 * backend (`generateChatGpt`, api/chatgpt/client.ts) drives a real ChatGPT
 * web tab over CDP — opens a chat, types a prompt, polls the live UI for a
 * finished turn. That is the right shape for staged image generation, which
 * is what it was built for, and the wrong shape for a fast structured-JSON
 * ranking call: slow (a full browser round trip per attempt), stateful in a
 * way that doesn't compose with retry-on-invalid-JSON, and with no schema
 * constraint to reach for. Add it as a provider only if a fast text-only
 * ChatGPT API path gets built — do not route this through the browser flow.
 */
export type SEGMENT_PROVIDER = (typeof SEGMENT_PROVIDERS)[number];

export const SEGMENT_FIELD_DESCRIPTIONS = {
  provider:
    "Which AI backend ranks the candidates. 'gemini' — real JSON-schema-constrained output (Gemini's responseSchema), runs against the free-tier key pool (see video module's Multi-key pool notes) — thin daily quota, can run dry on frequent unattended runs. 'claude' — delegates to the local Claude Code subscription (flat-rate, not metered) via the same mechanism as the `claude` MCP tool's `ask` op; no native schema constraint, so output is validated and, on a malformed response, retried on the same session with the validation error appended (up to 3 attempts total) — shares the org-wide 40-session/day delegation budget with every other Claude-delegated task. No default: pick deliberately, there is no provider that is simply better here.",
  model:
    "Optional model override, passed straight to whichever provider is chosen (a Gemini model name when provider=gemini, a Claude model name when provider=claude). Omit to use that provider's own default.",
} as const;

export const SEGMENT_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid segment request parameters",
  GENERIC: "Segment operation failed",
  CLAUDE_INVALID_JSON:
    "Claude did not return valid JSON matching the moments schema after retrying",
} as const;

/** Total attempts (1 initial + retries) before giving up on Claude's structured output. Mirrors VIDEO's Gemini-key-pool retry ceiling of 3. */
export const SEGMENT_CLAUDE_MAX_ATTEMPTS = 3;

/**
 * Per-attempt Claude timeout for ranking a whole episode. The `claude` op
 * default (600 s) is too short: an hour-long episode on 5 s transcript
 * segments runs past it. Still well inside the caller's MCP timeout, and the
 * MCP keepalive holds the call open.
 */
export const SEGMENT_CLAUDE_TIMEOUT_SECONDS = 1500;
