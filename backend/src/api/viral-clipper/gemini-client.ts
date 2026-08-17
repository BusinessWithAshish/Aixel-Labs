import { readFile, stat } from "node:fs/promises";

import { Agent } from "undici";
import type { z } from "zod";

import {
  VIRAL_CLIPPER,
  VIRAL_CLIPPER_ERROR_MESSAGES,
  VIRAL_CLIPPER_GEMINI_BASE_URL,
} from "./constants";
import type { GEMINI_ACTIVE_FILE, GEMINI_USAGE_METADATA } from "./types";

/** See the matching note in `transcription/download.ts` — avoids the ambient `Response` name. */
type FetchResponseLike = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

/**
 * Node's global `fetch()` (undici) defaults `headersTimeout`/`bodyTimeout` to
 * 300_000ms (5 min) — too short for `generateContent` on a large audio file,
 * where Gemini itself can legitimately take several minutes to diarize +
 * reason. This is a *client-side outgoing* timeout, distinct from (and not
 * fixed by) `server.requestTimeout` in `server.ts`, which only governs
 * *incoming* requests to our own server.
 */
const GEMINI_FETCH_DISPATCHER = new Agent({
  headersTimeout: 15 * 60 * 1000,
  bodyTimeout: 15 * 60 * 1000,
});

/**
 * Locally-declared, not extending the ambient `RequestInit` — same fix as
 * `FetchResponseLike` above: Vercel's build container resolves a different
 * (incompatible, missing `method`) ambient `RequestInit` than local installs
 * do, since this monorepo has multiple `@types/node` versions in its
 * dependency graph. `dispatcher` itself is a Node/undici extension to the
 * standard `fetch()` options.
 */
type FetchInitWithDispatcher = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  dispatcher?: Agent;
};

function geminiFetch(
  url: string,
  init?: FetchInitWithDispatcher,
): Promise<FetchResponseLike> {
  return fetch(
    url,
    { ...init, dispatcher: GEMINI_FETCH_DISPATCHER } as unknown as RequestInit,
  ) as unknown as Promise<FetchResponseLike>;
}

/**
 * `GEMINI_API_KEY_FREE` may be a single key or a comma-separated list —
 * see `withGeminiKeyPoolRetry` below for how the pool is actually used
 * (fallback to the next key on daily-quota exhaustion, not round-robin).
 * Deliberately never includes `GEMINI_API_KEY` (the paid key) — this
 * project's whole point is staying on genuinely-free, no-billing-account
 * usage; falling back to a paid key silently would violate that without
 * consent.
 */
function getApiKeyPool(): string[] {
  const raw = process.env.GEMINI_API_KEY_FREE;
  const keys = (raw ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length === 0) {
    throw new Error(VIRAL_CLIPPER_ERROR_MESSAGES.MISSING_API_KEY);
  }
  return keys;
}

/**
 * Structured Gemini API error — carries the parsed `code`/`status`/`quotaId`
 * /`retryDelayMs` instead of forcing every caller to re-parse the error
 * message string. See `parseGeminiErrorBody` / `classifyGeminiError`.
 */
export class GeminiApiError extends Error {
  code?: number;
  status?: string;
  quotaId?: string;
  retryDelayMs?: number;

  constructor(
    message: string,
    info: { code?: number; status?: string; quotaId?: string; retryDelayMs?: number },
  ) {
    super(message);
    this.name = "GeminiApiError";
    this.code = info.code;
    this.status = info.status;
    this.quotaId = info.quotaId;
    this.retryDelayMs = info.retryDelayMs;
  }
}

/**
 * Parses Gemini's structured error body, e.g.:
 * `{ code: 429, status: "RESOURCE_EXHAUSTED", details: [
 *     { "@type": ".../QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] },
 *     { "@type": ".../RetryInfo", retryDelay: "36s" } ] }`
 * — the exact shape observed hitting the free tier's daily quota.
 */
