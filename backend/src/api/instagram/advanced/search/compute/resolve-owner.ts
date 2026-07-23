import { INSTAGRAM_BASE_URL } from "../../../constants";

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d: string) =>
      String.fromCodePoint(Number(d)),
    );
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta\\s+property="${property}"\\s+content="([^"]*)"`,
    "i",
  );
  const m = html.match(re);
  return m?.[1] ? decodeHtmlEntities(m[1]) : null;
}

export type ResolvedContentOwner = {
  username: string | null;
  likeCount: number | null;
  commentCount: number | null;
  titleSnippet: string | null;
  method: string | null;
};

/**
 * Public post/reel HTML exposes the owner in `og:url`:
 * `https://www.instagram.com/{username}/p|reel/{shortcode}/`
 * Engagement often appears in `og:description`:
 * `136 likes, 11 comments - username on …`
 */
export function resolveOwnerFromContentHtml(
  html: string,
): ResolvedContentOwner {
  const ogUrl = metaContent(html, "og:url");
  const ogDesc = metaContent(html, "og:description");
  const ogTitle = metaContent(html, "og:title");

  let username: string | null = null;
  let method: string | null = null;

  if (ogUrl) {
    try {
      const path = new URL(ogUrl).pathname;
      const m = path.match(/^\/([A-Za-z0-9._]+)\/(p|reel|reels)\//i);
      if (m?.[1]) {
        username = m[1];
        method = "og:url";
      }
    } catch {
      /* ignore */
    }
  }

  if (!username && ogDesc) {
    const m = ogDesc.match(/(?:^|-\s)([A-Za-z0-9._]+)\s+on\s+[A-Z][a-z]+/);
    if (m?.[1]) {
      username = m[1];
      method = "og:description";
    }
  }

  let likeCount: number | null = null;
  let commentCount: number | null = null;
  if (ogDesc) {
    const likes = ogDesc.match(/([\d,]+)\s+likes?/i);
    const comments = ogDesc.match(/([\d,]+)\s+comments?/i);
    if (likes?.[1]) likeCount = Number(likes[1].replace(/,/g, ""));
    if (comments?.[1]) commentCount = Number(comments[1].replace(/,/g, ""));
  }

  return {
    username,
    likeCount: Number.isFinite(likeCount) ? likeCount : null,
    commentCount: Number.isFinite(commentCount) ? commentCount : null,
    titleSnippet: ogTitle?.slice(0, 180) ?? null,
    method,
  };
}

export function contentPageUrl(
  kind: "post" | "reel",
  shortcode: string,
): string {
  const seg = kind === "reel" ? "reel" : "p";
  return `${INSTAGRAM_BASE_URL}/${seg}/${shortcode}/`;
}
