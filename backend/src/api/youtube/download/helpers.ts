/**
 * YouTube media onto local disk, and signed stream URLs for cutting.
 *
 * Layout:
 *  - `downloadYoutubeMedia` — public entry point, returns the file path on
 *    disk. The bytes come from a third-party downloader website driven in a
 *    headed Chrome (`site.ts`), not from YouTube, so nothing transits the
 *    metered Evomi proxy. See that file for why.
 *  - `getYoutubeStreamUrls` — deciphered googlevideo URLs for `media` op=cut's
 *    stream-direct path, via `youtubei.js` (InnerTube) through Evomi. Only the
 *    KB-sized player call and the clip ranges ffmpeg reads cross the proxy.
 */

import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { ProxyAgent, fetch as undiciFetch } from "undici";
import type { Innertube } from "youtubei.js";

import { isYoutubePlaylistUrl, parseYoutubeVideoId } from "../helpers";
import { IS_VERCEL_RUNTIME } from "../../../config";
import {
  buildEvomiProxyUrl,
  evomiConfigured,
} from "../../../utils/fetch-session-common";
import {
  YOUTUBE_DOWNLOAD_DIR,
  YOUTUBE_DOWNLOAD_ERROR_MESSAGES,
  YOUTUBE_DOWNLOAD_MEDIA,
  YOUTUBE_OEMBED_URL,
} from "./constants";
import { YoutubeDownloadError } from "./errors";
import { downloadYoutubeViaSite } from "./site";
import type {
  YOUTUBE_DOWNLOAD_MEDIA_VALUE,
  YOUTUBE_VIDEO_DOWNLOAD_REQUEST,
  YOUTUBE_VIDEO_DOWNLOAD_RESPONSE,
} from "./types";
import { YOUTUBE_VIDEO_URL } from "../constants";

/**
 * InnerTube client order for stream-direct resolution (`getYoutubeStreamUrls`,
 * used by `media` op=cut). All three are JS-less / PoToken-exempt for signing.
 * These are string literals matching the `InnerTubeClient` union from
 * youtubei.js (note: the `ClientType` enum uses `"iOS"` for IOS, which the
 * `InnerTubeClient` type rejects).
 *
 * Measured 2026-09-10 on the same video and the same Evomi session, requesting
 * 1MB at 60% into the file: IOS URLs return 302/403, ANDROID_VR URLs 403, and
 * only VISIONOS URLs return 206. googlevideo now proof-of-origin-gates IOS and
 * ANDROID_VR stream URLs: without a PO token they serve roughly the opening
 * chunk and refuse everything after it. A cut is by definition a mid-file
 * seek, so resolving with IOS first made every cut fail with 403 even though
 * IOS "succeeds" at signing — the chain stopped at the first client that
 * returned URLs, not the first one whose URLs actually serve.
 */
const STREAM_CLIENT_CHAIN = ["VISIONOS", "IOS", "ANDROID_VR"] as const;
type InnerTubeClientName = (typeof STREAM_CLIENT_CHAIN)[number];

/**
 * Tallest source resolution stream-direct cuts will read. Every byte of a cut
 * travels through the metered residential proxy, and on the test episode a
 * 16s clip cost 7.3MB of proxy traffic from the 4K AV1 stream against 1.6MB
 * from the 1080p AV1 stream — same output size, same encode time. The output
 * is a 1080x1920 vertical crop, so a 1080p source is upscaled into it while a
 * 4K source is downscaled: raise this if the crop's sharpness matters more
 * than proxy cost for a given channel.
 */
const STREAM_MAX_VIDEO_HEIGHT = 1080;

type BasicInfo = Awaited<ReturnType<Innertube["getBasicInfo"]>>;

/**
 * Pick the video-only format for a stream-direct cut: the tallest resolution
 * at or under STREAM_MAX_VIDEO_HEIGHT, and at that height the lowest-bitrate
 * stream (fewest proxy bytes per clip second — usually AV1). Falls back to the
 * library's own "best" pick if the video offers nothing it can compare.
 */