function parseGeminiErrorBody(errorBody: unknown): {
  code?: number;
  status?: string;
  quotaId?: string;
  retryDelayMs?: number;
} {
  const body = errorBody as {
    code?: number;
    status?: string;
    details?: { "@type"?: string; violations?: { quotaId?: string }[]; retryDelay?: string }[];
  };
  const details = Array.isArray(body?.details) ? body.details : [];
  const quotaFailure = details.find((d) => d["@type"]?.includes("QuotaFailure"));
  const retryInfo = details.find((d) => d["@type"]?.includes("RetryInfo"));
  const retryDelaySeconds = retryInfo?.retryDelay
    ? Number.parseFloat(retryInfo.retryDelay)
    : undefined;

  return {
    code: body?.code,
    status: body?.status,
    quotaId: quotaFailure?.violations?.[0]?.quotaId,
    retryDelayMs:
      retryDelaySeconds !== undefined && !Number.isNaN(retryDelaySeconds)
        ? Math.ceil(retryDelaySeconds * 1000)
        : undefined,
  };
}

/**
 * Decides how `withGeminiKeyPoolRetry` should react to a failure:
 * - Daily-quota-exhausted (confirmed via quotaId containing "PerDay"): not
 *   retryable on this key at all — retrying can't help until the quota
 *   resets hours from now, so move to the next key in the pool immediately.
 * - Other 429s or 5xx: retryable on the same key, with backoff (Gemini's
 *   own suggested `retryDelayMs` when present, else exponential backoff).
 * - Anything else that isn't a `GeminiApiError` (network blips, timeouts,
 *   upload hiccups, a `GEMINI_EMPTY_RESPONSE`) — treated as retryable by
 *   default, since these look transient far more often than not.
 */
function classifyGeminiError(err: unknown): {
  isDailyQuotaExhausted: boolean;
  isRetryable: boolean;
  retryDelayMs?: number;
} {
  if (!(err instanceof GeminiApiError)) {
    return { isDailyQuotaExhausted: false, isRetryable: true };
  }
  const isDailyQuotaExhausted =
    err.status === "RESOURCE_EXHAUSTED" && !!err.quotaId?.toLowerCase().includes("perday");
  const isServerError = typeof err.code === "number" && err.code >= 500;
  const isOtherRateLimit = err.code === 429 && !isDailyQuotaExhausted;

  return {
    isDailyQuotaExhausted,
    isRetryable: isServerError || isOtherRateLimit,
    retryDelayMs: err.retryDelayMs,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attempt: number): number {
  return Math.min(
    VIRAL_CLIPPER.GEMINI_RETRY_BASE_DELAY_MS * 2 ** attempt,
    VIRAL_CLIPPER.GEMINI_RETRY_MAX_DELAY_MS,
  );
}

/**
 * Runs `operation` once per (key, attempt) combination until it succeeds,
 * the key pool is exhausted, or a non-retryable error is hit. `operation`
 * receives one `apiKey` and must use that SAME key for every Gemini call it
 * makes internally (a file uploaded with key A can't be referenced with key
 * B — they belong to different Google Cloud projects) — this is why
 * key-pool retry wraps a whole "upload + wait ACTIVE + generateContent"
 * unit in diarize.ts/viral-moments.ts, not individual HTTP calls.
 */
export async function withGeminiKeyPoolRetry<T>(
  operation: (apiKey: string) => Promise<T>,
  context: string,
): Promise<T> {
  const keys = getApiKeyPool();
  let lastError: unknown;

  for (const apiKey of keys) {
    for (let attempt = 0; attempt < VIRAL_CLIPPER.GEMINI_MAX_ATTEMPTS_PER_KEY; attempt++) {
      try {
        return await operation(apiKey);
      } catch (err) {
        lastError = err;
        const info = classifyGeminiError(err);
        if (info.isDailyQuotaExhausted) {
          break; // this key is done for today — move to the next key now
        }
        const isLastAttemptOnThisKey = attempt === VIRAL_CLIPPER.GEMINI_MAX_ATTEMPTS_PER_KEY - 1;
        if (info.isRetryable && !isLastAttemptOnThisKey) {
          await sleep(info.retryDelayMs ?? backoffDelayMs(attempt));
          continue;
        }
        break; // non-retryable, or out of attempts on this key
      }
    }
  }

  const lastMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `${VIRAL_CLIPPER_ERROR_MESSAGES.GEMINI_KEY_POOL_EXHAUSTED} (${context}) — tried ${keys.length} key(s): ${lastMessage}`,
  );
}

