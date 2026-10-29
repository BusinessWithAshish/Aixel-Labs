import {
  IG_CONTENT_KIND,
  IG_CONTENT_KIND_GSEARCH,
  type IgContentKind,
} from "../constants";

export type ClassifiedIgUrl = {
  kind: IgContentKind | "other";
  url: string;
  shortcode: string | null;
  usernameFromPath: string | null;
};

const POST_RE = /\/p\/([A-Za-z0-9_-]+)/i;
const REEL_RE = /\/reels?\/([A-Za-z0-9_-]+)/i;
const OWNER_POST_RE = /^\/([A-Za-z0-9._]+)\/p\//i;
const OWNER_REEL_RE = /^\/([A-Za-z0-9._]+)\/reels?\//i;

export function classifyInstagramContentUrl(raw: string): ClassifiedIgUrl {
  const fallback: ClassifiedIgUrl = {
    kind: "other",
    url: raw,
    shortcode: null,
    usernameFromPath: null,
  };
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (!u.hostname.toLowerCase().includes("instagram.com")) return fallback;
    const path = u.pathname;

    const ownerReel = path.match(OWNER_REEL_RE);
    if (ownerReel?.[1]) {
      const code = path.match(REEL_RE)?.[1] ?? null;
      return {
        kind: IG_CONTENT_KIND.REEL,
        url: raw,
        shortcode: code,
        usernameFromPath: ownerReel[1],
      };
    }
    const ownerPost = path.match(OWNER_POST_RE);
    if (ownerPost?.[1]) {
      const code = path.match(POST_RE)?.[1] ?? null;
      return {
        kind: IG_CONTENT_KIND.POST,
        url: raw,
        shortcode: code,
        usernameFromPath: ownerPost[1],
      };
    }
    const reel = path.match(REEL_RE);
    if (reel?.[1]) {
      return {
        kind: IG_CONTENT_KIND.REEL,
        url: raw,
        shortcode: reel[1],
        usernameFromPath: null,
      };
    }
    const post = path.match(POST_RE);
    if (post?.[1]) {
      return {
        kind: IG_CONTENT_KIND.POST,
        url: raw,
        shortcode: post[1],
        usernameFromPath: null,
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function buildContentGsearchQuery(
  niche: string,
  kind: typeof IG_CONTENT_KIND.POST | typeof IG_CONTENT_KIND.REEL,
): string {
  return `${IG_CONTENT_KIND_GSEARCH[kind]} ${niche.trim()}`.trim();
}

const SHORTCODE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * Media pk from a post/reel shortcode (base64 over Instagram's alphabet).
 * Private-post shortcodes append a suffix to the 11-character id part.
 */
export function mediaIdFromShortcode(shortcode: string): string | null {
  let id = BigInt(0);
  for (const ch of shortcode.slice(0, 11)) {
    const v = SHORTCODE_ALPHABET.indexOf(ch);
    if (v < 0) return null;
    id = id * BigInt(64) + BigInt(v);
  }
  return id > BigInt(0) ? id.toString() : null;
}

/** Instagram's id epoch (2011-08-24T21:07:01.721Z): media ids count ms from here in their top bits. */
const IG_ID_EPOCH_MS = 1_314_220_021_721;

/**
 * When a post was created, read off its media pk (`pk >> 23` = ms since
 * Instagram's epoch), so a shortcode alone dates a post without a request.
 * Within a few minutes of the post query's `taken_at` (24 posts checked
 * 2026-10-28, worst 4 min: the id is minted when the upload starts).
 */
export function takenAtFromMediaId(mediaId: string): number | null {
  try {
    const ms = Number(BigInt(mediaId) >> BigInt(23)) + IG_ID_EPOCH_MS;
    return ms > IG_ID_EPOCH_MS ? Math.floor(ms / 1000) : null;
  } catch {
    return null;
  }
}
