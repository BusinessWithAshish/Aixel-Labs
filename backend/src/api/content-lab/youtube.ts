import { withStatusCode } from "../../config";
import { YT_CHANNEL_CONTENT_TYPE } from "../youtube/channel/constants";
import { fetchYoutubeChannel } from "../youtube/channel/helpers";
import type {
  YOUTUBE_CHANNEL_INFO,
  YOUTUBE_CHANNEL_RESPONSE,
  YOUTUBE_CHANNEL_SHORT_ITEM,
  YOUTUBE_CHANNEL_VIDEO_ITEM,
} from "../youtube/channel/types";
import { commentsIntelligenceService } from "../youtube/intelligence/comments/service";
import { transcriptIntelligenceService } from "../youtube/intelligence/transcript/service";
import { runWithConcurrency } from "../youtube/concurrency";
import { YOUTUBE_BASE_URL, YOUTUBE_SEARCH_SORT_SP, YOUTUBE_VIDEO_URL, YT_SEARCH_FILTER } from "../youtube/constants";
import { resolveYoutubeHandleToChannelId } from "../youtube/handle/helpers";
import { parseYoutubeVideoId } from "../youtube/helpers";
import { isSearchVideoItem } from "../youtube/intelligence/type-guards";
import { fetchYoutubeSearchBatch, type YOUTUBE_SEARCH_BATCH_RESPONSE } from "../youtube/search/helpers";
import type {
  YOUTUBE_SEARCH_CHANNEL_ITEM,
  YOUTUBE_SEARCH_RESPONSE_ITEM,
  YOUTUBE_SEARCH_VIDEO_ITEM,
} from "../youtube/search/types";
import { fetchVideoWatchMetaByVideoIds } from "../youtube/video-meta";
import { fetchYoutubeVideoDetails } from "../youtube/video/helpers";
import type { YT_THUMBNAIL } from "../youtube/types";
import { createTtlCache } from "./cache";
import {
  baselineByFamily,
  computeWhyItWorked,
  isTooOld,
  matchesTopic,
  meetsFloor,
  rankPosts,
  relativeTimeToIso,
  topicWords,
} from "./compute";
import {
  CONTENT_LAB_BREAKDOWN_COMMENTS,
  CONTENT_LAB_BUDGET_MS,
  CONTENT_LAB_CACHE,
  CONTENT_LAB_CARRY,
  CONTENT_LAB_CONCURRENCY,
  CONTENT_LAB_ERROR_MESSAGES,
  CONTENT_LAB_EXPANSION_PER_CREATOR,
  CONTENT_LAB_HOOK_MAX_CHARS,
  CONTENT_LAB_LIMITS,
  CONTENT_LAB_OUTLIER_MULTIPLE,
  CONTENT_LAB_YOUTUBE_SHORT_MAX_SECONDS,
  CONTENT_LAB_YOUTUBE_STREAMS,
} from "./constants";
import type { YoutubeExploreState, YoutubePendingHit } from "./cursor";
import { beforeDeadline, buildContentLabPost, errorMessage, sortNewestFirst, type ContentLabBaselines } from "./helpers";
import type {
  CONTENT_LAB_BREAKDOWN_RESPONSE,
  CONTENT_LAB_CREATOR,
  CONTENT_LAB_CREATOR_RESPONSE,
  CONTENT_LAB_POST,
  CONTENT_LAB_SEGMENT,
  CONTENT_LAB_SUGGESTION,
} from "./types";

type YoutubeTab = "videos" | "shorts";

type YoutubeChannelUploads = {
  creator: CONTENT_LAB_CREATOR;
  videos: YOUTUBE_CHANNEL_VIDEO_ITEM[];
  shorts: YOUTUBE_CHANNEL_SHORT_ITEM[];
  baselines: ContentLabBaselines;
};

/** get_watch lookups per parallel chunk in `enrichYoutubePosts`. */
const YOUTUBE_WATCH_CHUNK = 8;