function chooseStreamVideoFormat(info: BasicInfo) {
  const videoOnly = (info.streaming_data?.adaptive_formats ?? []).filter(
    (f) => f.has_video && !f.has_audio && typeof f.height === "number" && f.height > 0,
  );
  const capped = videoOnly.filter((f) => (f.height ?? 0) <= STREAM_MAX_VIDEO_HEIGHT);
  const pool = capped.length > 0 ? capped : videoOnly;
  if (pool.length === 0) return info.chooseFormat({ type: "video", quality: "best" });
  const tallest = Math.max(...pool.map((f) => f.height ?? 0));
  return pool
    .filter((f) => f.height === tallest)
    .sort((a, b) => (a.bitrate ?? Number(a.content_length ?? 0)) - (b.bitrate ?? Number(b.content_length ?? 0)))[0];
}

/**
 * `youtubei.js` is an ESM-only package, but this backend is CommonJS
 * (`"type": "commonjs"`). A top-level `import` would compile to a
 * `require()` that Node rejects at runtime (`ERR_REQUIRE_ESM`), crashing
 * every request — not just cuts — because this module is imported
 * through the youtube router at startup. Two consequences:
 *
 *  1. The runtime values (`Innertube`, `ClientType`, `Platform`) are loaded
 *     with a native dynamic `import()` inside `loadInnertubeModule`, so
 *     they only load when stream URLs are actually resolved. On Vercel that
 *     returns 501 before reaching here, so the ESM module is never loaded.
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

/**
 * Evomi residential proxy routing for youtubei.js's fetch.
 *
 * Why: YouTube blocks datacenter IP ranges (the VPS included) at the
 * network layer with "Sign in to confirm you're not a bot" /
 * `LOGIN_REQUIRED`, before any client/token logic is evaluated. The same
 * InnerTube clients that work from a residential IP fail from the VPS IP.
 * Routing youtubei.js's fetch through Evomi (already used by every other
 * YouTube endpoint here via `createYoutubeFetchSession`) makes YouTube
 * see a residential IP instead. This is the only reliable fix for a
 * network-layer IP block — client rotation and PoTokens don't help.
 *
 * Stickiness: googlevideo stream URLs are signed to the requesting IP, so
 * the InnerTube API call and ffmpeg's stream fetch must egress from the same
 * IP or YouTube rejects them. Each agent therefore carries one stable Evomi
 * session suffix (one pinned residential IP), and hands ffmpeg that same
 * proxy URL.
 *
 * Rotation: residential pools contain flagged exits. When a full attempt
 * (the client chain) fails while proxied, `getYoutubeStreamUrls` retries on a
 * fresh Evomi session (new exit IP) — mirroring the fresh-session-per-request
 * convention of `createYoutubeFetchSession`.
 *
 * youtubei.js's HTTPClient passes a `Request` object as the first arg and
 * always sets `body` in init (even for GETs). undici needs the URL as a
 * string and rejects a GET with a body, so the wrapper extracts the URL
 * and method from the Request and drops the body for GET/HEAD.
 */
const INNERTUBE_PROXY_ROTATIONS = 2;

type CountryInnertube = {
  agent: ProxyAgent;
  innertube: Promise<Innertube>;
  sessionId: string;
  /** The full Evomi proxy URL (with this session's `_session-` id) — ffmpeg reuses it so its stream fetches egress from the same residential IP that signed the URLs. */
  proxyUrl: string;
};

function proxiedFetchFor(
  agent: ProxyAgent,
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return (input: string | URL | Request, init?: RequestInit) => {
    // Cast for property access: the global `Request`/`RequestInit` shapes
    // differ between local (undici types expose `url`/`method`) and the
    // Vercel build env (they don't), so we can't rely on the type shape.
    const req = input as unknown as {
      url?: unknown;
      method?: unknown;
    };
    let url: string;
    let method: string | undefined;
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else {
      url = typeof req.url === "string" ? req.url : String(input);
      method = typeof req.method === "string" ? req.method : undefined;
    }
    const initMethod = (init as unknown as { method?: unknown } | undefined)?.method;
    const resolvedMethod = (
      method ||
      (typeof initMethod === "string" ? initMethod : undefined) ||
      "GET"
    ).toUpperCase();
    const nextInit: Record<string, unknown> = {
      ...(init as unknown as Record<string, unknown> | undefined),
      dispatcher: agent,
      method: resolvedMethod,
    };
    if (resolvedMethod === "GET" || resolvedMethod === "HEAD") {
      delete nextInit.body;
    }
    return undiciFetch(
      url,
      nextInit as unknown as Parameters<typeof undiciFetch>[1],
    ) as unknown as Promise<Response>;
  };
}

