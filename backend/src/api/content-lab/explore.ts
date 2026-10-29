import type { z } from "zod";
import { computeNicheStats, computeTakeaways, isTooOld, rankPosts, takeWithPlatformShare } from "./compute";
import { CONTENT_LAB_CARRY } from "./constants";
import {
  decodeCursor,
  encodeCursor,
  exploreKey,
  hashId,
  type ContentLabCursor,
  type YoutubeExploreState,
} from "./cursor";
import { errorMessage } from "./helpers";
import { exploreInstagram, instagramDone, instagramPending } from "./instagram";
import type { CONTENT_LAB_EXPLORE_REQUEST_SCHEMA } from "./schemas";
import type {
  CONTENT_LAB_EXPLORE_RESPONSE,
  CONTENT_LAB_POST,
  ContentLabPlatform,
} from "./types";
import { enrichYoutubePosts, exploreYoutube, youtubePending } from "./youtube";

export type ContentLabExploreInput = z.output<typeof CONTENT_LAB_EXPLORE_REQUEST_SCHEMA>;

const CURSOR_KEY: Record<ContentLabPlatform, "yt" | "ig"> = { youtube: "yt", instagram: "ig" };

const youtubeDone = (state: YoutubeExploreState) => state.s.every((st) => st === null) && !state.p?.length;

/** Same post from two searches (or a search hit that is also a creator's winner): keep the first. */
const dedupe = (list: readonly CONTENT_LAB_POST[]) => [...new Map(list.map((p) => [p.id, p])).values()];

/**
 * One page of posts that are working now across a niche. Every platform runs
 * in parallel from where the cursor left it. A platform that throws lands in
 * `errors` and stops paging; a slow page (YouTube searches down, Instagram
 * late) lands in `errors` but keeps paging. The page is ranked (`rankPosts`:
 * beat-the-usual + views + recency, tiny posts last) and cut to `limit`,
 * keeping a share for each platform.
 *
 * Nothing found is lost to paging: posts already returned (the cursor's
 * `seen`) never come back, and every post read but not returned (cut from
 * the page, or its creator was late) is carried in the cursor and comes
 * first next page, up to CONTENT_LAB_CARRY.maxCarries times.
 *
 * Page 1 (no cursor) returns takeaways and niche stats over every post it
 * found, before the cut. Later pages return `takeaways: []` and niche stats
 * for that page's posts only. `nextCursor` is null once every platform has
 * run out of searches and has nothing carried.
 */
export async function contentLabExploreService(input: ContentLabExploreInput): Promise<CONTENT_LAB_EXPLORE_RESPONSE> {
  const platforms = [...new Set(input.platforms)];
  const key = exploreKey(input.query, input.country);
  const cursor: ContentLabCursor = input.cursor ? decodeCursor(input.cursor, key) : { v: 1, k: key, seen: [] };
  const seen = new Set(cursor.seen);
  const isSeen = (postId: string) => seen.has(hashId(postId));

  // A platform whose cursor state is null has nothing left; absent = start it.
  const live = platforms.filter((p) => cursor[CURSOR_KEY[p]] !== null);
  const next: ContentLabCursor = { ...cursor };
  const errors: CONTENT_LAB_EXPLORE_RESPONSE["errors"] = {};
  /** Every post found (page 1's takeaways, and what to carry), and each platform's carry counts. */
  const found: CONTENT_LAB_POST[] = [];
  const carried = new Map<string, number>();
  /** YouTube posts with likes / exact dates loaded. */
  const enriched = new Map<string, CONTENT_LAB_POST>();

  const startedAt = Date.now();
  const settled = await Promise.allSettled(
    live.map(async (p) => {
      if (p === "youtube") {
        const page = await exploreYoutube(input.query, input.country, cursor.yt ?? undefined, isSeen, input.limit);
        next.yt = page.state;
        if (page.error) errors.youtube = page.error;
        page.carried.forEach((times, id) => carried.set(id, times));
        // Only YouTube's top `limit` can make the page, so just their likes /
        // exact dates load, and while Instagram is still working.
        for (const post of await enrichYoutubePosts(rankPosts(page.posts).slice(0, input.limit), input.country)) {
          enriched.set(post.id, post);
        }
        console.log(`[content-lab] explore youtube: ${page.posts.length} posts in ${Date.now() - startedAt} ms`);
        return page.posts;
      }
      const page = await exploreInstagram(input.query, input.country, cursor.ig ?? undefined, isSeen);
      next.ig = page.state;
      if (page.error) errors.instagram = page.error;
      page.carried.forEach((times, id) => carried.set(id, times));
      console.log(`[content-lab] explore instagram: ${page.posts.length} posts in ${Date.now() - startedAt} ms`);
      return page.posts;
    }),
  );
  settled.forEach((result, i) => {
    const platform = live[i]!;
    if (result.status === "fulfilled") found.push(...result.value);
    else {
      errors[platform] = errorMessage(result.reason);
      next[CURSOR_KEY[platform]] = null;
    }
  });

  // get_watch dates can show that a video search called "1 year ago" is older.
  const unique = dedupe(found).map((p) => enriched.get(p.id) ?? p).filter((p) => !isTooOld(p.publishedAt));
  const ranked = rankPosts(unique);
  // YouTube beyond its top `limit` can't make this page (no details loaded); it is carried.
  const youtubeTop = new Set(ranked.filter((p) => p.platform === "youtube").slice(0, input.limit).map((p) => p.id));
  const posts = takeWithPlatformShare(ranked.filter((p) => p.platform !== "youtube" || youtubeTop.has(p.id)), input.limit);

  // Carry the rest, best first, ahead of what was late this page.
  const returned = new Set(posts.map((p) => p.id));
  const leftovers = ranked.filter((p) => !returned.has(p.id));
  if (next.yt) {
    const cut = leftovers.flatMap((p) => {
      const hit = p.platform === "youtube" ? youtubePending(p, carried.get(p.id) ?? 0) : null;
      return hit ? [hit] : [];
    });
    next.yt = { ...next.yt, p: [...cut, ...(next.yt.p ?? [])].slice(0, CONTENT_LAB_CARRY.youtube) };
    if (youtubeDone(next.yt)) next.yt = null;
  }
  if (next.ig) {
    const cut = leftovers.flatMap((p) => {
      const code = p.platform === "instagram" ? instagramPending(p, carried.get(p.id) ?? 0) : null;
      return code ? [code] : [];
    });
    next.ig = { ...next.ig, p: [...cut, ...(next.ig.p ?? [])].slice(0, CONTENT_LAB_CARRY.instagram) };
    if (instagramDone(next.ig)) next.ig = null;
  }

  next.seen = [...cursor.seen, ...posts.map((p) => hashId(p.id))];
  const more = platforms.some((p) => next[CURSOR_KEY[p]] != null);
  const firstPage = !input.cursor;

  return {
    query: input.query,
    country: input.country,
    platforms,
    posts,
    takeaways: firstPage ? computeTakeaways(unique) : [],
    niche: computeNicheStats(firstPage ? unique : posts),
    errors,
    nextCursor: more ? encodeCursor(next) : null,
  };
}