const shortsUrl = (id: string) => `${YOUTUBE_BASE_URL}/shorts/${id}`;
const largestThumbnail = (list: YT_THUMBNAIL[] | null | undefined) => list?.at(-1)?.url ?? null;

/** yt3.ggpht avatars arrive protocol-relative ("//yt3…"). */
export const absoluteYoutubeUrl = (url: string | null | undefined) => (url ? (url.startsWith("//") ? `https:${url}` : url) : null);

function creatorFromChannel(channelId: string, info: YOUTUBE_CHANNEL_INFO | null): CONTENT_LAB_CREATOR {
  const handle = info?.handle ? `@${info.handle.replace(/^@/, "")}` : null;
  return {
    platform: "youtube",
    id: channelId,
    handle,
    name: info?.title ?? null,
    url: info?.handleUrl ?? info?.channelUrl ?? `${YOUTUBE_BASE_URL}/channel/${channelId}`,
    followers: info?.subscribers ?? null,
    avatarUrl: absoluteYoutubeUrl(largestThumbnail(info?.avatar)),
    bio: info?.description?.trim() || null,
  };
}

// Each tab of a channel, cached: explore pages, repeat searches, creator reads
// and breakdowns of the same channel share one fetch for CONTENT_LAB_CACHE.creatorTtlMs.
const channelTabCache = createTtlCache<YOUTUBE_CHANNEL_RESPONSE>(CONTENT_LAB_CACHE.creatorTtlMs, CONTENT_LAB_CACHE.creatorMaxEntries);
const tabKey = (channelId: string, tab: YoutubeTab, country: string) => `${channelId}:${tab}:${country}`;

function fetchChannelTab(channelId: string, tab: YoutubeTab, country: string): Promise<YOUTUBE_CHANNEL_RESPONSE> {
  return channelTabCache.get(tabKey(channelId, tab, country), () =>
    fetchYoutubeChannel({
      channelId,
      contentType: tab === "shorts" ? YT_CHANNEL_CONTENT_TYPE.SHORTS : YT_CHANNEL_CONTENT_TYPE.VIDEOS,
      limit: CONTENT_LAB_LIMITS.baselineUploads,
      country,
    }),
  );
}

/** Tabs a channel needs for the given durations: Shorts run ≤ 3 min, long videos > 1 min. */
function tabsFor(durations: Array<number | null>): YoutubeTab[] {
  const tabs = new Set<YoutubeTab>();
  for (const d of durations) {
    if (d === null || d <= CONTENT_LAB_YOUTUBE_SHORT_MAX_SECONDS) tabs.add("shorts");
    if (d === null || d > 60) tabs.add("videos");
  }
  return [...tabs];
}

/** A channel's recent uploads (the requested tabs) and its median views per format family. */
async function fetchYoutubeChannelUploads(
  channelId: string,
  tabs: YoutubeTab[],
  country: string,
): Promise<YoutubeChannelUploads> {
  const fetchTab = (tab: YoutubeTab) => fetchChannelTab(channelId, tab, country);
  const [videosTab, shortsTab] = await Promise.all([
    tabs.includes("videos") ? fetchTab("videos") : null,
    tabs.includes("shorts") ? fetchTab("shorts").catch(() => null) : null,
  ]);
  const videos = (videosTab?.items ?? []) as YOUTUBE_CHANNEL_VIDEO_ITEM[];
  const shorts = (shortsTab?.items ?? []) as YOUTUBE_CHANNEL_SHORT_ITEM[];
  const info = videosTab?.channelInfo ?? shortsTab?.channelInfo ?? null;
  const baselines = baselineByFamily([
    ...videos.map((v) => ({ format: "video" as const, views: v.views, likes: null })),
    ...shorts.map((s) => ({ format: "short" as const, views: s.views, likes: null })),
  ]);
  return { creator: creatorFromChannel(channelId, info), videos, shorts, baselines };
}

