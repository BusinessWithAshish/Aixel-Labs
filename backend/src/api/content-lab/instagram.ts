import { withStatusCode } from "../../config";
import { fetchGsearch } from "../gsearch";
import { GSEARCH_TIME_FILTER } from "../gsearch/constants";
import { fetchInstagramAdvancedPosts } from "../instagram/advanced/client";
import { mapFeedItem } from "../instagram/advanced/compute";
import { IG_MEDIA_TYPE, IG_POST_EMBED_URL } from "../instagram/advanced/constants";
import { searchInstagramHashtags } from "../instagram/advanced/search/client";
import {
  buildContentGsearchQuery,
  classifyInstagramContentUrl,
  mediaIdFromShortcode,
  takenAtFromMediaId,
} from "../instagram/advanced/search/compute/classify-url";
import { IG_CONTENT_KIND } from "../instagram/advanced/search/constants";
import type { IG_ADVANCED_POST, IgFeedItem, IgPolarisConnection } from "../instagram/advanced/types";
import { fetchFromEntities } from "../instagram/client";
import { extractUsername } from "../instagram/compute/username";
import type { XigUserByUsername } from "../instagram/compute/xig-user";
import { IG_GRAPHQL_CONCURRENCY, INSTAGRAM_BASE_URL, INSTAGRAM_USERNAME_REGEX } from "../instagram/constants";
import { fetchLoggedOutMedia, igLoggedOutQuery, readEmbedNumber } from "../instagram/graphql";
import type { INSTAGRAM_RESPONSE } from "../instagram/types";
import { classifyHook } from "../youtube/intelligence/transcript/compute/hook";
import { runWithConcurrency } from "../youtube/concurrency";
import { createTtlCache } from "./cache";
import {
  baselineByFamily,
  captionCta,
  computeWhyItWorked,
  firstLine,
  isTooOld,
  isWorthShowing,
  matchesTopic,
  meetsFloor,
  rankPosts,
  topicWords,
} from "./compute";
import {
  CONTENT_LAB_BUDGET_MS,
  CONTENT_LAB_CACHE,
  CONTENT_LAB_CARRY,
  CONTENT_LAB_CONCURRENCY,
  CONTENT_LAB_ERROR_MESSAGES,
  CONTENT_LAB_EXPANSION_PER_CREATOR,
  CONTENT_LAB_INSTAGRAM_EMBED_TRIES,
  CONTENT_LAB_INSTAGRAM_HITS_PER_PAGE,
  CONTENT_LAB_INSTAGRAM_PAGE_SIZE,
  CONTENT_LAB_INSTAGRAM_PHOTO_BASELINE_POSTS,
  CONTENT_LAB_INSTAGRAM_SEARCHES,
  CONTENT_LAB_LIMITS,
  CONTENT_LAB_OUTLIER_MULTIPLE,
} from "./constants";
import type { InstagramExploreState } from "./cursor";
import {
  beforeDeadline,
  buildContentLabPost,
  createLimiter,
  errorMessage,
  sortNewestFirst,
  type ContentLabBaselines,
} from "./helpers";
import type {
  CONTENT_LAB_BREAKDOWN_RESPONSE,
  CONTENT_LAB_CREATOR,
  CONTENT_LAB_CREATOR_RESPONSE,
  CONTENT_LAB_POST,
  CONTENT_LAB_SUGGESTION,
  ContentLabFormat,
} from "./types";

type InstagramCreatorPosts = {
  creator: CONTENT_LAB_CREATOR;
  posts: IG_ADVANCED_POST[];
  baselines: ContentLabBaselines;
};

function instagramFormat(post: IG_ADVANCED_POST): ContentLabFormat {
  if (post.productType === "clips" || post.mediaType === IG_MEDIA_TYPE.VIDEO) return "reel";
  if (post.mediaType === IG_MEDIA_TYPE.CAROUSEL) return "carousel";
  return "post";
}

