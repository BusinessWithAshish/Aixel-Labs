import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { Agent } from "undici";

import { IS_VERCEL_RUNTIME } from "../../config";
import {
  closeUrlFetchSession,
  createUrlFetchSession,
} from "../../utils/node-tls-client-session-handler";
import {
  MEDIA_ERROR_MESSAGES,
  MEDIA_FETCH_EXTENSION_BY_CONTENT_TYPE,
  MEDIA_GATED_STATUS_CODES,
} from "./constants";
import { getYoutubeStreamUrls } from "../youtube/download/helpers";
import { parseYoutubeVideoId, resolveYoutubeGeo } from "../youtube/helpers";

/** See the matching note in `transcribe/groq-client.ts` — avoids the ambient `Response` name. */
type FetchResponseLike = {
  ok: boolean;
  status: number;
  statusText: string;
  body: unknown;
  headers: { get(name: string): string | null };
};

/**
 * A URL that's supposed to point at media returning `text/html` (or any
 * other `text/*`) is never actually media — it's a login wall, a webpage
 * that merely embeds a video, or (concretely, the case this exists for) a
 * plain URL fetch on a link whose real content only a dedicated downloader
 * knows how to reach, e.g. a YouTube watch page. This is deliberately a
 * generic content-type check, not YouTube-awareness: it has no idea what
 * YouTube is, it just refuses to accept a webpage as a media file — which
 * happens to make a YouTube link fail here exactly as loudly as a
 * non-YouTube link fails against `youtube` op=video_download, without this
 * module ever recognizing YouTube's URL shape to do it.
 */
function isHtmlContentType(contentType: string | null): boolean {
  return /^text\//i.test((contentType ?? "").split(";")[0].trim());
}

/**
 * Same fix as `gemini-client.ts` — undici's default `headersTimeout`/
 * `bodyTimeout` on `fetch()` is 300_000ms (5 min), which a large media
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

export function isRemoteUrl(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

function isGatedStatus(status: number): boolean {
  return (MEDIA_GATED_STATUS_CODES as readonly number[]).includes(status);
}

/**
 * Fallback for sources that block a plain `fetch()` (bot detection, WAF
 * challenges, rate limiting) — same browser-fingerprint TLS client used
 * elsewhere in this backend for scraping (`gsearch/http.ts`, `crawl/crawl.ts`).
 * Buffers the whole file in memory since this client has no binary streaming
 * API; only hit on the gated-response path. Folded in from the old
 * `transcription/download.ts` so every caller through `resolveMediaSource`
 * gets it, not just transcribe.
 */
async function downloadViaTlsSession(
  url: string,
): Promise<{ buffer: Buffer; contentType: string | null }> {
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
    const mimeMatch = response.body.match(/^data:([^;]*);base64,/);
    const contentType = mimeMatch?.[1] ?? null;
    if (isHtmlContentType(contentType)) {
      throw new Error(
        `source returned ${contentType ?? "an unknown content type"} — this looks like a webpage, not media`,
      );
    }
    const base64Payload = response.body.replace(/^data:[^;]*;base64,/, "");
    return { buffer: Buffer.from(base64Payload, "base64"), contentType };
  } finally {
    await closeUrlFetchSession(session);
  }
}

/** `imageOnly` rejects unless the content-type is one of the known image types — bare (parameters stripped), case-insensitive. */
function assertImageContentType(contentType: string | null, imageOnly?: boolean): void {
  if (!imageOnly) return;
  const bare = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (!MEDIA_FETCH_EXTENSION_BY_CONTENT_TYPE[bare]) {
    throw new Error(MEDIA_ERROR_MESSAGES.FETCH_NOT_IMAGE);
  }
}

/**
 * Downloads a remote file to `destPath`. If the plain fetch is blocked
 * (network error, or a bot-detection-shaped status), retries once through
 * the TLS-fingerprint session before giving up. `maxBytes` is checked
 * against a declared Content-Length up front when the server sends one, and
 * against the real file size after writing either way — the latter is a
 * backstop, not a streaming cutoff, so a server that lies about its length
 * still gets fully downloaded before being rejected; fine for the
 * image-staging sizes this is meant for, not a substitute for a hard cap on
 * arbitrary large media.
 */