function youtubeFormat(
  videoId: string,
  durationSeconds: number | null,
  uploads: Pick<YoutubeChannelUploads, "videos" | "shorts">,
  isShortsUrl = false,
): "video" | "short" {
  if (isShortsUrl || uploads.shorts.some((s) => s.shortId === videoId)) return "short";
  if (uploads.videos.some((v) => v.videoId === videoId)) return "video";
  return durationSeconds !== null && durationSeconds <= 60 ? "short" : "video";
}

// ─── explore ────────────────────────────────────────────────────────────────

type YoutubeHit = YOUTUBE_SEARCH_VIDEO_ITEM & { videoId: string; channelId: string };

const isYoutubeHit = (item: YOUTUBE_SEARCH_RESPONSE_ITEM | undefined): item is YoutubeHit =>
  Boolean(item && isSearchVideoItem(item) && item.videoId && item.channelId);

const youtubePostId = (videoId: string) => `youtube:${videoId}`;

/** A video to score this page: from a search batch, or carried over in the cursor (`YoutubePendingHit`). */
type YoutubeCandidate = YoutubePendingHit & { thumb: string | null };

const epochSeconds = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
};

const fromSearchHit = (hit: YoutubeHit): YoutubeCandidate => ({
  v: hit.videoId,
  c: hit.channelId,
  t: hit.title ?? "",
  n: hit.viewCount,
  d: hit.duration,
  p: epochSeconds(relativeTimeToIso(hit.publishedTimeText)),
  a: 0,
  thumb: largestThumbnail(hit.thumbnails),
});

// A carried hit keeps no thumbnail URL (it would double its size); every video has this one.
const fromPending = (hit: YoutubePendingHit): YoutubeCandidate => ({ ...hit, thumb: `https://i.ytimg.com/vi/${hit.v}/hqdefault.jpg` });

/**
 * A YouTube post (or late hit) to carry to the next page, or null once it has
 * been carried `CONTENT_LAB_CARRY.maxCarries` times. `carried` = times so far.
 */
export function youtubePending(post: CONTENT_LAB_POST, carried: number): YoutubePendingHit | null {
  if (carried >= CONTENT_LAB_CARRY.maxCarries) return null;
  return {
    v: post.id.slice("youtube:".length),
    c: post.creator.id,
    t: post.title.slice(0, CONTENT_LAB_CARRY.titleChars),
    n: post.views,
    d: post.durationSeconds,
    p: epochSeconds(post.publishedAt),
    a: carried + 1,
  };
}

/**
 * Takes hits from the streams' batches in turn (most-viewed this month, this
 * year, relevance), skipping seen, repeated and too-old videos, until a
 * stream would bring in one more uncached channel than `maxCreatorsPerPlatform`
 * allows (carried hits' channels count first). That stream stops there and
 * its offset is kept, so the next page reads on from the same hit and nothing
 * found is skipped. A batch that failed (null) keeps its place and is tried
 * again next page, up to `maxBatchFailures` times in a row; a stream not
 * fetched this page (`fetched` false) just keeps its place.
 */