/** Plays (Reels tab) first, the embed page's view count as a fallback; photos have none. */
const instagramViews = (post: IG_ADVANCED_POST) => post.playCount ?? post.viewCount ?? null;

function creatorFromProfile(username: string, profile: INSTAGRAM_RESPONSE | undefined, post?: IG_ADVANCED_POST): CONTENT_LAB_CREATOR {
  return {
    platform: "instagram",
    id: username,
    handle: `@${username}`,
    name: profile?.fullName ?? post?.user?.fullName ?? null,
    url: profile?.instagramUrl ?? `${INSTAGRAM_BASE_URL}/${username}/`,
    followers: profile?.followers ?? null,
    avatarUrl: profile?.profilePictureHd ?? profile?.profilePicture ?? post?.user?.profilePicUrl ?? null,
    bio: profile?.bio?.trim() || null,
  };
}

function toContentLabPost(post: IG_ADVANCED_POST, creator: CONTENT_LAB_CREATOR, baselines: ContentLabBaselines): CONTENT_LAB_POST {
  const format = instagramFormat(post);
  const code = post.shortcode ?? post.pk ?? "";
  return buildContentLabPost(
    {
      platform: "instagram",
      nativeId: code,
      format,
      url: post.url ?? `${INSTAGRAM_BASE_URL}/${format === "reel" ? "reel" : "p"}/${code}/`,
      title: firstLine(post.caption),
      thumbnailUrl: post.imageUrl,
      publishedAt: post.takenAt ? new Date(post.takenAt * 1000).toISOString() : null,
      views: format === "reel" ? instagramViews(post) : null,
      likes: post.likeCount,
      comments: post.commentCount,
      durationSeconds: null,
      creator,
    },
    baselines,
  );
}

/** One creator's recent grid (+ profile for followers) and its median per format family. */
async function fetchInstagramCreatorPosts(username: string, country: string, pages = 1): Promise<InstagramCreatorPosts> {
  const [grid, profiles] = await Promise.all([
    fetchInstagramAdvancedPosts({ username, count: CONTENT_LAB_INSTAGRAM_PAGE_SIZE, pages }),
    fetchFromEntities([username], country).catch(() => []),
  ]);
  const baselines = baselineByFamily(
    grid.posts.map((p) => {
      const format = instagramFormat(p);
      return { format, views: format === "reel" ? instagramViews(p) : null, likes: p.likeCount };
    }),
  );
  return { creator: creatorFromProfile(grid.username, profiles[0], grid.posts[0]), posts: grid.posts, baselines };
}

/** A single post by shortcode, with its embed view count for videos. */
async function fetchInstagramPost(shortcode: string): Promise<IG_ADVANCED_POST | null> {
  const mediaId = mediaIdFromShortcode(shortcode);
  const raw = mediaId ? await fetchLoggedOutMedia(mediaId).catch(() => null) : null;
  if (!raw) return null;
  const post = mapFeedItem(raw);
  if (post.isVideo && post.viewCount === null) {
    post.viewCount = await readEmbedNumber(IG_POST_EMBED_URL(shortcode), "video_view_count").catch(() => null);
  }
  return post;
}

// ─── explore ────────────────────────────────────────────────────────────────

type TabConnection = { xig_user_by_username: Record<string, IgPolarisConnection<IgFeedItem> | null | undefined> | null };

/**
 * What explore reads of a creator: three logged-out queries in parallel
 * (~1.5 s, cached). The Reels tab is the only guest source of plays (newest
 * 12 reels, no captions); the Posts tab gives captions and media types
 * (newest 12, no counts); the profile gives name, followers, picture, bio.
 * Photo likes need a post query each, so the photo baseline loads only when
 * a photo post of theirs shows up.
 */
type InstagramExploreCreator = {
  creator: CONTENT_LAB_CREATOR;
  reels: IgFeedItem[];
  captions: Map<string, string>;
  baselines: ContentLabBaselines;
  photoBaseline: () => Promise<number | null>;
};

