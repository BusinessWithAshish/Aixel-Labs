/**
 * In-house YouTube media downloader built on `youtubei.js` (InnerTube).
 *
 * Why this exists: a previous `yt-dlp` shell-out path hit YouTube's "Sign
 * in to confirm you're not a bot" wall whenever the WEB client demanded a
 * Proof-of-Origin (PoToken) token we cannot mint server-side. The InnerTube
 * clients used here (`IOS`, `ANDROID_VR`, `VISIONOS`) are JS-less /
 * PoToken-exempt today, so they keep working on datacenter IPs where the web
 * client is blocked — no external binary, no browser cookies, no PoToken
 * provider.
 *
 * Layout:
 *  - `downloadYoutubeMedia` — public entry point, returns the file path on disk.
 *  - Audio: one adaptive audio stream → `.m4a`.
 *  - Video: separate video + audio adaptive streams → ffmpeg merge → `.mp4`.
 *    IOS/VISIONOS only return adaptive (not progressive) formats for most
 *    videos, so we always merge for the video path even when a progressive
 *    stream exists — keeps the code path single.
 */

import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";
import type { Innertube } from "youtubei.js";

import { isYoutubePlaylistUrl, parseYoutubeVideoId } from "../helpers";
import { IS_VERCEL_RUNTIME } from "../../../config";
import {
  YOUTUBE_DOWNLOAD_DIR,
  YOUTUBE_DOWNLOAD_ERROR_MESSAGES,
  YOUTUBE_DOWNLOAD_MEDIA,
  YOUTUBE_DOWNLOAD_TIMEOUT_MS,
} from "./constants";
import { YoutubeDownloadError } from "./errors";
import type {
  YOUTUBE_DOWNLOAD_MEDIA_VALUE,
  YOUTUBE_VIDEO_DOWNLOAD_REQUEST,
  YOUTUBE_VIDEO_DOWNLOAD_RESPONSE,
} from "./types";

const execFileAsync = promisify(execFile);

/**
 * InnerTube clients tried in order. All three are JS-less / PoToken-exempt
 * today. IOS returns the highest-quality adaptive mp4 streams; ANDROID_VR
 * and VISIONOS are alternates for videos where IOS returns no formats.
 *
 * These are string literals matching the `InnerTubeClient` union from
 * youtubei.js (note: the `ClientType` enum uses `"iOS"` for IOS, which the
 * `InnerTubeClient` type rejects). The enum value for `Innertube.create`'s
 * `client_type` is resolved lazily after the dynamic import (see below).
 */
const INNERTUBE_CLIENT_CHAIN = ["IOS", "ANDROID_VR", "VISIONOS"] as const;
type InnerTubeClientName = (typeof INNERTUBE_CLIENT_CHAIN)[number];

/**
 * `youtubei.js` is an ESM-only package, but this backend is CommonJS
 * (`"type": "commonjs"`). A top-level `import` would compile to a
 * `require()` that Node rejects at runtime (`ERR_REQUIRE_ESM`), crashing
 * every request — not just downloads — because this module is imported
 * through the youtube router at startup. Two consequences:
 *
 *  1. The runtime values (`Innertube`, `ClientType`, `Platform`) are loaded
 *     with a native dynamic `import()` inside `loadInnertubeModule`, so
 *     they only load when a download actually runs. On Vercel the download
 *     endpoint returns 501 before reaching here, so the ESM module is never
 *     loaded.
 *  2. The compile-time types come from `import type` (erased by TypeScript,
 *     no runtime `require()`).
 *
 * Why `Function("return import(...)")` instead of `await import(...)`:
 * `tsconfig.json` sets `"module": "CommonJS"`, so TypeScript downlevels a
 * plain `import("youtubei.js")` to `Promise.resolve().then(() =>
 * require("youtubei.js"))` — which still hits `ERR_REQUIRE_ESM`. Wrapping
 * the call in the `Function` constructor keeps it as a *native* dynamic
 * import at runtime (Node supports `import()` from CommonJS), which can
 * load ESM modules. This is the standard escape hatch for exactly this
 * case; it lets us load youtubei.js without flipping the whole backend to
 * ESM or changing `module` in tsconfig (which would ripple across every
 * module).
 */