function takeYoutubeHits(
  streams: YoutubeExploreState["s"],
  batches: Array<YOUTUBE_SEARCH_BATCH_RESPONSE | null>,
  fetched: boolean,
  carried: readonly YoutubeCandidate[],
  isSeen: (postId: string) => boolean,
  country: string,
): { hits: YoutubeCandidate[]; next: YoutubeExploreState["s"] } {
  const hits: YoutubeCandidate[] = [];
  const taken = new Set<string>(carried.map((h) => youtubePostId(h.v)));
  const channels = new Set<string>();
  let newChannels = 0;
  const cached = (channelId: string) =>
    channelTabCache.has(tabKey(channelId, "videos", country)) || channelTabCache.has(tabKey(channelId, "shorts", country));
  for (const h of carried) {
    if (channels.has(h.c)) continue;
    channels.add(h.c);
    if (!cached(h.c)) newChannels++;
  }
  const pos = streams.map((st) => st?.o ?? 0);
  const stopped = streams.map((st, i) => !st || !batches[i]);

  for (let moved = true; moved; ) {
    moved = false;
    for (let i = 0; i < streams.length; i++) {
      if (stopped[i]) continue;
      const items = batches[i]!.items;
      if (pos[i]! >= items.length) {
        stopped[i] = true;
        continue;
      }
      const item = items[pos[i]!];
      if (isYoutubeHit(item)) {
        const id = youtubePostId(item.videoId);
        const fresh = !taken.has(id) && !isSeen(id) && !isTooOld(relativeTimeToIso(item.publishedTimeText));
        if (fresh && !channels.has(item.channelId)) {
          const isNew = !cached(item.channelId);
          if (isNew && newChannels >= CONTENT_LAB_LIMITS.maxCreatorsPerPlatform) {
            stopped[i] = true;
            continue;
          }
          channels.add(item.channelId);
          if (isNew) newChannels++;
        }
        if (fresh) {
          hits.push(fromSearchHit(item));
          taken.add(id);
        }
      }
      pos[i] = pos[i]! + 1;
      moved = true;
    }
  }

  const next = streams.map((st, i) => {
    const batch = batches[i];
    if (!st) return null;
    if (!fetched) return st;
    if (!batch) {
      // Failed: same batch again next page, unless it keeps failing.
      const f = (st.f ?? 0) + 1;
      return f >= CONTENT_LAB_CARRY.maxBatchFailures ? null : { t: st.t, o: st.o, f };
    }
    if (pos[i]! < batch.items.length) return { t: st.t, o: pos[i]! };
    return batch.continuationToken ? { t: batch.continuationToken, o: 0 } : null;
  });
  return { hits, next };
}

/**
 * A channel's own recent uploads that are on the searched topic and beat
 * its usual, best first, up to CONTENT_LAB_EXPANSION_PER_CREATOR: the
 * channel's other winners for this topic, found at no extra request.
 */
function youtubeChannelWinners(
  channel: YoutubeChannelUploads,
  topic: readonly string[],
  isSeen: (postId: string) => boolean,
  taken: ReadonlySet<string>,
  now: Date,
): CONTENT_LAB_POST[] {
  const base = { platform: "youtube" as const, creator: channel.creator, likes: null, comments: null, durationSeconds: null };
  const candidates = [
    ...channel.videos.map((v) => ({ ...base, nativeId: v.videoId, format: "video" as const, url: YOUTUBE_VIDEO_URL(v.videoId), title: v.title ?? "", thumbnailUrl: largestThumbnail(v.thumbnail), publishedAt: relativeTimeToIso(v.publishedText, now), views: v.views })),
    ...channel.shorts.map((s) => ({ ...base, nativeId: s.shortId, format: "short" as const, url: shortsUrl(s.shortId), title: s.title ?? "", thumbnailUrl: largestThumbnail(s.thumbnail), publishedAt: relativeTimeToIso(s.publishedText, now), views: s.views })),
  ].filter((c) => {
    const id = youtubePostId(c.nativeId);
    return !taken.has(id) && !isSeen(id) && !isTooOld(c.publishedAt, now.getTime()) && matchesTopic(c.title, topic);
  });
  const winners = candidates
    .map((c) => buildContentLabPost(c, channel.baselines))
    .filter((p) => (p.multiple ?? 0) >= CONTENT_LAB_OUTLIER_MULTIPLE && meetsFloor(p));
  return rankPosts(winners, now.getTime()).slice(0, CONTENT_LAB_EXPANSION_PER_CREATOR);
}

/**
 * `carried`: post id → times it was carried before this page (to carry it
 * again with `youtubePending`). `error`: every search batch failed this page;
 * they are retried next page.
 */
export type YoutubeExplorePage = {
  posts: CONTENT_LAB_POST[];
  state: YoutubeExploreState;
  carried: Map<string, number>;
  error?: string;
};

