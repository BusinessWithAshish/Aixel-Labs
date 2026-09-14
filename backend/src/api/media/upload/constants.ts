/**
 * Chunked local-file upload — a client drops a file locally and it lands on
 * this backend's persistent disk (`AIXEL_MEDIA.UPLOADS`), surviving a
 * mid-upload backend restart/redeploy because every in-progress session is
 * tracked by files on disk (sidecar JSON + `.part`), not in-memory state.
 */

export const MEDIA_UPLOAD = {
  /** Client-side chunk size hint returned by `init` — 8MB. */
  CHUNK_SIZE: 8 * 1024 * 1024,
  /** How long an upload token stays valid after `init` — 6 hours. */
  TOKEN_TTL_MS: 6 * 60 * 60 * 1000,
} as const;

export const MEDIA_UPLOAD_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  VERCEL:
    "The upload module needs a persistent host with local disk output (not available on Vercel)",
  MISSING_SECRET: "AIXEL_UPLOAD_SECRET is not configured",
  MISSING_TOKEN: "Missing or malformed Authorization header (expected `Bearer {token}`)",
  INVALID_TOKEN: "Invalid or expired upload token",
  UPLOAD_ID_MISMATCH: "Token does not match the uploadId in the URL",
  UPLOAD_NOT_FOUND: "Upload session not found or expired",
  MISSING_CHUNK_OFFSET: "Missing or invalid X-Chunk-Offset header",
  SIZE_MISMATCH:
    "Uploaded bytes do not match the expected size — upload the missing chunks before completing",
  GENERIC: "Upload operation failed",
} as const;