const exploreCreatorCache = createTtlCache<InstagramExploreCreator>(CONTENT_LAB_CACHE.creatorTtlMs, CONTENT_LAB_CACHE.creatorMaxEntries);

const tabEdges = (data: TabConnection | null, key: string) =>
  (data?.xig_user_by_username?.[key]?.edges ?? []).flatMap((e) => (e.node ? [e.node] : []));

function fetchExploreCreator(username: string, fallbackName: string | null): Promise<InstagramExploreCreator> {
  return exploreCreatorCache.get(username.toLowerCase(), async () => {
    const page = { username, first: CONTENT_LAB_INSTAGRAM_PAGE_SIZE };
    const [profile, reelsTab, postsTab] = await Promise.all([
      igLoggedOutQuery<{ xig_user_by_username: XigUserByUsername | null }>("profile", { username }).catch(() => null),
      igLoggedOutQuery<TabConnection>("reels", page).catch(() => null),
      igLoggedOutQuery<TabConnection>("posts", page).catch(() => null),
    ]);
    const reels = tabEdges(reelsTab, "polaris_clips_connection");
    const grid = tabEdges(postsTab, "polaris_ordered_timeline_connection");
    if (reels.length === 0 && grid.length === 0) throw new Error(`Instagram creator could not be loaded (@${username})`);

    const user = profile?.xig_user_by_username;
    const creator: CONTENT_LAB_CREATOR = {
      platform: "instagram",
      id: username,
      handle: `@${username}`,
      name: user?.full_name || fallbackName,
      url: `${INSTAGRAM_BASE_URL}/${username}/`,
      followers: user?.follower_count ?? null,
      avatarUrl: user?.profile_pic_url ?? null,
      bio: user?.biography?.trim() || null,
    };
    const captions = new Map(grid.flatMap((n) => (n.pk != null && n.caption?.text ? [[String(n.pk), n.caption.text]] : [])));
    const baselines = baselineByFamily(reels.map((r) => ({ format: "reel" as const, views: r.play_count ?? null, likes: r.like_count ?? null })));

    let photo: Promise<number | null> | null = null;
    const photoBaseline = () =>
      (photo ??= (async () => {
        const photos = grid
          .filter((n) => n.media_type !== IG_MEDIA_TYPE.VIDEO && n.product_type !== "clips" && n.pk != null)
          .slice(0, CONTENT_LAB_INSTAGRAM_PHOTO_BASELINE_POSTS);
        const full = await runWithConcurrency(photos, IG_GRAPHQL_CONCURRENCY, (n) => fetchLoggedOutMedia(String(n.pk)).catch(() => null));
        return baselineByFamily(full.flatMap((m) => (m ? [{ format: "post" as const, views: null, likes: m.like_count ?? null }] : []))).photo;
      })());
    return { creator, reels, captions, baselines, photoBaseline };
  });
}

type InstagramSearch = { kind: "reel" | "post"; text: string; time: "month" | "year" | undefined };

const GSEARCH_TIME: Record<"month" | "year", GSEARCH_TIME_FILTER> = {
  month: GSEARCH_TIME_FILTER.LAST_MONTH,
  year: GSEARCH_TIME_FILTER.LAST_YEAR,
};

/** The full search list for a topic (`CONTENT_LAB_INSTAGRAM_SEARCHES`), with `{q}` / `{tag}` filled in. */
function instagramSearches(query: string, tags: readonly string[]): InstagramSearch[] {
  const S = CONTENT_LAB_INSTAGRAM_SEARCHES;
  const fill = (s: InstagramSearch, tag = "") => ({ ...s, text: s.text.replace("{q}", query).replace("{tag}", `#${tag}`) });
  return [...S.first.map((s) => fill(s)), ...tags.slice(0, S.tags).map((tag) => fill(S.perTag, tag)), ...S.last.map((s) => fill(s))];
}

