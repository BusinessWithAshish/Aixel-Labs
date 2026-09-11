import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

// Explicit undici fetch: on Vercel's build machine the ambient global fetch
// types resolve `Response` without ok/status/body/headers (TS2339) — the same
// quirk fixed in chatgpt/client.ts and chatgpt/cdp.ts. Same runtime fetch.
import { fetch } from "undici";

import { assertPersistentDisk } from "../../../config";
import { mapFeedItem } from "../advanced/compute";
import type { IG_ADVANCED_POST, IgFeedItem } from "../advanced/types";
import { classifyInstagramContentUrl } from "../advanced/search/compute/classify-url";
import { findFeedItemInSsr } from "./compute/parse-ssr";
import {
  IG_CDN_HEADERS,
  IG_CRAWLER_HEADERS,
  IG_DOWNLOAD_DIR,
  IG_DOWNLOAD_ERROR_MESSAGES,
  IG_DOWNLOAD_EXTENSION,
  IG_DOWNLOAD_LIMITS,
  IG_POST_PAGE_URL,
} from "./constants";
import type {
  IG_DOWNLOAD_ITEM,
  IG_DOWNLOAD_POST,
  IG_DOWNLOAD_REQUEST_PARSED,
  IG_DOWNLOAD_RESPONSE,
  IgDownloadAssetKind,
} from "./types";

const SHORTCODE_RE = /^[A-Za-z0-9_-]{5,40}$/;
const TV_RE = /\/tv\/([A-Za-z0-9_-]+)/i;

type Asset = {
  index: number;
  kind: IgDownloadAssetKind;
  url: string;
  width: number | null;
  height: number | null;
};

export function extractShortcode(input: string): string | null {
  const raw = input.trim();
  if (SHORTCODE_RE.test(raw)) return raw;
  const classified = classifyInstagramContentUrl(raw);
  if (classified.shortcode) return classified.shortcode;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (!u.hostname.toLowerCase().includes("instagram.com")) return null;
    return u.pathname.match(TV_RE)?.[1] ?? null;
  } catch {
    return null;
  }
}

function largest<T extends { width: number | null; height: number | null }>(
  list: T[],
): T | undefined {
  return [...list].sort(
    (a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
  )[0];
}

/**
 * One asset per slide: the video when the slide has one, else its largest
 * image. The crawler page's candidates carry only `url` (no width/height),
 * so `largest` keeps Instagram's own order — biggest first — and dimensions
 * fall back to the slide's `original_width` / `original_height`.
 */
function toAssets(post: IG_ADVANCED_POST, raw: IgFeedItem): Asset[] {
  const slides = post.carousel.length ? post.carousel : [post];
  const rawSlides = raw.carousel_media?.length ? raw.carousel_media : [raw];
  const out: Asset[] = [];
  slides.forEach((slide, index) => {
    const video = largest(slide.videos);
    const image = largest(slide.images);
    const picked = video ?? image;
    if (!picked) return;
    out.push({
      index,
      kind: video ? "video" : "image",
      url: picked.url,
      width: picked.width ?? rawSlides[index]?.original_width ?? null,
      height: picked.height ?? rawSlides[index]?.original_height ?? null,
    });
  });
  return out;
}

function filterAssets(
  assets: Asset[],
  input: IG_DOWNLOAD_REQUEST_PARSED,
  isCarousel: boolean,
): Asset[] {
  const wanted = isCarousel && input.items?.length ? new Set(input.items) : null;
  return assets.filter(
    (a) =>
      (!wanted || wanted.has(a.index)) &&
      (input.media === "all" || input.media === a.kind),
  );
}

async function fetchPostPage(shortcode: string): Promise<string> {
  const res = await fetch(IG_POST_PAGE_URL(shortcode), {
    headers: IG_CRAWLER_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(IG_DOWNLOAD_LIMITS.pageTimeoutMs),
  });
  const html = await res.text();
  if (!res.ok) {
    throw new Error(`${IG_DOWNLOAD_ERROR_MESSAGES.PAGE_FAILED} (HTTP ${res.status})`);
  }
  return html;
}

async function existingSize(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

/**
 * Streams one CDN file to `destPath` via a `.part` sibling, aborting as soon
 * as `maxBytes` is crossed rather than after the whole body lands. Direct
 * `fetch` only — see the note in `constants.ts`.
 */
async function downloadAsset(
  url: string,
  destPath: string,
  maxBytes: number,
): Promise<number> {
  const res = await fetch(url, {
    headers: IG_CDN_HEADERS,
    signal: AbortSignal.timeout(IG_DOWNLOAD_LIMITS.mediaTimeoutMs),
  });
  if (!res.ok || !res.body) {
    throw new Error(`${IG_DOWNLOAD_ERROR_MESSAGES.MEDIA_FAILED} (HTTP ${res.status})`);
  }
  const declared = Number(res.headers.get("content-length") || "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body.cancel().catch(() => {});
    throw new Error(`${IG_DOWNLOAD_ERROR_MESSAGES.TOO_LARGE} (${declared} > ${maxBytes})`);
  }

  let seen = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      seen += chunk.length;
      if (seen > maxBytes) {
        cb(new Error(`${IG_DOWNLOAD_ERROR_MESSAGES.TOO_LARGE} (> ${maxBytes})`));
        return;
      }
      cb(null, chunk);
    },
  });

  const partPath = `${destPath}.part`;
  try {
    await pipeline(
      Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
      limiter,
      createWriteStream(partPath),
    );
  } catch (err) {
    await rm(partPath, { force: true });
    throw err;
  }
  await rename(partPath, destPath);
  return seen;
}