/**
 * One page of YouTube explore. Hits carried in the cursor come first; with a
 * page's worth (`limit`) of them, no search is read this page. Otherwise the
 * search streams (CONTENT_LAB_YOUTUBE_STREAMS) each read their next batch in
 * parallel → hits taken in turn (`takeYoutubeHits`) → each hit channel's
 * recent uploads (cached) → a multiple per hit, plus each channel's other
 * on-topic winners. A hit whose channel is still loading at the deadline is
 * carried to the next page. Likes, comments and exact dates come later, only
 * for the posts a page returns (`enrichYoutubePosts`). The platform is done
 * once every stream has ended and nothing is carried.
 */
export async function exploreYoutube(
  query: string,
  country: string,
  state: YoutubeExploreState | undefined,
  isSeen: (postId: string) => boolean,
  limit: number,
): Promise<YoutubeExplorePage> {
  const streams = state?.s ?? CONTENT_LAB_YOUTUBE_STREAMS.map(() => ({ t: null, o: 0 }));
  const carried = (state?.p ?? []).filter((h) => !isSeen(youtubePostId(h.v))).map(fromPending);
  const fetched = carried.length < limit;
  const batches = await Promise.all(
    streams.map((st, i) =>
      st && fetched
        ? fetchYoutubeSearchBatch({ query, country, sp: YOUTUBE_SEARCH_SORT_SP[CONTENT_LAB_YOUTUBE_STREAMS[i]!], continuation: st.t }).catch((err) => {
            console.warn("[content-lab] YouTube search stream failed:", CONTENT_LAB_YOUTUBE_STREAMS[i], errorMessage(err));
            return null;
          })
        : null,
    ),
  );
  const allFailed = fetched && streams.some(Boolean) && batches.every((b) => b === null);
  if (allFailed && !state) throw new Error("YouTube search failed");

  const { hits: searched, next } = takeYoutubeHits(streams, batches, fetched, carried, isSeen, country);
  const hits = [...carried, ...searched];
  const channelIds = [...new Set(hits.map((h) => h.c))];
  const deadline = Date.now() + CONTENT_LAB_BUDGET_MS.youtubeCreators;
  // null = still loading at the deadline (carry its hits); "failed" = drop them.
  const uploads = await runWithConcurrency(channelIds, CONTENT_LAB_CONCURRENCY.youtubeCreators, (channelId) =>
    beforeDeadline(
      fetchYoutubeChannelUploads(channelId, tabsFor(hits.filter((h) => h.c === channelId).map((h) => h.d)), country).catch((err) => {
        console.warn("[content-lab] YouTube channel failed:", channelId, errorMessage(err));
        return "failed" as const;
      }),
      deadline,
    ),
  );
  const uploadsByChannel = new Map(channelIds.map((id, i) => [id, uploads[i]]));

  const pending: YoutubePendingHit[] = [];
  const carriedBefore = new Map<string, number>();
  const posts: CONTENT_LAB_POST[] = [];
  for (const hit of hits) {
    const channel = uploadsByChannel.get(hit.c);
    if (channel === "failed") continue;
    if (!channel) {
      if (hit.a < CONTENT_LAB_CARRY.maxCarries) pending.push({ v: hit.v, c: hit.c, t: hit.t, n: hit.n, d: hit.d, p: hit.p, a: hit.a + 1 });
      continue;
    }
    const format = youtubeFormat(hit.v, hit.d, channel);
    const post = buildContentLabPost(
      {
        platform: "youtube",
        nativeId: hit.v,
        format,
        url: format === "short" ? shortsUrl(hit.v) : YOUTUBE_VIDEO_URL(hit.v),
        title: hit.t,
        thumbnailUrl: hit.thumb,
        publishedAt: hit.p === null ? null : new Date(hit.p * 1000).toISOString(),
        views: hit.n,
        likes: null,
        comments: null,
        durationSeconds: hit.d,
        creator: channel.creator,
      },
      channel.baselines,
    );
    posts.push(post);
    carriedBefore.set(post.id, hit.a);
  }

  const topic = topicWords(query);
  const taken = new Set([...posts.map((p) => p.id), ...pending.map((h) => youtubePostId(h.v))]);
  const now = new Date();
  for (const channel of uploadsByChannel.values()) {
    if (!channel || channel === "failed") continue;
    for (const post of youtubeChannelWinners(channel, topic, isSeen, taken, now)) {
      posts.push(post);
      taken.add(post.id);
    }
  }
  return {
    posts,
    state: { s: next, p: pending },
    carried: carriedBefore,
    ...(allFailed ? { error: CONTENT_LAB_ERROR_MESSAGES.YOUTUBE_SEARCH_FAILED } : {}),
  };
}