/** GSearch → post / reel shortcodes, newest-first order kept per search. */
async function runInstagramSearch(search: InstagramSearch, country: string): Promise<string[]> {
  const { results } = await fetchGsearch({
    searchQuery: buildContentGsearchQuery(search.text, search.kind === "reel" ? IG_CONTENT_KIND.REEL : IG_CONTENT_KIND.POST),
    country,
    pages: 1,
    ...(search.time ? { timeFilter: GSEARCH_TIME[search.time] } : {}),
  });
  return results.flatMap((row) => {
    const c = row.url ? classifyInstagramContentUrl(row.url) : null;
    return c?.shortcode && (c.kind === IG_CONTENT_KIND.REEL || c.kind === IG_CONTENT_KIND.POST) ? [c.shortcode] : [];
  });
}

/**
 * The searches in parallel. Once the first returns, the rest get
 * `instagramSearchStraggler` more ms (all of it inside `instagramSearch`), so
 * one slow proxy call can't hold the page. Null = that search failed or was
 * still running (the caller retries it next page); `error` = the last failure.
 */
async function runInstagramSearches(
  searches: InstagramSearch[],
  country: string,
): Promise<{ lists: Array<string[] | null>; error: unknown }> {
  const B = CONTENT_LAB_BUDGET_MS;
  const hardStop = Date.now() + B.instagramSearch;
  const lists: Array<string[] | null> = searches.map(() => null);
  let error: unknown = null;
  let markFirst = () => {};
  const first = new Promise<void>((resolve) => (markFirst = resolve));
  const all = Promise.all(
    searches.map((s, i) =>
      runInstagramSearch(s, country).then(
        (codes) => {
          lists[i] = codes;
          markFirst();
        },
        (err) => {
          error = err;
        },
      ),
    ),
  );
  await beforeDeadline(Promise.race([all, first]), hardStop);
  await beforeDeadline(all, Math.min(hardStop, Date.now() + B.instagramSearchStraggler));
  return { lists: [...lists], error };
}

/** An Instagram post to carry to the next page, or null once it has been carried `maxCarries` times. */
export function instagramPending(post: CONTENT_LAB_POST, carried: number): [string, number] | null {
  return carried >= CONTENT_LAB_CARRY.maxCarries ? null : [post.id.slice("instagram:".length), carried + 1];
}

const instagramPostId = (shortcode: string) => `instagram:${shortcode}`;

const takenAtIso = (pk: string | number | null | undefined) => {
  const at = pk == null ? null : takenAtFromMediaId(String(pk));
  return at === null ? null : new Date(at * 1000).toISOString();
};

/**
 * A creator's newest reels on the searched topic (caption from the Posts tab)
 * that beat their usual, best first, up to CONTENT_LAB_EXPANSION_PER_CREATOR.
 */
function instagramCreatorWinners(
  creator: InstagramExploreCreator,
  topic: readonly string[],
  isSeen: (postId: string) => boolean,
  taken: ReadonlySet<string>,
): CONTENT_LAB_POST[] {
  const winners = creator.reels.flatMap((reel) => {
    const caption = reel.pk != null ? creator.captions.get(String(reel.pk)) : undefined;
    if (!reel.code || !caption || !matchesTopic(firstLine(caption), topic)) return [];
    const id = instagramPostId(reel.code);
    if (taken.has(id) || isSeen(id)) return [];
    // The Reels tab carries no date: the pk has it.
    const post = mapFeedItem({ ...reel, caption: { text: caption }, taken_at: reel.taken_at ?? takenAtFromMediaId(String(reel.pk)) ?? undefined });
    const built = toContentLabPost(post, creator.creator, creator.baselines);
    return !isTooOld(built.publishedAt) && (built.multiple ?? 0) >= CONTENT_LAB_OUTLIER_MULTIPLE && meetsFloor(built) ? [built] : [];
  });
  return rankPosts(winners).slice(0, CONTENT_LAB_EXPANSION_PER_CREATOR);
}

