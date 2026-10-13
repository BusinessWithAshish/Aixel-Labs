import { REDDIT_WEB_ORIGIN } from "./constants";
import type {
  REDDIT_COMMENT,
  REDDIT_MEDIA,
  REDDIT_MORE,
  REDDIT_POST,
  REDDIT_RULE,
  REDDIT_SUBREDDIT,
  REDDIT_USER,
} from "./types";

type Rec = Record<string, unknown>;

export function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

/** Reddit epoch seconds → ISO; `edited` is `false` when never edited. */
function isoFromEpoch(value: unknown): string | null {
  const n = num(value);
  return n ? new Date(n * 1000).toISOString() : null;
}

/** Reddit thumbnails use sentinel words (`self`, `default`, `nsfw`) instead of URLs. */
function httpUrl(value: unknown): string | null {
  const s = str(value);
  return s && /^https?:\/\//.test(s) ? s : null;
}

function cleanIconUrl(value: unknown): string | null {
  const url = httpUrl(value);
  return url ? url.split("?")[0]! : null;
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

/** `programming`, `r/programming`, `/r/programming/`, or any reddit URL under /r/. */
export function parseSubreddit(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/(?:^|\/)r\/([A-Za-z0-9_]{2,21})(?:\/|$|\?)/);
  const name = fromUrl?.[1] ?? trimmed.replace(/^\/?r\//i, "").replace(/\/$/, "");
  return /^[A-Za-z0-9_]{2,21}$/.test(name) ? name : null;
}

/** `spez`, `u/spez`, `/user/spez`, or profile URL. */
export function parseUsername(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/(?:^|\/)(?:u|user)\/([A-Za-z0-9_-]{3,20})(?:\/|$|\?)/);
  const name = fromUrl?.[1] ?? trimmed.replace(/^\/?u(?:ser)?\//i, "").replace(/\/$/, "");
  return /^[A-Za-z0-9_-]{3,20}$/.test(name) ? name : null;
}

/** Post ID from `abc123`, `t3_abc123`, `/comments/abc123/...`, or `redd.it/abc123`. */
export function parsePostId(input: string): string | null {
  const trimmed = input.trim();
  const fromComments = trimmed.match(/\/comments\/([a-z0-9]{3,12})(?:\/|$|\?)/i);
  if (fromComments?.[1]) return fromComments[1].toLowerCase();
  const fromShort = trimmed.match(/redd\.it\/([a-z0-9]{3,12})(?:\/|$|\?)/i);
  if (fromShort?.[1]) return fromShort[1].toLowerCase();
  const bare = trimmed.replace(/^t3_/i, "");
  return /^[a-z0-9]{3,12}$/i.test(bare) ? bare.toLowerCase() : null;
}

/** `/r/sub/s/{code}` share links need a redirect hop to resolve. */
export function isShareLink(input: string): boolean {
  return /\/r\/[^/]+\/s\/[A-Za-z0-9]+/.test(input);
}

// ---------------------------------------------------------------------------
// Listing helpers
// ---------------------------------------------------------------------------

export type RedditThing = { kind: string; data: Rec };

export function listingChildren(raw: unknown): RedditThing[] {
  if (!isRecord(raw) || !isRecord(raw.data)) return [];
  const children = raw.data.children;
  if (!Array.isArray(children)) return [];
  return children.filter(
    (c): c is RedditThing =>
      isRecord(c) && typeof c.kind === "string" && isRecord(c.data),
  );
}

export function listingAfter(raw: unknown): string | null {
  return isRecord(raw) && isRecord(raw.data) ? str(raw.data.after) : null;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function firstPreviewImage(d: Rec): string | null {
  const preview = d.preview;
  if (!isRecord(preview) || !Array.isArray(preview.images)) return null;
  const first = preview.images[0];
  return isRecord(first) && isRecord(first.source) ? httpUrl(first.source.url) : null;
}

function galleryUrls(d: Rec): string[] {
  if (!isRecord(d.media_metadata)) return [];
  const meta = d.media_metadata;
  const order =
    isRecord(d.gallery_data) && Array.isArray(d.gallery_data.items)
      ? d.gallery_data.items
          .map((item) => (isRecord(item) ? str(item.media_id) : null))
          .filter((id): id is string => !!id)
      : Object.keys(meta);
  const urls: string[] = [];
  for (const id of order) {
    const entry = meta[id];
    if (!isRecord(entry) || !isRecord(entry.s)) continue;
    const url = httpUrl(entry.s.u) ?? httpUrl(entry.s.gif) ?? httpUrl(entry.s.mp4);
    if (url) urls.push(url);
  }
  return urls;
}

export function mapMedia(d: Rec): REDDIT_MEDIA {
  const thumbnail = httpUrl(d.thumbnail) ?? firstPreviewImage(d);
  const base: REDDIT_MEDIA = {
    type: "link",
    url: str(d.url_overridden_by_dest) ?? str(d.url),
    thumbnail,
    hlsUrl: null,
    durationSec: null,
    gallery: [],
  };

  const video =
    (isRecord(d.secure_media) && isRecord(d.secure_media.reddit_video)
      ? d.secure_media.reddit_video
      : null) ??
    (isRecord(d.media) && isRecord(d.media.reddit_video) ? d.media.reddit_video : null);
  if (video) {
    return {
      ...base,
      type: "video",
      url: httpUrl(video.fallback_url),
      hlsUrl: httpUrl(video.hls_url),
      durationSec: num(video.duration),
    };
  }

  if (bool(d.is_gallery)) {
    const gallery = galleryUrls(d);
    return { ...base, type: "gallery", url: gallery[0] ?? base.url, gallery };
  }
  if (bool(d.is_self)) return { ...base, type: "self", url: null };
  if (d.post_hint === "image") return { ...base, type: "image" };
  if (isRecord(d.secure_media) || d.post_hint === "rich:video") {
    return { ...base, type: "embed" };
  }
  return base;
}

export function mapPost(d: Rec): REDDIT_POST | null {
  const id = str(d.id);
  if (!id) return null;
  const permalink = str(d.permalink);
  return {
    id,
    fullname: str(d.name) ?? `t3_${id}`,
    url: permalink ? `${REDDIT_WEB_ORIGIN}${permalink}` : `${REDDIT_WEB_ORIGIN}/comments/${id}`,
    title: str(d.title) ?? "",
    text: str(d.selftext),
    author: str(d.author),
    subreddit: str(d.subreddit) ?? "",
    subredditId: str(d.subreddit_id),
    createdAt: isoFromEpoch(d.created_utc),
    editedAt: isoFromEpoch(d.edited),
    score: num(d.score),
    upvoteRatio: num(d.upvote_ratio),
    comments: num(d.num_comments),
    crossposts: num(d.num_crossposts),
    awards: num(d.total_awards_received),
    flair: str(d.link_flair_text),
    domain: str(d.domain),
    linkUrl: bool(d.is_self) ? null : str(d.url_overridden_by_dest) ?? str(d.url),
    isSelf: bool(d.is_self),
    isNsfw: bool(d.over_18),
    isSpoiler: bool(d.spoiler),
    isStickied: bool(d.stickied),
    isLocked: bool(d.locked),
    isOriginalContent: bool(d.is_original_content),
    media: mapMedia(d),
  };
}

export function mapComment(d: Rec, depth?: number): REDDIT_COMMENT | null {
  const id = str(d.id);
  if (!id) return null;
  const permalink = str(d.permalink);
  return {
    id,
    fullname: str(d.name) ?? `t1_${id}`,
    parentId: str(d.parent_id),
    postId: str(d.link_id),
    depth: depth ?? num(d.depth) ?? 0,
    author: str(d.author),
    text: str(d.body),
    createdAt: isoFromEpoch(d.created_utc),
    editedAt: isoFromEpoch(d.edited),
    score: num(d.score),
    isSubmitter: bool(d.is_submitter),
    isStickied: bool(d.stickied),
    flair: str(d.author_flair_text),
    permalink: permalink ? `${REDDIT_WEB_ORIGIN}${permalink}` : null,
    subreddit: str(d.subreddit),
  };
}

/** Flattens a comment Listing (with nested `replies`) depth-first. */
export function flattenComments(
  raw: unknown,
  limit: number,
): { comments: REDDIT_COMMENT[]; more: REDDIT_MORE[] } {
  const comments: REDDIT_COMMENT[] = [];
  const more: REDDIT_MORE[] = [];

  const walk = (listing: unknown, depth: number) => {
    for (const child of listingChildren(listing)) {
      if (child.kind === "more") {
        const ids = Array.isArray(child.data.children)
          ? child.data.children.filter((x): x is string => typeof x === "string")
          : [];
        if (ids.length > 0) {
          more.push({
            parentId: str(child.data.parent_id),
            count: num(child.data.count) ?? ids.length,
            ids,
          });
        }
        continue;
      }
      if (child.kind !== "t1" || comments.length >= limit) continue;
      const comment = mapComment(child.data, depth);
      if (comment) comments.push(comment);
      if (isRecord(child.data.replies)) walk(child.data.replies, depth + 1);
    }
  };

  walk(raw, 0);
  return { comments, more };
}

export function mapSubreddit(d: Rec): REDDIT_SUBREDDIT | null {
  const name = str(d.display_name);
  if (!name) return null;
  return {
    id: str(d.name) ?? str(d.id) ?? name,
    name,
    title: str(d.title),
    url: `${REDDIT_WEB_ORIGIN}/r/${name}/`,
    description: str(d.public_description),
    sidebar: str(d.description),
    subscribers: num(d.subscribers),
    activeUsers: num(d.active_user_count) ?? num(d.accounts_active),
    createdAt: isoFromEpoch(d.created_utc),
    isNsfw: bool(d.over18),
    type: str(d.subreddit_type),
    language: str(d.lang),
    iconUrl: cleanIconUrl(d.community_icon) ?? cleanIconUrl(d.icon_img),
    bannerUrl:
      cleanIconUrl(d.banner_background_image) ?? cleanIconUrl(d.banner_img),
  };
}

export function mapRules(raw: unknown): REDDIT_RULE[] {
  if (!isRecord(raw) || !Array.isArray(raw.rules)) return [];
  return raw.rules.filter(isRecord).map((r) => ({
    name: str(r.short_name) ?? "",
    description: str(r.description),
    kind: str(r.kind),
  }));
}

export function mapUser(d: Rec): REDDIT_USER | null {
  const username = str(d.name);
  if (!username) return null;
  const sub = isRecord(d.subreddit) ? d.subreddit : null;
  return {
    id: str(d.id) ? `t2_${str(d.id)}` : username,
    username,
    url: `${REDDIT_WEB_ORIGIN}/user/${username}/`,
    createdAt: isoFromEpoch(d.created_utc),
    postKarma: num(d.link_karma),
    commentKarma: num(d.comment_karma),
    totalKarma: num(d.total_karma),
    iconUrl: cleanIconUrl(d.snoovatar_img) ?? cleanIconUrl(d.icon_img),
    description: sub ? str(sub.public_description) : null,
    isVerified: bool(d.verified),
    hasPremium: bool(d.is_gold),
    isModerator: bool(d.is_mod),
    isSuspended: bool(d.is_suspended),
  };
}