/**
 * Likes, comments, exact publish date and length from `get_watch` for the
 * posts a page returns, in parallel chunks inside CONTENT_LAB_BUDGET_MS.youtubeWatch;
 * posts whose lookup is late keep their search-time values.
 */
export async function enrichYoutubePosts(posts: CONTENT_LAB_POST[], country: string): Promise<CONTENT_LAB_POST[]> {
  const ids = posts.filter((p) => p.platform === "youtube").map((p) => p.id.slice("youtube:".length));
  if (ids.length === 0) return posts;
  const deadline = Date.now() + CONTENT_LAB_BUDGET_MS.youtubeWatch;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += YOUTUBE_WATCH_CHUNK) chunks.push(ids.slice(i, i + YOUTUBE_WATCH_CHUNK));
  const maps = await Promise.all(
    chunks.map((chunk) => beforeDeadline(fetchVideoWatchMetaByVideoIds(chunk, { country }), deadline).catch(() => null)),
  );
  const meta = new Map(maps.flatMap((m) => (m ? [...m] : [])));
  return posts.map((post) => {
    const watch = post.platform === "youtube" ? meta.get(post.id.slice("youtube:".length)) : undefined;
    if (!watch) return post;
    return {
      ...post,
      publishedAt: watch.publishedAt ?? post.publishedAt,
      likes: watch.likeCount ?? post.likes,
      comments: watch.commentCount ?? post.comments,
      durationSeconds: watch.lengthSeconds ?? post.durationSeconds,
      creator: { ...post.creator, followers: post.creator.followers ?? watch.channelSubscribers ?? null },
    };
  });
}

// ─── suggest ────────────────────────────────────────────────────────────────