/**
 * `carried`: post id → times it was carried before this page (to carry it
 * again with `instagramPending`). `error`: this page fell short because
 * Instagram was slow; what was late is carried or retried next page.
 */
export type InstagramExplorePage = {
  posts: CONTENT_LAB_POST[];
  state: InstagramExploreState;
  carried: Map<string, number>;
  error?: string;
};

/** True when the Instagram state has no search left to read and nothing to retry or carry. */
export const instagramDone = (state: InstagramExploreState) => Boolean(state.d) && !state.r?.length && !state.p?.length;

/** Settled "nothing there": a deleted / gated post, an owner that failed, an embed with no count. */
const GONE = "gone" as const;

/**
 * One page of Instagram explore, inside CONTENT_LAB_BUDGET_MS (searches ≤ 12 s,
 * lookups ≤ 12 s after them):
 * 1. Shortcodes carried from the last page come first. With a page's worth
 *    (CONTENT_LAB_INSTAGRAM_HITS_PER_PAGE) of them, no search runs this page.
 * 2. Otherwise the searches to retry plus this page's new GSearch searches,
 *    in parallel (page 1: the topic's reels this month and this year, and
 *    "{topic} viral" reels this year; later pages: reels for related
 *    hashtags, then photo posts). A search that failed or was too slow is
 *    retried once, next page.
 * 3. Shortcodes dated by their media id: seen and too-old ones are dropped
 *    before any request.
 * 4. Up to HITS_PER_PAGE hits' post queries (owner, caption, likes, date),
 *    each owner's fetch starting as their first hit resolves
 *    (`fetchExploreCreator`, the first `maxInstagramCreatorsPerPage` new ones;
 *    cached owners are free), then plays from each owner's Reels tab (else
 *    the embed page). A hit that was late, past the cap, or whose owner was
 *    late or past the owner cap is carried to the next page; one that is
 *    gone is dropped.
 * 5. Each owner's other on-topic reels that beat their usual.
 * Posts below their creator's usual that are also small on their own
 * (`isWorthShowing`) are dropped, not carried.
 */
