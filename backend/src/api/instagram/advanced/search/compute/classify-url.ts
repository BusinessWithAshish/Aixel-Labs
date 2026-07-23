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
