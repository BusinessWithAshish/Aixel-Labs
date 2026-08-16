import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { Agent } from "undici";

import { VIRAL_CLIPPER_ERROR_MESSAGES } from "./constants";

/** See the matching note in `transcription/download.ts` — avoids the ambient `Response` name. */
type FetchResponseLike = {
  ok: boolean;
  status: number;
  statusText: string;
  body: unknown;
};

/**
 * Same fix as `gemini-client.ts` — undici's default `headersTimeout`/
 * `bodyTimeout` on `fetch()` is 300_000ms (5 min), which a large video
 * download can exceed on a slow/throttled connection well before the actual
 * transfer stalls (observed: a 238MB video download killed mid-stream by
 * this default, with ~64MB successfully read — the connection was healthy,
 * just slower than the 5-minute ceiling). `dispatcher` is a Node/undici
 * extension to the standard `fetch()` options.
 */
const DOWNLOAD_FETCH_DISPATCHER = new Agent({
  headersTimeout: 15 * 60 * 1000,
  bodyTimeout: 15 * 60 * 1000,
});

/**
 * Downloads a remote file — audio or video, a Vercel Blob URL or any other
 * publicly-reachable URL — to a fresh temp directory. Sends the Blob
 * read-write token as a bearer token so this works whether the store is
 * public or private — harmless for non-Blob URLs. Content-agnostic: used by
 * both `diarize.ts` (audio) and `cut.ts` (video).
 */
export async function downloadBlobToTempFile(url: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "viral-clipper-"));
  const destPath = join(dir, `source-${randomUUID()}`);
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  const res = (await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    dispatcher: DOWNLOAD_FETCH_DISPATCHER,
  } as unknown as RequestInit)) as unknown as FetchResponseLike;

  if (!res.ok || !res.body) {
    throw new Error(
      `${VIRAL_CLIPPER_ERROR_MESSAGES.DOWNLOAD_FAILED}: ${res.status} ${res.statusText}`,
    );
  }

  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(destPath),
  );
  return destPath;
}