export async function exploreInstagram(
  query: string,
  country: string,
  state: InstagramExploreState | undefined,
  isSeen: (postId: string) => boolean,
): Promise<InstagramExplorePage> {
  const S = CONTENT_LAB_INSTAGRAM_SEARCHES;
  const start = state?.i ?? 0;
  // Caught here: the lookup can throw before its own try (opening the session).
  const tagsPromise: Promise<string[]> = state?.tags
    ? Promise.resolve(state.tags)
    : searchInstagramHashtags(query).then((tags) => tags.map((t) => t.name)).catch(() => []);
  const carriedIn = (state?.p ?? []).filter(([code]) => !isSeen(instagramPostId(code)));
  const carried = new Map(carriedIn.map(([code, times]) => [instagramPostId(code), times]));
  const fetched = carriedIn.length < CONTENT_LAB_INSTAGRAM_HITS_PER_PAGE;

  // Page 1 doesn't need the tags yet (its searches come before the tag ones).
  const list = instagramSearches(query, start === 0 ? [] : await tagsPromise);
  const retry = fetched ? (state?.r ?? []) : [];
  const fresh: number[] = [];
  if (fetched && !state?.d) {
    const want = Math.max(1, (start === 0 ? S.first.length : S.perPage) - retry.length);
    for (let i = start; i < Math.min(list.length, start + want); i++) fresh.push(i);
  }
  const indices = [...retry, ...fresh];
  const searches = indices.flatMap((i) => (list[i] ? [list[i]!] : []));

  const startedAt = Date.now();
  const { lists, error: searchError } = await runInstagramSearches(searches, country);
  const searchedAt = Date.now();
  const allSearchesFailed = searches.length > 0 && lists.every((l) => l === null);
  if (allSearchesFailed && !state) throw searchError ?? new Error("Instagram search timed out");
  // A search that failed or was late: retried once more next page.
  const retryNext = indices.filter((idx, k) => lists[k] === null && !retry.includes(idx));
  const nextIndex = start + fresh.length;

  const deadline = searchedAt + CONTENT_LAB_BUDGET_MS.instagram;
  // Interleave the searches so the owner cap takes some of each.
  const codes: string[] = carriedIn.map(([code]) => code);
  const found = lists.map((l) => l ?? []);
  for (let i = 0; found.some((l) => i < l.length); i++) for (const l of found) if (l[i]) codes.push(l[i]!);
  const hits = [...new Set(codes)].filter((code) => {
    const mediaId = mediaIdFromShortcode(code);
    return mediaId !== null && !isSeen(instagramPostId(code)) && !isTooOld(takenAtIso(mediaId));
  });

  // Steps 4, pipelined: each hit's post query; an owner's fetch starts the
  // moment their first hit resolves, so owners load while other hits are
  // still resolving. Lookups stop `instagramOwnerLead` before the deadline so
  // the owners they started can still finish. Owner promise: the creator,
  // GONE (failed), or null (still loading at the deadline).
  const owners = new Map<string, Promise<InstagramExploreCreator | typeof GONE | null>>();
  let newOwners = 0;
  const ownerSlot = createLimiter(CONTENT_LAB_CONCURRENCY.instagramCreators);
  const startOwner = (owner: string, name: string | null): boolean => {
    if (owners.has(owner)) return true;
    const isNew = !exploreCreatorCache.has(owner);
    if (isNew && newOwners >= CONTENT_LAB_LIMITS.maxInstagramCreatorsPerPage) return false;
    if (isNew) newOwners++;
    owners.set(
      owner,
      beforeDeadline(
        ownerSlot(() => fetchExploreCreator(owner, name)).catch((err) => {
          console.warn("[content-lab] Instagram owner failed:", owner, errorMessage(err));
          return GONE;
        }),
        deadline,
      ),
    );
    return true;
  };
  const lookupStop = deadline - CONTENT_LAB_BUDGET_MS.instagramOwnerLead;
  const late: string[] = hits.slice(CONTENT_LAB_INSTAGRAM_HITS_PER_PAGE);
  const medias = await runWithConcurrency(hits.slice(0, CONTENT_LAB_INSTAGRAM_HITS_PER_PAGE), CONTENT_LAB_CONCURRENCY.instagramHits, async (code) => {
    if (Date.now() >= lookupStop) {
      late.push(code);
      return null;
    }
    const media = await beforeDeadline(
      fetchLoggedOutMedia(mediaIdFromShortcode(code)!).then((m) => m ?? GONE, () => GONE),
      lookupStop,
    );
    if (media === null) late.push(code);
    const owner = media && media !== GONE ? media.user?.username?.toLowerCase() : undefined;
    if (!media || media === GONE || !owner) return null;
    if (!startOwner(owner, media.user?.full_name ?? null)) {
      late.push(code); // past this page's owner cap
      return null;
    }
    // A reel older than its owner's newest 12 has no play count there; its
    // embed page's view count is read now, alongside the owner (2 tries).
    const embedViews: Promise<number | typeof GONE | null> = media.product_type === "clips" || media.media_type === IG_MEDIA_TYPE.VIDEO
      ? beforeDeadline(readEmbedNumber(IG_POST_EMBED_URL(code), "video_view_count", CONTENT_LAB_INSTAGRAM_EMBED_TRIES).then((v) => v ?? GONE, () => GONE), deadline)
      : Promise.resolve(GONE);
    return { code, media, owner, embedViews };
  });
  const resolved = medias.filter((m): m is NonNullable<typeof m> => m !== null);
  const resolvedAt = Date.now();
  const loaded = await Promise.all([...owners.values()]);
  const creators = new Map<string, InstagramExploreCreator | typeof GONE | null>([...owners.keys()].map((owner, i) => [owner, loaded[i]!]));

  // Posts. Reel plays come from the owner's newest 12 reels, else the embed
  // page's view count; a reel whose count is gone is dropped, a late one carried.
  const posts = await runWithConcurrency(resolved, CONTENT_LAB_CONCURRENCY.instagramCreators, async ({ code, media, owner, embedViews }) => {
    const creator = creators.get(owner);
    if (creator === GONE) return null;
    if (!creator) {
      late.push(code);
      return null;
    }
    const post = mapFeedItem(media);
    let baselines = creator.baselines;
    if (instagramFormat(post) === "reel") {
      const plays = creator.reels.find((r) => r.code === code)?.play_count;
      if (plays != null) post.playCount = plays;
      else {
        const views = await embedViews;
        if (views === null) late.push(code);
        if (views === null || views === GONE) return null;
        post.viewCount = views;
      }
    } else {
      baselines = { ...baselines, photo: await beforeDeadline(creator.photoBaseline(), deadline) };
    }
    return toContentLabPost({ ...post, shortcode: code }, creator.creator, baselines);
  });
  // Below their usual and small on their own: not what "what's working" is for.
  const built = posts.filter((p): p is CONTENT_LAB_POST => p !== null && isWorthShowing(p));
  const loadedCreators = [...creators.values()].filter((c): c is InstagramExploreCreator => Boolean(c) && c !== GONE);
  console.log(
    `[content-lab] instagram page: ${searches.length} searches ${searchedAt - startedAt} ms → ${hits.length} hits, ` +
      `${resolved.length} resolved ${resolvedAt - searchedAt} ms → ${loadedCreators.length}/${owners.size} owners ` +
      `${Date.now() - resolvedAt} ms → ${built.length} posts, ${late.length} carried`,
  );

  const topic = topicWords(query);
  const taken = new Set([...built.map((p) => p.id), ...late.map(instagramPostId)]);
  for (const creator of loadedCreators) {
    for (const post of instagramCreatorWinners(creator, topic, isSeen, taken)) {
      built.push(post);
      taken.add(post.id);
    }
  }

  const pending = late.flatMap((code): Array<[string, number]> => {
    const times = carried.get(instagramPostId(code)) ?? 0;
    return times < CONTENT_LAB_CARRY.maxCarries ? [[code, times + 1]] : [];
  });
  const tags = await tagsPromise;
  const total = instagramSearches(query, tags).length;
  // Late owners and searches keep going and land in the cache, and late hits
  // are carried, so "scroll for more" really does pick them up.
  const slow = built.length === 0 && (pending.length > 0 || retryNext.length > 0 || allSearchesFailed);
  return {
    posts: built,
    state: { i: nextIndex, tags, r: retryNext, p: pending, ...(nextIndex >= total ? { d: true } : {}) },
    carried,
    ...(slow ? { error: CONTENT_LAB_ERROR_MESSAGES.INSTAGRAM_SLOW } : {}),
  };
}