function createCountryInnertube(country: string): CountryInnertube {
  const sessionId = randomUUID().replace(/-/g, "").slice(0, 12);
  const proxyUrl = buildEvomiProxyUrl({ countryCode: country, sessionId });
  if (!proxyUrl) {
    throw new Error("Evomi proxy URL unavailable after evomiConfigured() check");
  }
  const agent = new ProxyAgent({ uri: proxyUrl });
  const innertube = (async () => {
    const { Innertube, ClientType } = await loadInnertubeModule();
    return Innertube.create({
      client_type: ClientType.IOS,
      generate_session_locally: false,
      retrieve_player: true,
      enable_session_cache: true,
      fetch: proxiedFetchFor(agent),
    });
  })();
  // Surface creation failures even if nobody awaits this entry anymore.
  innertube.catch(() => {});
  return { agent, innertube, sessionId, proxyUrl };
}

let directInnertubePromise: Promise<Innertube> | null = null;

/** Unproxied client, for when Evomi isn't configured (local dev on a residential IP). */
function getDirectInnertube(): Promise<Innertube> {
  if (!directInnertubePromise) {
    directInnertubePromise = (async () => {
      const { Innertube, ClientType } = await loadInnertubeModule();
      return Innertube.create({
        client_type: ClientType.IOS,
        generate_session_locally: false,
        retrieve_player: true,
        enable_session_cache: true,
      });
    })();
  }
  return directInnertubePromise;
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

/**
 * Title via YouTube's oEmbed endpoint, which answers the VPS's own IP (only
 * the player-bound InnerTube calls are walled), so this costs no proxy bytes.
 * A 400/404 means the video does not exist — fail before a downloader site
 * spends minutes on it. Anything else (401/403 for private or embed-disabled
 * videos, a network error) is not a verdict: the sites decide.
 */
async function fetchOembedTitle(videoId: string): Promise<string | null> {
  const url = `${YOUTUBE_OEMBED_URL}?format=json&url=${encodeURIComponent(YOUTUBE_VIDEO_URL(videoId))}`;
  let res: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    res = await undiciFetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return null;
  }
  if (res.status === 400 || res.status === 404) {
    throw new YoutubeDownloadError(YOUTUBE_DOWNLOAD_ERROR_MESSAGES.NOT_FOUND, 404);
  }
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { title?: unknown } | null;
  return typeof body?.title === "string" ? body.title : null;
}

/**
 * Download a YouTube video or audio track to local disk through a
 * third-party downloader website (`site.ts`) — no Evomi bytes. Accepts a raw
 * video ID or a watch / shorts / youtu.be / embed URL. If the file already
 * exists on disk, no browser is started (cache hit).
 */
export async function downloadYoutubeMedia(
  request: Pick<YOUTUBE_VIDEO_DOWNLOAD_REQUEST, "videoId" | "media"> &
    Partial<Pick<YOUTUBE_VIDEO_DOWNLOAD_REQUEST, "country" | "region">>,
): Promise<YOUTUBE_VIDEO_DOWNLOAD_RESPONSE> {
  if (IS_VERCEL_RUNTIME) {
    throw new YoutubeDownloadError(YOUTUBE_DOWNLOAD_ERROR_MESSAGES.VERCEL, 501);
  }

  const videoId = resolveYoutubeDownloadVideoId(request.videoId);
  const media = request.media ?? YOUTUBE_DOWNLOAD_MEDIA.VIDEO;

  const cached = await existingDownload(videoId, media);
  if (cached) return cached;

  const title = await fetchOembedTitle(videoId);
  await mkdir(YOUTUBE_DOWNLOAD_DIR, { recursive: true });
  const outPath = expectedPath(videoId, media);
  const durationSeconds = await downloadYoutubeViaSite(videoId, media, outPath, YOUTUBE_DOWNLOAD_DIR);

  return {
    videoId,
    title: title || videoId,
    durationSeconds,
    filePath: outPath,
    mimeType: mimeTypeFor(media),
    bytes: (await stat(outPath)).size,
    media,
  };
}