/** Channel search (one InnerTube call, ~0.5 s) → type-ahead rows. */
export async function suggestYoutubeCreators(query: string, country: string, limit: number): Promise<CONTENT_LAB_SUGGESTION[]> {
  const { items } = await fetchYoutubeSearchBatch({ query, country, sp: YOUTUBE_SEARCH_SORT_SP.CHANNEL, filter: YT_SEARCH_FILTER.CHANNEL });
  return items.flatMap((item) => {
    if (!("channelId" in item) || "videoId" in item || !item.channelId) return [];
    const channel = item as YOUTUBE_SEARCH_CHANNEL_ITEM;
    // The channel's URL path is its handle ("/@name"); the old layout put it in `handle` too.
    const handle = channel.channelUrl?.match(/\/@([^/?#]+)/)?.[1] ?? channel.handle?.match(/^@([\w.-]+)$/)?.[1] ?? null;
    return [{
      platform: "youtube" as const,
      handle: handle ? `@${decodeURIComponent(handle)}` : channel.channelId,
      name: channel.title,
      avatarUrl: absoluteYoutubeUrl(largestThumbnail(channel.thumbnails)),
      followers: channel.subscribers,
      verified: channel.isVerified,
      url: channel.channelUrl ?? `${YOUTUBE_BASE_URL}/channel/${channel.channelId}`,
    }];
  }).slice(0, limit);
}

// ─── creator ────────────────────────────────────────────────────────────────

/** "@handle", a youtube.com/@handle or /channel/UC… URL, or a bare channel id → channel id. */
async function resolveYoutubeChannelId(input: string, country: string): Promise<string> {
  const raw = input.trim();
  const channelMatch = raw.match(/(?:^|\/channel\/)(UC[\w-]{22})(?:[/?#]|$)/);
  if (channelMatch) return channelMatch[1]!;
  const handle = raw.match(/youtube\.com\/@([\w.-]+)/i)?.[1] ?? raw.replace(/^@/, "");
  if (!/^[\w.-]+$/.test(handle)) throw withStatusCode(CONTENT_LAB_ERROR_MESSAGES.INVALID_PARAMS, 400);
  return resolveYoutubeHandleToChannelId(handle, { country }).catch((err) => {
    throw withStatusCode(err instanceof Error ? err.message : CONTENT_LAB_ERROR_MESSAGES.NOT_FOUND, 404);
  });
}

export async function youtubeCreator(handle: string, country: string, limit: number): Promise<CONTENT_LAB_CREATOR_RESPONSE> {
  const channelId = await resolveYoutubeChannelId(handle, country);
  const channel = await fetchYoutubeChannelUploads(channelId, ["videos", "shorts"], country);
  const base = { creator: channel.creator, thumbnailUrl: null, likes: null, comments: null, durationSeconds: null, platform: "youtube" as const };
  // One clock, so uploads with the same "4 weeks ago" tie and keep the tab's order.
  const now = new Date();
  // The Shorts tab carries no date at all; get_watch for the newest `limit` gives one (and likes).
  const shortsMeta = await fetchVideoWatchMetaByVideoIds(
    channel.shorts.slice(0, limit).map((s) => s.shortId),
    { country },
  ).catch(() => new Map<string, never>());
  const posts = [
    ...channel.videos.map((v) =>
      buildContentLabPost(
        { ...base, nativeId: v.videoId, format: "video", url: YOUTUBE_VIDEO_URL(v.videoId), title: v.title ?? "", thumbnailUrl: largestThumbnail(v.thumbnail), publishedAt: relativeTimeToIso(v.publishedText, now), views: v.views },
        channel.baselines,
      ),
    ),
    ...channel.shorts.map((s) => {
      const meta = shortsMeta.get(s.shortId);
      return buildContentLabPost(
        {
          ...base,
          nativeId: s.shortId,
          format: "short",
          url: shortsUrl(s.shortId),
          title: s.title ?? "",
          thumbnailUrl: largestThumbnail(s.thumbnail),
          publishedAt: meta?.publishedAt ?? relativeTimeToIso(s.publishedText, now),
          views: s.views,
          likes: meta?.likeCount ?? null,
          comments: meta?.commentCount ?? null,
          durationSeconds: meta?.lengthSeconds ?? null,
        },
        channel.baselines,
      );
    }),
  ];
  // usualViews: the family that carries most of their uploads.
  const usualViews = channel.videos.length >= channel.shorts.length
    ? channel.baselines.long ?? channel.baselines.short
    : channel.baselines.short ?? channel.baselines.long;
  return {
    creator: channel.creator,
    usualViews: usualViews === null ? null : Math.round(usualViews),
    posts: sortNewestFirst(posts).slice(0, limit),
  };
}

// ─── breakdown ──────────────────────────────────────────────────────────────

const ZONE_LABELS: Record<string, string> = {
  intro: "Hook",
  early: "Setup",
  mid: "Main content",
  outro: "Ending",
};

/** First sentence or two of the opening, up to CONTENT_LAB_HOOK_MAX_CHARS. */
function hookText(intro: string): string | null {
  const text = intro.trim();
  if (!text) return null;
  const sentences = text.match(/[^.!?।]+[.!?।]?/g) ?? [text];
  let out = "";
  for (const s of sentences) {
    if ((out + s).length > CONTENT_LAB_HOOK_MAX_CHARS) break;
    out += s;
  }
  return (out || text.slice(0, CONTENT_LAB_HOOK_MAX_CHARS)).trim();
}

export function parseYoutubeUrl(url: string): { videoId: string; isShortsUrl: boolean } | null {
  if (!/^(https?:\/\/)?([\w-]+\.)?(youtube\.com|youtu\.be)\//i.test(url.trim())) return null;
  const withScheme = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const videoId = parseYoutubeVideoId(withScheme);
  return videoId ? { videoId, isShortsUrl: /\/shorts\//i.test(withScheme) } : null;
}

/** Video details + transcript (hook / zones / CTA) + comments (rewatch moments) + the creator's baseline. */
export async function youtubeBreakdown(
  videoId: string,
  isShortsUrl: boolean,
  country: string,
): Promise<CONTENT_LAB_BREAKDOWN_RESPONSE> {
  const details = await fetchYoutubeVideoDetails({ videoId, country });
  if (!details.channelId) throw withStatusCode(CONTENT_LAB_ERROR_MESSAGES.NOT_FOUND, 404);

  const [transcript, comments, channel] = await Promise.all([
    transcriptIntelligenceService({ videoId, language: "en", country, title: details.title ?? undefined }).catch(() => null),
    commentsIntelligenceService({ videoId, sort: "top", limit: CONTENT_LAB_BREAKDOWN_COMMENTS.scan, country, includeComments: true }).catch(() => null),
    fetchYoutubeChannelUploads(details.channelId, isShortsUrl ? ["shorts"] : tabsFor([details.lengthSeconds]), country).catch(() => null),
  ]);

  const uploads = channel ?? { videos: [], shorts: [] };
  const format = youtubeFormat(videoId, details.lengthSeconds, uploads, isShortsUrl);
  const post = buildContentLabPost(
    {
      platform: "youtube",
      nativeId: videoId,
      format,
      url: format === "short" ? shortsUrl(videoId) : YOUTUBE_VIDEO_URL(videoId),
      title: details.title ?? "",
      thumbnailUrl: largestThumbnail(details.thumbnail),
      publishedAt: details.publishedAt,
      views: details.viewCount,
      likes: details.likeCount,
      comments: details.commentCount,
      durationSeconds: details.lengthSeconds,
      creator: channel?.creator ?? {
        ...creatorFromChannel(details.channelId, null),
        name: details.channel,
        followers: details.channelSubscribers,
      },
    },
    channel?.baselines ?? { long: null, short: null, photo: null },
  );

  const intel = transcript?.intelligence;
  const intro = transcript?.zones.find((z) => z.zone === "intro");
  const firstCta = intel?.ctas[0];
  const cta = firstCta
    ? {
        text: firstCta.snippet,
        atPercent: intel.totalDurationSeconds > 0
          ? Math.round((firstCta.timestampSeconds / intel.totalDurationSeconds) * 100)
          : null,
      }
    : null;
  const structure: CONTENT_LAB_SEGMENT[] = (transcript?.zones ?? [])
    .filter((z) => z.wordCount > 0)
    .map((z) => ({ label: ZONE_LABELS[z.zone] ?? z.zone, startSeconds: Math.round(z.startSeconds), endSeconds: Math.round(z.endSeconds) }));
  const fullText = transcript ? transcript.zones.map((z) => z.text).filter(Boolean).join(" ") : null;

  const clusters = [...(comments?.intelligence.timestampClusters ?? [])].sort((a, b) => b.mentionCount - a.mentionCount);
  const topComments = (comments?.comments ?? [])
    .filter((c) => c.replyLevel === 0 && c.text.trim())
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
    .slice(0, CONTENT_LAB_BREAKDOWN_COMMENTS.top)
    .map((c) => c.text.trim());

  return {
    post,
    hook: {
      text: intro ? hookText(intro.text) : null,
      type: intel?.hookType ?? null,
      seconds: intel ? Math.round(intel.introLengthSeconds ?? intro?.endSeconds ?? 0) || null : null,
    },
    structure,
    cta,
    audience: { rewatchedSeconds: clusters.map((c) => c.timestampSeconds), topComments },
    text: fullText || null,
    whyItWorked: computeWhyItWorked({ ...post, hookType: intel?.hookType ?? null, cta, slideCount: 0 }),
  };
}
