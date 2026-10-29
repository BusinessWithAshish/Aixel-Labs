import { deflateRawSync, inflateRawSync } from "node:zlib";
import { withStatusCode } from "../../config";
import { CONTENT_LAB_CURSOR_MAX_SEEN, CONTENT_LAB_LIMITS } from "./constants";

/**
 * A YouTube video read on an earlier page but not returned yet (cut by the
 * page limit, or its channel was late): enough to rebuild the post without
 * searching again. `p` = published, epoch seconds; `a` = pages it has
 * already been carried over.
 */
export type YoutubePendingHit = {
  v: string;
  c: string;
  t: string;
  n: number | null;
  d: number | null;
  p: number | null;
  a: number;
};

/**
 * Where each YouTube search stream stands, in `CONTENT_LAB_YOUTUBE_STREAMS`
 * order: `t` = token of the batch being read (null = the stream's first
 * page), `o` = items of that batch already used, `f` = failed tries of that
 * batch in a row. Null = stream ended. `p` = hits carried to the next page.
 */
export type YoutubeExploreState = {
  s: Array<{ t: string | null; o: number; f?: number } | null>;
  p?: YoutubePendingHit[];
};

/**
 * `i` = next search in the Instagram search list; `d` = no new search left;
 * `r` = searches to retry (failed or too slow once); `tags` = related
 * hashtags, looked up once; `p` = shortcodes carried to the next page, with
 * the pages each has been carried.
 */
export type InstagramExploreState = {
  i: number;
  d?: boolean;
  r?: number[];
  tags: string[] | null;
  p?: Array<[string, number]>;
};

/**
 * Everything the next explore page needs, so the server keeps no paging
 * state. A platform key that is absent starts fresh; null means that
 * platform has no more posts.
 */
export type ContentLabCursor = {
  v: 1;
  /** Hash of query + country: a cursor from another search is refused. */
  k: string;
  yt?: YoutubeExploreState | null;
  ig?: InstagramExploreState | null;
  /** `hashId` of every post already returned, oldest first. */
  seen: string[];
};

const INVALID_CURSOR = "That cursor belongs to another search or has expired; search again";

/** FNV-1a 32-bit, base36: ~6 chars per id keeps hundreds of seen ids inside a cursor. */
export function hashId(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export const exploreKey = (query: string, country: string) => hashId(`${query.trim().toLowerCase()}|${country}`);

const pack = (cursor: ContentLabCursor) => deflateRawSync(Buffer.from(JSON.stringify(cursor))).toString("base64url");

/**
 * JSON → raw deflate → base64url, inside `maxCursorChars`: when it would be
 * longer, the carried-over items go first, last (lowest ranked) first, then
 * the oldest seen ids.
 */
export function encodeCursor(cursor: ContentLabCursor): string {
  // Copies, so trimming never touches the caller's cursor.
  const c: ContentLabCursor = {
    ...cursor,
    yt: cursor.yt?.p ? { ...cursor.yt, p: [...cursor.yt.p] } : cursor.yt,
    ig: cursor.ig?.p ? { ...cursor.ig, p: [...cursor.ig.p] } : cursor.ig,
    seen: cursor.seen.slice(-CONTENT_LAB_CURSOR_MAX_SEEN),
  };
  let out = pack(c);
  while (out.length > CONTENT_LAB_LIMITS.maxCursorChars) {
    const yt = c.yt?.p ?? [];
    const ig = c.ig?.p ?? [];
    // Drop the last fifth (at least one) of the longer list.
    if (yt.length >= ig.length && yt.length > 0) yt.splice(Math.floor(yt.length * 0.8));
    else if (ig.length > 0) ig.splice(Math.floor(ig.length * 0.8));
    else if (c.seen.length > 0) c.seen.splice(0, Math.ceil(c.seen.length * 0.2));
    else break;
    out = pack(c);
  }
  return out;
}

/** The cursor, or a 400 when it doesn't parse or belongs to another query / country. */
export function decodeCursor(raw: string, key: string): ContentLabCursor {
  let cursor: ContentLabCursor;
  try {
    cursor = JSON.parse(inflateRawSync(Buffer.from(raw, "base64url")).toString("utf8")) as ContentLabCursor;
  } catch {
    throw withStatusCode(INVALID_CURSOR, 400);
  }
  if (cursor?.v !== 1 || cursor.k !== key || !Array.isArray(cursor.seen)) {
    throw withStatusCode(INVALID_CURSOR, 400);
  }
  return cursor;
}