async function downloadRemoteToFile(
  url: string,
  destPath: string,
  opts: { imageOnly?: boolean; maxBytes?: number } = {},
): Promise<{ contentType: string | null; sizeBytes: number }> {
  let res: FetchResponseLike | undefined;
  let fetchError: unknown;
  try {
    res = (await fetch(url, {
      dispatcher: DOWNLOAD_FETCH_DISPATCHER,
    } as unknown as RequestInit)) as unknown as FetchResponseLike;
  } catch (err) {
    fetchError = err;
  }

  const gated =
    fetchError !== undefined || (res !== undefined && isGatedStatus(res.status));

  if (gated) {
    try {
      const fallback = await downloadViaTlsSession(url);
      assertImageContentType(fallback.contentType, opts.imageOnly);
      if (opts.maxBytes && fallback.buffer.byteLength > opts.maxBytes) {
        throw new Error(MEDIA_ERROR_MESSAGES.FETCH_TOO_LARGE);
      }
      await writeFile(destPath, fallback.buffer);
      return { contentType: fallback.contentType, sizeBytes: fallback.buffer.byteLength };
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
        `${MEDIA_ERROR_MESSAGES.DOWNLOAD_FAILED}: ${primary} (TLS fallback also failed: ${fallbackMsg})`,
      );
    }
  }

  if (!res || !res.ok || !res.body) {
    const detail = res ? `${res.status} ${res.statusText}` : String(fetchError);
    throw new Error(`${MEDIA_ERROR_MESSAGES.DOWNLOAD_FAILED}: ${detail}`);
  }

  const contentType = res.headers.get("content-type");
  if (isHtmlContentType(contentType)) {
    throw new Error(
      `${MEDIA_ERROR_MESSAGES.DOWNLOAD_FAILED}: source returned ${contentType} — this looks like a webpage, not media. ` +
        `A link that needs a dedicated downloader (e.g. a YouTube URL) belongs to that platform's own tool, not a generic fetch.`,
    );
  }
  assertImageContentType(contentType, opts.imageOnly);

  const declaredLength = Number(res.headers.get("content-length") || "");
  if (opts.maxBytes && Number.isFinite(declaredLength) && declaredLength > opts.maxBytes) {
    throw new Error(MEDIA_ERROR_MESSAGES.FETCH_TOO_LARGE);
  }

  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(destPath),
  );

  const sizeBytes = (await stat(destPath)).size;
  if (opts.maxBytes && sizeBytes > opts.maxBytes) {
    await rm(destPath, { force: true });
    throw new Error(MEDIA_ERROR_MESSAGES.FETCH_TOO_LARGE);
  }

  return { contentType, sizeBytes };
}

export type RESOLVED_MEDIA_SOURCE = {
  /** Local path to the actual media file — the caller's own path (untouched) or a freshly-downloaded copy. */
  path: string;
  /**
   * A fresh, empty temp directory — always created, even for a local-path
   * input. Not just download bookkeeping: callers (diarize's chunking,
   * transcribe's normalized-audio step) use it as scratch space for their
   * OWN derived files regardless of where the source file itself came from.
   * Always safe to delete in full via `cleanupResolvedMediaSource`.
   */
  workDir: string;
  /** True when we downloaded the file ourselves — false when it's the caller's own local path, which must never be deleted by us. */
  ownsSource: boolean;
};

/**
 * Resolves an "audio/video source" to a local file — either a local
 * filesystem path (used in place, never copied or deleted) or an http(s)
 * URL (downloaded, with a TLS-fingerprint fallback for sources that block a
 * plain fetch). No Vercel Blob or any other storage-specific handling: this
 * pipeline runs on a VPS with its own persistent disk, and its main caller
 * (Hermes, on the same machine) will usually already have a local path —
 * passing that straight through skips a download round-trip entirely.
 *
 * Deliberately knows nothing about YouTube — a YouTube link is just another
 * remote URL here, and downloading its watch page will fail (not serve
 * media bytes). Getting a YouTube video onto local disk is the `youtube`
 * domain's job (its own download op); hand this function the resulting
 * local path afterward. Keeping that boundary means this function, and
 * everything built on it (fetch, diarize's Gemini-audio path, transcribe),
 * never has to guess whether a URL is "really" a YouTube link in disguise.
 *
 * For a persistent (not scratch) download — `fetch`'s own case — see
 * `downloadToFixedDir` below instead; it deliberately does NOT reuse this
 * function's `workDir`/cleanup contract, since a file meant to persist must
 * never be reachable from `cleanupResolvedMediaSource`'s `rm -rf`.
 */