// ─── suggest ────────────────────────────────────────────────────────────────

/**
 * Instagram has no guest user search (it redirects to login), so type-ahead
 * looks up the handles the text could be: as typed, and for several words
 * joined plain / with "." / with "_". One profile query each, in parallel
 * (~0.5 s). Only exact handles match; a display name alone finds nothing.
 */
export async function suggestInstagramCreators(query: string): Promise<CONTENT_LAB_SUGGESTION[]> {
  const raw = (extractUsername(query) ?? query).trim().toLowerCase();
  const words = raw.split(/\s+/).filter(Boolean);
  const candidates = [...new Set(words.length > 1 ? [words.join(""), words.join("."), words.join("_")] : [raw])]
    .filter((c) => INSTAGRAM_USERNAME_REGEX.test(c) && c.length <= 30);
  const found = await Promise.all(
    candidates.map((username) =>
      igLoggedOutQuery<{ xig_user_by_username: XigUserByUsername | null }>("profile", { username })
        .then((d) => d?.xig_user_by_username ?? null)
        .catch(() => null),
    ),
  );
  return found.flatMap((user) =>
    user?.username
      ? [{
          platform: "instagram" as const,
          handle: `@${user.username}`,
          name: user.full_name || null,
          avatarUrl: user.profile_pic_url ?? null,
          followers: user.follower_count ?? null,
          verified: Boolean(user.is_verified),
          url: `${INSTAGRAM_BASE_URL}/${user.username}/`,
        }]
      : [],
  );
}