type InnertubeModule = typeof import("youtubei.js");

const nativeImport = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<InnertubeModule>;

let innertubeModulePromise: Promise<InnertubeModule> | null = null;

function loadInnertubeModule(): Promise<InnertubeModule> {
  if (!innertubeModulePromise) {
    innertubeModulePromise = nativeImport("youtubei.js").then((mod) => {
      // youtubei.js requires a JS interpreter to decipher YouTube's
      // obfuscated signature algorithm for some clients. The Node
      // `Function` constructor is sufficient and runs in-process.
      mod.Platform.shim.eval = async (data: { output: string }) =>
        // eslint-disable-next-line no-new-func
        new Function(data.output)();
      return mod;
    });
  }
  return innertubeModulePromise;
}

let innertubePromise: Promise<Innertube> | null = null;

async function getInnertube(): Promise<Innertube> {
  if (!innertubePromise) {
    const { Innertube, ClientType } = await loadInnertubeModule();
    innertubePromise = Innertube.create({
      client_type: ClientType.IOS,
      generate_session_locally: false,
      retrieve_player: true,
      enable_session_cache: true,
    });
  }
  return innertubePromise;
}

function expectedPath(
  videoId: string,
  media: YOUTUBE_DOWNLOAD_MEDIA_VALUE,
): string {
  const ext = media === YOUTUBE_DOWNLOAD_MEDIA.AUDIO ? "m4a" : "mp4";
  return join(YOUTUBE_DOWNLOAD_DIR, `${videoId}.${ext}`);
}

function mimeTypeFor(media: YOUTUBE_DOWNLOAD_MEDIA_VALUE): string {
  return media === YOUTUBE_DOWNLOAD_MEDIA.AUDIO ? "audio/mp4" : "video/mp4";
}

export function resolveYoutubeDownloadVideoId(source: string): string {
  if (isYoutubePlaylistUrl(source) && !parseYoutubeVideoId(source)) {
    throw new YoutubeDownloadError(YOUTUBE_DOWNLOAD_ERROR_MESSAGES.PLAYLIST_ONLY, 400);
  }
  const videoId = parseYoutubeVideoId(source);
  if (!videoId) {
    throw new YoutubeDownloadError(
      YOUTUBE_DOWNLOAD_ERROR_MESSAGES.INVALID_SOURCE,
      400,
    );
  }
  return videoId;
}

async function existingDownload(
  videoId: string,
  media: YOUTUBE_DOWNLOAD_MEDIA_VALUE,
): Promise<YOUTUBE_VIDEO_DOWNLOAD_RESPONSE | null> {
  const filePath = expectedPath(videoId, media);
  try {
    const info = await stat(filePath);
    if (!info.isFile() || info.size <= 0) return null;
    return {
      videoId,
      title: videoId,
      durationSeconds: 0,
      filePath,
      mimeType: mimeTypeFor(media),
      bytes: info.size,
      media,
    };
  } catch {
    return null;
  }
}

async function pipeStreamTo(
  stream: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
  dest: string,
): Promise<number> {
  const writeStream = createWriteStream(dest);
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      writeStream.write(chunk);
    }
    writeStream.end();
    await new Promise<void>((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
  } catch (err) {
    writeStream.destroy();
    throw err;
  }
  const info = await stat(dest);
  return info.size;
}

async function mergeWithFfmpeg(
  videoPath: string,
  audioPath: string,
  outPath: string,
): Promise<void> {
  if (!ffmpegPath) {
    throw new YoutubeDownloadError(YOUTUBE_DOWNLOAD_ERROR_MESSAGES.MERGE_FAILED, 502);
  }
  try {
    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-i",
        videoPath,
        "-i",
        audioPath,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        outPath,
      ],
      { maxBuffer: 10 * 1024 * 1024, timeout: YOUTUBE_DOWNLOAD_TIMEOUT_MS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new YoutubeDownloadError(
      `${YOUTUBE_DOWNLOAD_ERROR_MESSAGES.MERGE_FAILED}: ${message}`,
      502,
    );
  }
}