export async function resolveMediaSource(source: string): Promise<RESOLVED_MEDIA_SOURCE> {
  if (!isRemoteUrl(source)) {
    if (IS_VERCEL_RUNTIME) {
      throw new Error(`${MEDIA_ERROR_MESSAGES.LOCAL_PATH_ON_VERCEL}: ${source}`);
    }
    try {
      await access(source);
    } catch {
      throw new Error(
        `${MEDIA_ERROR_MESSAGES.DOWNLOAD_FAILED}: local file not found: ${source}`,
      );
    }
    const workDir = await mkdtemp(join(tmpdir(), "media-"));
    return { path: source, workDir, ownsSource: false };
  }

  const workDir = await mkdtemp(join(tmpdir(), "media-"));
  const destPath = join(workDir, `source-${randomUUID()}`);
  await downloadRemoteToFile(source, destPath);
  return { path: destPath, workDir, ownsSource: true };
}

/**
 * `fetch`'s own download path: a local input passes through untouched (no
 * directory involved at all); a remote URL downloads straight into `destDir`
 * — a fixed, persistent folder the caller manages — rather than the scratch
 * temp dir `resolveMediaSource` creates. No `workDir`, no `ownsSource`, no
 * relationship to `cleanupResolvedMediaSource`: nothing here is ever meant
 * to be deleted by this module, so there is nothing to accidentally delete.
 *
 * `opts.imageOnly`/`opts.maxBytes` (both optional, off by default so plain
 * media fetches are unaffected) turn on the validation `chatgpt`'s old
 * `stage_image` op used to do on its own, redundantly, with a weaker plain
 * `fetch()` that lacked this function's TLS-fingerprint fallback for gated
 * CDNs — folded in here instead of staying a second implementation.
 */
export async function downloadToFixedDir(
  source: string,
  destDir: string,
  opts: { imageOnly?: boolean; maxBytes?: number } = {},
): Promise<{ path: string; contentType?: string; sizeBytes?: number }> {
  if (!isRemoteUrl(source)) {
    if (IS_VERCEL_RUNTIME) {
      throw new Error(`${MEDIA_ERROR_MESSAGES.LOCAL_PATH_ON_VERCEL}: ${source}`);
    }
    try {
      await access(source);
    } catch {
      throw new Error(
        `${MEDIA_ERROR_MESSAGES.DOWNLOAD_FAILED}: local file not found: ${source}`,
      );
    }
    return { path: source };
  }

  await mkdir(destDir, { recursive: true });
  // Extension depends on the response's content-type, which we only know
  // once the download starts — write under a provisional name, then rename
  // once known. `imageOnly` guarantees a recognized type (or throws); a
  // plain fetch just leaves the file unnamed when the type isn't recognized,
  // same as always.
  const provisional = join(destDir, `source-${randomUUID()}`);
  const { contentType, sizeBytes } = await downloadRemoteToFile(source, provisional, opts);

  const bare = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = MEDIA_FETCH_EXTENSION_BY_CONTENT_TYPE[bare];
  if (!ext) return { path: provisional, contentType: contentType ?? undefined, sizeBytes };

  const finalPath = `${provisional}.${ext}`;
  await rename(provisional, finalPath);
  return { path: finalPath, contentType: contentType ?? undefined, sizeBytes };
}

/**
 * Cleans up after `resolveMediaSource` — removes `workDir` in full when one
 * was created. A downloaded file lives inside `workDir` (so this covers it
 * too); a local-path input has no `workDir` at all and is never touched. A
 * no-op when `resolveMediaSource` was called with `destDir` — that file is
 * meant to persist, not be cleaned up here.
 */