// ─── creator ────────────────────────────────────────────────────────────────

export async function instagramCreator(handle: string, country: string, limit: number): Promise<CONTENT_LAB_CREATOR_RESPONSE> {
  const username = extractUsername(handle);
  if (!username) throw withStatusCode(CONTENT_LAB_ERROR_MESSAGES.INVALID_PARAMS, 400);
  const pages = Math.min(
    Math.ceil(CONTENT_LAB_LIMITS.baselineUploads / CONTENT_LAB_INSTAGRAM_PAGE_SIZE),
    Math.ceil(limit / CONTENT_LAB_INSTAGRAM_PAGE_SIZE),
  );
  const creator = await fetchInstagramCreatorPosts(username, country, pages).catch((err) => {
    throw withStatusCode(err instanceof Error ? err.message : CONTENT_LAB_ERROR_MESSAGES.NOT_FOUND, 404);
  });
  const posts = creator.posts.map((p) => toContentLabPost(p, creator.creator, creator.baselines));
  // usualViews: reels when they post enough of them, else likes on photo posts.
  const usual = creator.baselines.short ?? creator.baselines.photo;
  return {
    creator: creator.creator,
    usualViews: usual === null ? null : Math.round(usual),
    posts: sortNewestFirst(posts).slice(0, limit),
  };
}

// ─── breakdown ──────────────────────────────────────────────────────────────

export function parseInstagramUrl(url: string): string | null {
  const match = url.trim().match(/^(?:https?:\/\/)?(?:[\w-]+\.)?instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+)/i);
  return match?.[1] ?? null;
}

/** Caption first line = hook, carousel slides = structure, caption CTA, owner's grid = baseline. */
export async function instagramBreakdown(shortcode: string, country: string): Promise<CONTENT_LAB_BREAKDOWN_RESPONSE> {
  const single = await fetchInstagramPost(shortcode);
  const owner = single?.user?.username;
  if (!single || !owner) throw withStatusCode(CONTENT_LAB_ERROR_MESSAGES.NOT_FOUND, 404);

  const creator = await fetchInstagramCreatorPosts(owner, country).catch(() => null);
  const fromGrid = creator?.posts.find((p) => p.shortcode === shortcode);
  const source = fromGrid ?? single;
  const post = toContentLabPost(
    source,
    creator?.creator ?? creatorFromProfile(owner, undefined, single),
    creator?.baselines ?? { long: null, short: null, photo: null },
  );

  const caption = single.caption?.trim() || null;
  const hookLine = firstLine(caption);
  const ctaText = captionCta(caption);
  const cta = ctaText ? { text: ctaText, atPercent: null } : null;
  const hookType = hookLine ? classifyHook(hookLine) : null;
  const slides = single.carousel ?? [];

  return {
    post,
    hook: { text: hookLine || null, type: hookType, seconds: null },
    structure: slides.map((slide, i) => ({
      label: `Slide ${i + 1}${slide.isVideo ? " (video)" : ""}`,
      startSeconds: null,
      endSeconds: null,
    })),
    cta,
    // Comments are login-only to guests: no rewatch moments or top comments on Instagram.
    audience: { rewatchedSeconds: [], topComments: [] },
    text: caption,
    whyItWorked: computeWhyItWorked({ ...post, hookType, cta, slideCount: slides.length }),
  };
}
