import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  closeUrlFetchSession,
  createUrlFetchSession,
} from "../../utils/node-tls-client-session-handler";
import {
  TRANSCRIPTION_ERROR_MESSAGES,
  TRANSCRIPTION_GATED_STATUS_CODES,
} from "./constants";

function isGatedStatus(status: number): boolean {
  return (TRANSCRIPTION_GATED_STATUS_CODES as readonly number[]).includes(
    status,
  );
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
 * `website-contacts/crawl.ts`). Buffers the whole file in memory since this
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
 * Downloads a remote file (a Vercel Blob URL, or any other publicly-reachable
 * media URL) to a fresh temp directory.
 *
 * Sends the Blob read-write token as a bearer token so this works whether the
 * store is public or private (private blobs 401 without it) — harmless for
 * non-Blob URLs. If the plain fetch is blocked (network error, or a
 * bot-detection-shaped status), retries once through the TLS-fingerprint
 * session before giving up.
 */
export async function downloadToTempFile(url: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "transcription-"));
  const destPath = join(dir, `source-${randomUUID()}`);
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  let res: FetchResponseLike | undefined;
  let fetchError: unknown;
  try {
    res = (await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })) as unknown as FetchResponseLike;
  } catch (err) {
    fetchError = err;
  }

  const gated =
    fetchError !== undefined || (res !== undefined && isGatedStatus(res.status));

  if (gated) {
    try {
      const buffer = await downloadViaTlsSession(url);
      await writeFile(destPath, buffer);
      return destPath;
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
  return destPath;
}
