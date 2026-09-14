import crypto from "node:crypto";

import { MEDIA_UPLOAD, MEDIA_UPLOAD_ERROR_MESSAGES } from "./constants";

/**
 * Auth/validation failures for the chunked-upload flow — carries its own
 * `statusCode` so `statusCodeFromError` (config.ts) picks it up the same way
 * it does `YoutubeDownloadError`/`YoutubeVideoError` etc.
 */
export class UploadAuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: 401 | 500,
  ) {
    super(message);
    this.name = "UploadAuthError";
  }
}

function getSecret(): string {
  const secret = process.env.AIXEL_UPLOAD_SECRET;
  if (!secret) {
    throw new UploadAuthError(MEDIA_UPLOAD_ERROR_MESSAGES.MISSING_SECRET, 500);
  }
  return secret;
}

function sign(uploadId: string, exp: number, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${uploadId}.${exp}`)
    .digest("base64url");
}

/** Mints `token = "{uploadId}.{exp}.{sigBase64Url}"`, `exp` = now + 6h. Called once, from `init`. */
export function createUploadToken(uploadId: string): { token: string; exp: number } {
  const secret = getSecret();
  const exp = Date.now() + MEDIA_UPLOAD.TOKEN_TTL_MS;
  const sig = sign(uploadId, exp, secret);
  return { token: `${uploadId}.${exp}.${sig}`, exp };
}

/**
 * Verifies the `Authorization: Bearer {token}` header against `routeUploadId`
 * (the `:uploadId` route param). Throws {@link UploadAuthError} (401) on any
 * mismatch, tamper, or expiry, and (500) if the HMAC secret isn't configured.
 * Constant-time signature compare via `crypto.timingSafeEqual`.
 */
export function verifyUploadToken(
  authorizationHeader: string | undefined,
  routeUploadId: string,
): void {
  const secret = getSecret();

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    throw new UploadAuthError(MEDIA_UPLOAD_ERROR_MESSAGES.MISSING_TOKEN, 401);
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new UploadAuthError(MEDIA_UPLOAD_ERROR_MESSAGES.INVALID_TOKEN, 401);
  }

  const [uploadId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!uploadId || !sig || !Number.isFinite(exp)) {
    throw new UploadAuthError(MEDIA_UPLOAD_ERROR_MESSAGES.INVALID_TOKEN, 401);
  }

  if (uploadId !== routeUploadId) {
    throw new UploadAuthError(MEDIA_UPLOAD_ERROR_MESSAGES.UPLOAD_ID_MISMATCH, 401);
  }

  if (Date.now() > exp) {
    throw new UploadAuthError(MEDIA_UPLOAD_ERROR_MESSAGES.INVALID_TOKEN, 401);
  }

  const expectedSig = sign(uploadId, exp, secret);
  const expectedBuf = Buffer.from(expectedSig);
  const actualBuf = Buffer.from(sig);

  const signatureMatches =
    expectedBuf.length === actualBuf.length &&
    crypto.timingSafeEqual(expectedBuf, actualBuf);

  if (!signatureMatches) {
    throw new UploadAuthError(MEDIA_UPLOAD_ERROR_MESSAGES.INVALID_TOKEN, 401);
  }
}