/** Uploads a local file to Gemini's File API (resumable protocol) and returns the file resource. */
export async function uploadFileToGemini(
  filePath: string,
  mimeType: string,
  apiKey: string,
): Promise<{ name: string }> {
  const { size } = await stat(filePath);

  const startRes = await geminiFetch(
    `${VIRAL_CLIPPER_GEMINI_BASE_URL}/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(size),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: filePath.split("/").pop() } }),
    },
  );

  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    const body = await startRes.text().catch(() => "");
    throw new Error(
      `${VIRAL_CLIPPER_ERROR_MESSAGES.GEMINI_UPLOAD_FAILED}: no upload URL (${startRes.status} ${body})`,
    );
  }

  const data = await readFile(filePath);
  const uploadRes = await geminiFetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: data,
  });

  const fileInfo = (await uploadRes.json()) as { file?: { name: string }; error?: unknown };
  if (fileInfo.error) {
    const info = parseGeminiErrorBody(fileInfo.error);
    throw new GeminiApiError(
      `${VIRAL_CLIPPER_ERROR_MESSAGES.GEMINI_UPLOAD_FAILED}: ${JSON.stringify(fileInfo.error)}`,
      info,
    );
  }
  if (!fileInfo.file) {
    throw new Error(`${VIRAL_CLIPPER_ERROR_MESSAGES.GEMINI_UPLOAD_FAILED}: ${JSON.stringify(fileInfo)}`);
  }
  return fileInfo.file;
}

/**
 * Polls a Gemini file resource until it's ACTIVE (post-upload processing)
 * or times out. A single poll GET failing (network blip) no longer crashes
 * the whole wait — it's treated as one failed poll attempt and retried,
 * same as a "not yet ACTIVE" response, up to the same attempt budget. This
 * avoids forcing a full re-upload (in the outer `withGeminiKeyPoolRetry`)
 * over what's often just a transient hiccup mid-poll.
 */
export async function waitForGeminiFileActive(
  fileName: string,
  apiKey: string,
): Promise<GEMINI_ACTIVE_FILE> {
  let lastPollError: unknown;

  for (let attempt = 0; attempt < VIRAL_CLIPPER.FILE_ACTIVE_POLL_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await geminiFetch(
        `${VIRAL_CLIPPER_GEMINI_BASE_URL}/v1beta/${fileName}?key=${apiKey}`,
      );
      const info = (await res.json()) as GEMINI_ACTIVE_FILE & { error?: unknown };

      if (info.state === "ACTIVE") return info;
      if (info.state === "FAILED") {
        throw new Error(
          `${VIRAL_CLIPPER_ERROR_MESSAGES.GEMINI_FILE_NOT_ACTIVE}: ${JSON.stringify(info)}`,
        );
      }
      lastPollError = undefined;
    } catch (err) {
      lastPollError = err;
    }
    await sleep(VIRAL_CLIPPER.FILE_ACTIVE_POLL_INTERVAL_MS);
  }

  const suffix = lastPollError instanceof Error ? `: ${lastPollError.message}` : "";
  throw new Error(`${VIRAL_CLIPPER_ERROR_MESSAGES.GEMINI_FILE_NOT_ACTIVE}${suffix}`);
}

export type GeminiGenerateContentPart =
  | { text: string }
  | { file_data: { mime_type: string; file_uri: string } };

/**
 * Gemini's own `finishReason` for why generation stopped. "STOP" is a normal
 * completion; anything else means the response is not what it looks like —
 * "MAX_TOKENS" in particular can still produce syntactically-valid JSON (the
 * decoder closes out open structures near the limit), so a truncated
 * transcript can silently parse as if it were a complete one unless this is
 * checked explicitly.
 */
type GeminiFinishReason =
  | "STOP"
  | "MAX_TOKENS"
  | "SAFETY"
  | "RECITATION"
  | "OTHER"
  | string;

/**
 * Gemini 3.x "thinking" tokens are billed AND counted against the same
 * `maxOutputTokens` ceiling as the actual visible response — confirmed via
 * observed usage (thoughtsTokenCount was ~60% of the combined budget on a
 * diarization call) and independently documented (e.g.
 * github.com/googleapis/python-genai#2062). For a perception/labeling task
 * like transcription, deep deliberation isn't needed, so pinning this low
 * frees most of the ceiling for the actual transcript instead. Gemini 3.x
 * uses `thinkingLevel` (not the legacy numeric `thinkingBudget` — the two
 * are mutually exclusive per Gemini's docs).
 */
export type GeminiThinkingLevel = "minimal" | "low" | "medium" | "high";

/** Calls `generateContent` with a JSON `responseSchema` and returns the parsed + validated object + usage. */
export async function generateStructuredContent<T>(options: {
  model: string;
  parts: GeminiGenerateContentPart[];
  responseSchema: object;
  apiKey: string;
  /** Omit to use the model's default thinking behavior. */
  thinkingLevel?: GeminiThinkingLevel;
  /**
   * Validates the parsed JSON against this schema before trusting it —
   * Gemini's `responseSchema` constrains generation but isn't a hard
   * guarantee (we've seen it omit a "required" field in practice). Highly
   * recommended for anything consumed downstream without re-checking every
   * field. Omit only for call sites that already validate defensively.
   */
  zodValidator?: z.ZodType<T>;
}): Promise<{ data: T; usage: GEMINI_USAGE_METADATA }> {
  const res = await geminiFetch(
    `${VIRAL_CLIPPER_GEMINI_BASE_URL}/v1beta/models/${options.model}:generateContent?key=${options.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: options.parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: options.responseSchema,
          // Explicit, generous ceiling — long (60-90min+) episodes produce
          // long transcripts, and Gemini's un-set default has been observed
          // to truncate mid-transcript on those (see finishReason check below).
          maxOutputTokens: 65536,
          ...(options.thinkingLevel
            ? { thinkingConfig: { thinkingLevel: options.thinkingLevel } }
            : {}),
        },
      }),
    },
  );

  const genData = (await res.json()) as {
    error?: unknown;
    usageMetadata?: GEMINI_USAGE_METADATA;
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: GeminiFinishReason;
    }[];
  };

  if (genData.error) {
    const info = parseGeminiErrorBody(genData.error);
    throw new GeminiApiError(
      `${VIRAL_CLIPPER_ERROR_MESSAGES.GEMINI_REQUEST_FAILED}: ${JSON.stringify(genData.error)}`,
      info,
    );
  }

  const candidate = genData.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(VIRAL_CLIPPER_ERROR_MESSAGES.GEMINI_EMPTY_RESPONSE);
  }

  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw new Error(
      `${VIRAL_CLIPPER_ERROR_MESSAGES.GEMINI_TRUNCATED_RESPONSE}: finishReason=${candidate.finishReason}, usage=${JSON.stringify(genData.usageMetadata ?? {})} — the response may look like valid JSON but is incomplete (e.g. a transcript that silently stops partway through a long episode). Not safe to use.`,
    );
  }

  const parsed: unknown = JSON.parse(text);
  const usage = genData.usageMetadata ?? {};

  if (options.zodValidator) {
    const result = options.zodValidator.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `${VIRAL_CLIPPER_ERROR_MESSAGES.GEMINI_MALFORMED_RESPONSE}: ${result.error.message}`,
      );
    }
    return { data: result.data, usage };
  }

  return { data: parsed as T, usage };
}
