import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdtemp, rm } from "node:fs/promises";
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

function isRemoteUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

export type RESOLVED_MEDIA_SOURCE = {
  /** Local path to the actual media file — the caller's own path (untouched) or a freshly-downloaded copy. */
  path: string;
  /** A fresh, empty temp directory for this operation's own derived files (audio chunks, reference clips, etc.) — always safe to delete in full. */
  workDir: string;
  /** True when `path` lives inside `workDir` (we downloaded it ourselves) — false when it's the caller's own file living outside our control, which must never be deleted by us. */
  ownsSource: boolean;
};

/**
 * Resolves an "audio/video source" — either a local filesystem path (used
 * in place, never copied or deleted) or an http(s) URL (downloaded to a
 * fresh temp directory this function owns). No Vercel Blob or any other
 * storage-specific handling: this pipeline runs on a VPS with its own
 * persistent disk, and its main caller (Hermes, on the same machine) will
 * usually already have a local path — passing that straight through skips
 * an upload/download round-trip entirely. The URL path still works for
 * anything that genuinely only has a remote link.
 */
export async function resolveMediaSource(source: string): Promise<RESOLVED_MEDIA_SOURCE> {
  if (!isRemoteUrl(source)) {
    try {
      await access(source);
    } catch {
      throw new Error(
        `${VIRAL_CLIPPER_ERROR_MESSAGES.DOWNLOAD_FAILED}: local file not found: ${source}`,
      );
    }
    const workDir = await mkdtemp(join(tmpdir(), "viral-clipper-"));
    return { path: source, workDir, ownsSource: false };
  }

  const workDir = await mkdtemp(join(tmpdir(), "viral-clipper-"));
  const destPath = join(workDir, `source-${randomUUID()}`);

  const res = (await fetch(source, {
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