async function downloadPost(
  input: string,
  opts: IG_DOWNLOAD_REQUEST_PARSED,
): Promise<{ post: IG_DOWNLOAD_POST; bytesFetched: number }> {
  const shortcode = extractShortcode(input);
  if (!shortcode) {
    return {
      post: { input, shortcode: null, ok: false, error: IG_DOWNLOAD_ERROR_MESSAGES.INVALID_URL, items: [] },
      bytesFetched: 0,
    };
  }

  let bytesFetched = 0;
  const items: IG_DOWNLOAD_ITEM[] = [];
  let meta: Omit<IG_DOWNLOAD_POST, "input" | "shortcode" | "ok" | "items"> = {};
  try {
    const html = await fetchPostPage(shortcode);
    bytesFetched += Buffer.byteLength(html);
    const raw = findFeedItemInSsr(html, shortcode);
    if (!raw) throw new Error(IG_DOWNLOAD_ERROR_MESSAGES.NOT_FOUND);

    const post = mapFeedItem(raw);
    meta = {
      url: post.url ?? IG_POST_PAGE_URL(shortcode),
      mediaTypeLabel: post.mediaTypeLabel,
      productType: post.productType,
      owner: post.user,
      caption: post.caption,
      takenAt: post.takenAt,
    };

    const assets = filterAssets(toAssets(post, raw), opts, post.carousel.length > 0);
    if (!assets.length) throw new Error(IG_DOWNLOAD_ERROR_MESSAGES.NO_MATCHING_MEDIA);

    const dir = join(IG_DOWNLOAD_DIR, shortcode);
    await mkdir(dir, { recursive: true });
    for (const a of assets) {
      const filePath = join(dir, `${a.index}.${IG_DOWNLOAD_EXTENSION[a.kind]}`);
      const cachedSize = await existingSize(filePath);
      const bytes = cachedSize ?? (await downloadAsset(a.url, filePath, opts.maxBytes));
      if (cachedSize === null) bytesFetched += bytes;
      items.push({
        index: a.index,
        kind: a.kind,
        filePath,
        bytes,
        width: a.width,
        height: a.height,
        cached: cachedSize !== null,
      });
    }
    return { post: { input, shortcode, ok: true, ...meta, items }, bytesFetched };
  } catch (err) {
    const error = err instanceof Error ? err.message : IG_DOWNLOAD_ERROR_MESSAGES.GENERIC;
    return { post: { input, shortcode, ok: false, error, ...meta, items }, bytesFetched };
  }
}

/**
 * Downloads public Instagram post / reel / carousel media to
 * `{AIXEL_MEDIA_ROOT}/private/instagram-downloads/{shortcode}/{index}.{mp4|jpg}`.
 * Posts run sequentially (gentle on Instagram, and a batch is ≤10); a failed
 * post is reported in its own entry rather than failing the batch. Files
 * already on disk are returned as cache hits without re-fetching media.
 */
export async function downloadInstagramMedia(
  input: IG_DOWNLOAD_REQUEST_PARSED,
): Promise<IG_DOWNLOAD_RESPONSE> {
  assertPersistentDisk(IG_DOWNLOAD_ERROR_MESSAGES.DISK_UNAVAILABLE);

  const posts: IG_DOWNLOAD_POST[] = [];
  let bytesFetched = 0;
  for (const url of input.urls) {
    const r = await downloadPost(url, input);
    posts.push(r.post);
    bytesFetched += r.bytesFetched;
  }
  return { posts, bytesFetched };
}
