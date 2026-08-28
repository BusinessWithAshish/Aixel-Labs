import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  closeUrlFetchSession,
  createUrlFetchSession,
} from "../../utils/node-tls-client-session-handler";
import { IS_VERCEL_RUNTIME } from "../../config";
import {
  TRANSCRIPTION_ERROR_MESSAGES,
  TRANSCRIPTION_GATED_STATUS_CODES,
} from "./constants";

function isGatedStatus(status: number): boolean {
  return (TRANSCRIPTION_GATED_STATUS_CODES as readonly number[]).includes(
    status,
  );
}

function isRemoteUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

/**
 * Local shape for the bits of `fetch()`'s result we actually use. Deliberately
 * not named `Response` / typed off `ReturnType<typeof fetch>` — this monorepo
 * has multiple conflicting `@types/node` versions in its dependency graph, and
 * builds have failed with the ambient global `Response` interface resolving
 * incomplete (missing `status`/`ok`/`body`/etc). Casting into this local type
 * sidesteps that ambient lookup entirely.
 */
type FetchResponseLike = {
  ok: boolean;
  status: number;
  statusText: string;
  body: unknown;
};

/**
 * Fallback for sources that block a plain `fetch()` (bot detection, WAF
 * challenges, rate limiting) — same browser-fingerprint TLS client used
 * elsewhere in this backend for scraping (`gsearch/http.ts`,
 * `crawl/crawl.ts`). Buffers the whole file in memory since this
 * client has no binary streaming API; only hit on the gated-response path.
 */
async function downloadViaTlsSession(url: string): Promise<Buffer> {
  const session = await createUrlFetchSession();
  try {
    const response = await session.get(url, {
      followRedirects: true,
      byteResponse: true,
    });
    if (!response.ok) {
      throw new Error(`TLS fallback download returned ${response.status}`);
    }
    // `byteResponse` returns a data URI (`data:<mime>;base64,<payload>`), not bare base64.
    const base64Payload = response.body.replace(/^data:[^;]*;base64,/, "");
    return Buffer.from(base64Payload, "base64");
  } finally {
    await closeUrlFetchSession(session);
  }
}

/**
 * Downloads a remote file (any publicly-reachable media URL) to a fresh temp
 * directory. If the plain fetch is blocked (network error, or a
 * bot-detection-shaped status), retries once through the TLS-fingerprint
 * session before giving up.
 */
async function downloadRemoteToTempFile(url: string, destPath: string): Promise<void> {
  let res: FetchResponseLike | undefined;
  let fetchError: unknown;
  try {
    res = (await fetch(url)) as unknown as FetchResponseLike;
  } catch (err) {
    fetchError = err;
  }

  const gated =
    fetchError !== undefined || (res !== undefined && isGatedStatus(res.status));

  if (gated) {
    try {
      const buffer = await downloadViaTlsSession(url);
      await writeFile(destPath, buffer);
      return;
    } catch (fallbackErr) {
      const primary =
        fetchError instanceof Error
          ? fetchError.message
          : res
            ? `${res.status} ${res.statusText}`
            : "unknown error";
      const fallbackMsg =
        fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(
        `${TRANSCRIPTION_ERROR_MESSAGES.DOWNLOAD_FAILED}: ${primary} (TLS fallback also failed: ${fallbackMsg})`,
      );
    }
  }

  if (!res || !res.ok || !res.body) {
    const detail = res ? `${res.status} ${res.statusText}` : String(fetchError);
    throw new Error(`${TRANSCRIPTION_ERROR_MESSAGES.DOWNLOAD_FAILED}: ${detail}`);
  }

  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(destPath),
  );
}

export type RESOLVED_MEDIA_SOURCE = {
  /** Local path to the actual media file — the caller's own path (untouched) or a freshly-downloaded copy. */
  path: string;
  /** A fresh, empty temp directory for this operation's own derived files — always safe to delete in full. */
  workDir: string;
  /** True when `path` lives inside `workDir` (we downloaded it ourselves) — false when it's the caller's own file living outside our control, which must never be deleted by us. */
  ownsSource: boolean;
};

/**
 * Resolves a "media source" — either a local filesystem path (used in place,
 * never copied or deleted — the expected case when Hermes and this backend
 * share the VPS's filesystem) or an http(s) URL (downloaded to a fresh temp
 * directory this function owns, with the TLS-fingerprint fallback above). No
 * Vercel Blob or any other storage-specific handling.
 *
 * Local paths only resolve on a host that shares the caller's filesystem.
 * When `IS_VERCEL_RUNTIME` is true there is no such filesystem, so a local
 * path is rejected immediately with a clear error instead of attempting
 * `access()` and surfacing a misleading "file not found".
 */
export async function resolveMediaSource(source: string): Promise<RESOLVED_MEDIA_SOURCE> {
  if (!isRemoteUrl(source)) {
    if (IS_VERCEL_RUNTIME) {
      throw new Error(
        `${TRANSCRIPTION_ERROR_MESSAGES.LOCAL_PATH_ON_VERCEL}: ${source}`,
      );
    }
    try {
      await access(source);
    } catch {
      throw new Error(
        `${TRANSCRIPTION_ERROR_MESSAGES.DOWNLOAD_FAILED}: local file not found: ${source}`,
      );
    }
    const workDir = await mkdtemp(join(tmpdir(), "transcription-"));
    return { path: source, workDir, ownsSource: false };
  }

  const workDir = await mkdtemp(join(tmpdir(), "transcription-"));
  const destPath = join(workDir, `source-${randomUUID()}`);
  await downloadRemoteToTempFile(source, destPath);
  return { path: destPath, workDir, ownsSource: true };
}

/**
 * Cleans up after `resolveMediaSource` — always removes `workDir` in full.
 * A downloaded file lives inside `workDir` (so this covers it too); a
 * local-path input lives outside `workDir` entirely and is never touched.
 */
export async function cleanupResolvedMediaSource(resolved: RESOLVED_MEDIA_SOURCE): Promise<void> {
  await rm(resolved.workDir, { recursive: true, force: true }).catch(() => {});
}