export async function cleanupResolvedMediaSource(resolved: {
  workDir?: string;
}): Promise<void> {
  if (!resolved.workDir) return;
  await rm(resolved.workDir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Source resolved for the clip path. Discriminated by `kind`:
 *  - `"file"` — a local file on disk (caller's own path, or a freshly
 *    downloaded copy for a non-YouTube remote URL). ffmpeg cuts from it
 *    directly. Same shape as `RESOLVED_MEDIA_SOURCE`.
 *  - `"youtube"` — a YouTube source resolved to signed googlevideo stream
 *    URLs (video + audio) plus the Evomi proxy URL, with NO media bytes
 *    downloaded. ffmpeg cuts clips directly from the stream URLs with
 *    `-http_proxy` set to `proxyUrl`, so only the clip segments transit the
 *    residential proxy — not the whole source video. This is the
 *    stream-direct path that keeps the clipper from burning proxy bandwidth
 *    on full-video downloads (see README → "Stream-direct clip extraction").
 *
 * This function (unlike `resolveMediaSource` above) still knows about
 * YouTube directly — deliberately, and deliberately not touched in the
 * fetch/diarize/transcribe cleanup pass. The stream-direct optimization has
 * no equivalent for a plain remote URL (there's nothing to stream-direct
 * without YouTube's signed CDN URLs), so `cut` earns the exception. Revisit
 * this the same way if/when `cut` itself gets generalized.
 */
export type RESOLVED_VIDEO_SOURCE_FOR_CUT =
  | {
      kind: "file";
      /** Local path to the media file — caller's own path (untouched) or a freshly-downloaded copy. */
      path: string;
      /** Fresh temp dir for this operation's derived files (clips, etc.) — always safe to delete in full. */
      workDir: string;
      /** True when `path` lives inside `workDir` (we downloaded it ourselves). */
      ownsSource: boolean;
    }
  | {
      kind: "youtube";
      videoId: string;
      title: string;
      /** Source duration in seconds (from InnerTube — no ffmpeg probe needed). */
      durationSeconds: number;
      /** Deciphered, signed googlevideo URL for the best adaptive video-only stream. */
      videoUrl: string;
      /** Deciphered, signed googlevideo URL for the best adaptive audio-only stream. */
      audioUrl: string;
      /** Evomi proxy URL for ffmpeg's `-http_proxy` (undefined when Evomi isn't configured → direct fetch). */
      proxyUrl?: string;
      /** Fresh temp dir for this operation's derived files (clips, etc.) — always safe to delete in full. */
      workDir: string;
    };

/**
 * Resolves a video source for the clip path. YouTube sources take the
 * stream-direct path (URLs + proxy, no download); local files and
 * non-YouTube remote URLs fall back to the file path (current behavior).
 * `country` defaults to `YOUTUBE_DEFAULT_COUNTRY` via `resolveYoutubeGeo`
 * and routes the Evomi residential proxy egress.
 */
export async function resolveVideoSourceForCut(
  source: string,
  country?: string,
): Promise<RESOLVED_VIDEO_SOURCE_FOR_CUT> {
  if (!isRemoteUrl(source)) {
    try {
      await access(source);
    } catch {
      throw new Error(
        `${MEDIA_ERROR_MESSAGES.DOWNLOAD_FAILED}: local file not found: ${source}`,
      );
    }
    const workDir = await mkdtemp(join(tmpdir(), "media-"));
    return { kind: "file", path: source, workDir, ownsSource: false };
  }

  const youtubeVideoId = parseYoutubeVideoId(source);
  if (youtubeVideoId) {
    const { country: resolvedCountry } = resolveYoutubeGeo({ country });
    const streams = await getYoutubeStreamUrls(youtubeVideoId, resolvedCountry);
    const workDir = await mkdtemp(join(tmpdir(), "media-"));
    return {
      kind: "youtube",
      videoId: streams.videoId,
      title: streams.title,
      durationSeconds: streams.durationSeconds,
      videoUrl: streams.videoUrl,
      audioUrl: streams.audioUrl,
      // Reuse the SAME Evomi session/IP that signed the stream URLs — a
      // different exit IP makes googlevideo 403 the fetch.
      proxyUrl: streams.proxyUrl,
      workDir,
    };
  }

  // Non-YouTube remote URL: download to a local file (current behavior).
  const workDir = await mkdtemp(join(tmpdir(), "media-"));
  const destPath = join(workDir, `source-${randomUUID()}`);

  const res = (await fetch(source, {
    dispatcher: DOWNLOAD_FETCH_DISPATCHER,
  } as unknown as RequestInit)) as unknown as FetchResponseLike;

  if (!res.ok || !res.body) {
    throw new Error(
      `${MEDIA_ERROR_MESSAGES.DOWNLOAD_FAILED}: ${res.status} ${res.statusText}`,
    );
  }

  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(destPath),
  );
  return { kind: "file", path: destPath, workDir, ownsSource: true };
}