type InnertubeVideoInfo = Awaited<ReturnType<Innertube["getBasicInfo"]>>;

async function fetchInfoWithClientChain(
  videoId: string,
): Promise<{ info: InnertubeVideoInfo; client: InnerTubeClientName }> {
  let lastError: Error | null = null;
  const yt = await getInnertube();
  for (const client of INNERTUBE_CLIENT_CHAIN) {
    try {
      const info = await yt.getBasicInfo(videoId, { client });
      if (!info?.basic_info) {
        throw new Error("Empty InnerTube response");
      }
      return { info, client };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw new YoutubeDownloadError(
    `${YOUTUBE_DOWNLOAD_ERROR_MESSAGES.NO_CLIENTS}: ${lastError?.message ?? "unknown error"}`,
    502,
  );
}

async function downloadAudio(
  info: InnertubeVideoInfo,
  client: InnerTubeClientName,
  outPath: string,
): Promise<number> {
  const stream = await info.download({ type: "audio", quality: "best", client });
  return pipeStreamTo(stream as unknown as AsyncIterable<Buffer>, outPath);
}

async function downloadVideo(
  info: InnertubeVideoInfo,
  client: InnerTubeClientName,
  outPath: string,
): Promise<number> {
  const baseId = info.basic_info.id ?? "";
  const videoPart = join(YOUTUBE_DOWNLOAD_DIR, `${baseId}.video.mp4`);
  const audioPart = join(YOUTUBE_DOWNLOAD_DIR, `${baseId}.audio.m4a`);

  const videoStream = await info.download({ type: "video", quality: "best", client });
  await pipeStreamTo(videoStream as unknown as AsyncIterable<Buffer>, videoPart);

  const audioStream = await info.download({ type: "audio", quality: "best", client });
  await pipeStreamTo(audioStream as unknown as AsyncIterable<Buffer>, audioPart);

  await mergeWithFfmpeg(videoPart, audioPart, outPath);

  return stat(outPath).then((s) => s.size);
}

/**
 * Download a YouTube video or audio stream to local disk via the in-house
 * InnerTube client. Accepts a raw video ID or a watch / shorts / youtu.be /
 * embed URL. If the file already exists on disk, the InnerTube client is
 * not spawned (cache hit).
 */
export async function downloadYoutubeMedia(
  request: Pick<YOUTUBE_VIDEO_DOWNLOAD_REQUEST, "videoId" | "media">,
): Promise<YOUTUBE_VIDEO_DOWNLOAD_RESPONSE> {
  if (IS_VERCEL_RUNTIME) {
    throw new YoutubeDownloadError(YOUTUBE_DOWNLOAD_ERROR_MESSAGES.VERCEL, 501);
  }

  const videoId = resolveYoutubeDownloadVideoId(request.videoId);
  const media = request.media ?? YOUTUBE_DOWNLOAD_MEDIA.VIDEO;

  const cached = await existingDownload(videoId, media);
  if (cached) return cached;

  await mkdir(YOUTUBE_DOWNLOAD_DIR, { recursive: true });
  const outPath = expectedPath(videoId, media);

  const { info, client } = await fetchInfoWithClientChain(videoId);
  const title = info.basic_info.title || videoId;
  const durationSeconds = Number(info.basic_info.duration) || 0;

  const bytes =
    media === YOUTUBE_DOWNLOAD_MEDIA.AUDIO
      ? await downloadAudio(info, client, outPath)
      : await downloadVideo(info, client, outPath);

  try {
    const fileStat = await stat(outPath);
    return {
      videoId,
      title,
      durationSeconds,
      filePath: outPath,
      mimeType: mimeTypeFor(media),
      bytes: fileStat.size,
      media,
    };
  } catch {
    throw new YoutubeDownloadError(YOUTUBE_DOWNLOAD_ERROR_MESSAGES.OUTPUT_MISSING, 502);
  }
}