export type YOUTUBE_STREAM_URLS = {
  videoId: string;
  title: string;
  durationSeconds: number;
  /** Deciphered, signed googlevideo URL for the best adaptive video-only stream. */
  videoUrl: string;
  /** Deciphered, signed googlevideo URL for the best adaptive audio-only stream. */
  audioUrl: string;
  /** The InnerTube client that produced the URLs (for debugging / rotation logs). */
  client: InnerTubeClientName;
  /**
   * The Evomi proxy URL (with the session id that signed the URLs) for
   * ffmpeg's `-http_proxy` — same residential exit IP. `undefined` when
   * Evomi isn't configured (direct fetch).
   */
  proxyUrl?: string;
};

/**
 * Extract the signed googlevideo stream URLs (video + audio) for a YouTube
 * source without downloading any media bytes. Used by the video module's
 * stream-direct clip path: ffmpeg then cuts clips directly from these URLs
 * with `-http_proxy` set to Evomi, so only the clip segments transit the
 * residential proxy — not the whole source video (the bandwidth cost that
 * made the full-download path burn ~2 GB of Evomi quota in a few test runs).
 *
 * `getBasicInfo` succeeding does not mean the stream URL will fetch (IOS
 * can return playable metadata while its googlevideo stream 403s), so each
 * client must produce usable URLs before the chain returns. A failed full
 * attempt rotates to a fresh Evomi session (new exit IP) and retries.
 */
async function attemptGetStreamUrlsWithClientChain(
  videoId: string,
  yt: Innertube,
  proxyUrl: string | undefined,
): Promise<YOUTUBE_STREAM_URLS> {
  let lastError: Error | null = null;
  for (const client of STREAM_CLIENT_CHAIN) {
    try {
      const info = await yt.getBasicInfo(videoId, { client });
      if (!info?.basic_info) {
        throw new Error("Empty InnerTube response");
      }
      const videoFormat = chooseStreamVideoFormat(info);
      const audioFormat = info.chooseFormat({ type: "audio", quality: "best" });
      const player = yt.session.player;
      const [videoUrl, audioUrl] = await Promise.all([
        videoFormat.decipher(player),
        audioFormat.decipher(player),
      ]);
      if (!videoUrl || !audioUrl) {
        throw new Error("Stream URL missing after decipher");
      }
      return {
        videoId,
        title: info.basic_info.title || videoId,
        durationSeconds: Number(info.basic_info.duration) || 0,
        videoUrl,
        audioUrl,
        client,
        proxyUrl,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw new YoutubeDownloadError(
    `${YOUTUBE_DOWNLOAD_ERROR_MESSAGES.NO_CLIENTS}: ${lastError?.message ?? "unknown error"}`,
    502,
  );
}

export async function getYoutubeStreamUrls(
  videoId: string,
  country: string,
): Promise<YOUTUBE_STREAM_URLS> {
  if (IS_VERCEL_RUNTIME) {
    throw new YoutubeDownloadError(YOUTUBE_DOWNLOAD_ERROR_MESSAGES.VERCEL, 501);
  }
  const resolvedId = resolveYoutubeDownloadVideoId(videoId);
  if (!evomiConfigured()) {
    return attemptGetStreamUrlsWithClientChain(resolvedId, await getDirectInnertube(), undefined);
  }
  // A FRESH proxy session per resolution, never a long-lived one. ffmpeg
  // fetches these signed URLs over a NEW connection (via the CONNECT bridge),
  // and googlevideo 403s unless that connection exits from the IP that signed
  // them. A long-lived session's pooled keep-alive connection can be hours old,
  // pinned to an IP its session id no longer maps to once Evomi's sticky
  // lifetime lapses: signing then egresses from the old IP and ffmpeg from a new
  // one. A fresh session signs over a brand-new connection seconds before ffmpeg
  // dials, so both land on the same IP.
  const attempts = 1 + INNERTUBE_PROXY_ROTATIONS;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const entry = createCountryInnertube(country);
    try {
      return await attemptGetStreamUrlsWithClientChain(
        resolvedId,
        await entry.innertube,
        entry.proxyUrl,
      );
    } catch (err) {
      lastError = err;
      if (err instanceof YoutubeDownloadError && err.statusCode < 500) throw err;
    } finally {
      // ffmpeg reaches googlevideo through its own bridge connection, not this
      // agent, so the agent is finished once the URLs are signed.
      void entry.agent.close().catch(() => {});
    }
  }
  throw lastError ?? new YoutubeDownloadError(YOUTUBE_DOWNLOAD_ERROR_MESSAGES.NO_CLIENTS, 502);
}
