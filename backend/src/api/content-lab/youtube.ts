import { withStatusCode } from "../../config";
import { YT_CHANNEL_CONTENT_TYPE } from "../youtube/channel/constants";
import { fetchYoutubeChannel } from "../youtube/channel/helpers";
import type {
  YOUTUBE_CHANNEL_INFO,
  YOUTUBE_CHANNEL_SHORT_ITEM,
  YOUTUBE_CHANNEL_VIDEO_ITEM,
} from "../youtube/channel/types";
import { commentsIntelligenceService } from "../youtube/intelligence/comments/service";
import { transcriptIntelligenceService } from "../youtube/intelligence/transcript/service";
import { runWithConcurrency } from "../youtube/concurrency";
import { YOUTUBE_BASE_URL, YOUTUBE_VIDEO_URL, YT_SEARCH_FILTER } from "../youtube/constants";
import { resolveYoutubeHandleToChannelId } from "../youtube/handle/helpers";
import { parseYoutubeVideoId } from "../youtube/helpers";
import { isSearchVideoItem } from "../youtube/intelligence/type-guards";
import { fetchYoutubeSearch } from "../youtube/search/helpers";
import type { YOUTUBE_SEARCH_VIDEO_ITEM } from "../youtube/search/types";
import { fetchVideoWatchMetaByVideoIds } from "../youtube/video-meta";
import { fetchYoutubeVideoDetails } from "../youtube/video/helpers";
import type { YT_THUMBNAIL } from "../youtube/types";
import {
  baselineByFamily,
  computeWhyItWorked,
  relativeTimeToIso,
} from "./compute";
import {
  CONTENT_LAB_BREAKDOWN_COMMENTS,
  CONTENT_LAB_CONCURRENCY,
  CONTENT_LAB_ERROR_MESSAGES,
  CONTENT_LAB_HOOK_MAX_CHARS,
  CONTENT_LAB_LIMITS,
  CONTENT_LAB_YOUTUBE_SEARCH_RESULTS,
  CONTENT_LAB_YOUTUBE_SHORT_MAX_SECONDS,
} from "./constants";
import { buildContentLabPost, sortNewestFirst, type ContentLabBaselines } from "./helpers";
import type {
  CONTENT_LAB_BREAKDOWN_RESPONSE,
  CONTENT_LAB_CREATOR,
  CONTENT_LAB_CREATOR_RESPONSE,
  CONTENT_LAB_POST,
  CONTENT_LAB_SEGMENT,
} from "./types";

type YoutubeTab = "videos" | "shorts";

type YoutubeChannelUploads = {
  creator: CONTENT_LAB_CREATOR;
  videos: YOUTUBE_CHANNEL_VIDEO_ITEM[];
  shorts: YOUTUBE_CHANNEL_SHORT_ITEM[];
  baselines: ContentLabBaselines;
};

const shortsUrl = (id: string) => `${YOUTUBE_BASE_URL}/shorts/${id}`;
const largestThumbnail = (list: YT_THUMBNAIL[] | null | undefined) => list?.at(-1)?.url ?? null;

function creatorFromChannel(channelId: string, info: YOUTUBE_CHANNEL_INFO | null): CONTENT_LAB_CREATOR {
  const handle = info?.handle ? `@${info.handle.replace(/^@/, "")}` : null;
  return {
    platform: "youtube",
    id: channelId,
    handle,
    name: info?.title ?? null,
    url: info?.handleUrl ?? info?.channelUrl ?? `${YOUTUBE_BASE_URL}/channel/${channelId}`,
    followers: info?.subscribers ?? null,
  };
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
  const fetchTab = (tab: YoutubeTab) =>
    fetchYoutubeChannel({
      channelId,
      contentType: tab === "shorts" ? YT_CHANNEL_CONTENT_TYPE.SHORTS : YT_CHANNEL_CONTENT_TYPE.VIDEOS,
      limit: CONTENT_LAB_LIMITS.baselineUploads,
      country,
    });
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

/** Search → distinct channels (capped) → each channel's recent uploads → multiple per hit. */
export async function exploreYoutube(query: string, country: string): Promise<CONTENT_LAB_POST[]> {
  const search = await fetchYoutubeSearch({
    query,
    filter: YT_SEARCH_FILTER.VIDEO,
    limit: CONTENT_LAB_YOUTUBE_SEARCH_RESULTS,
    country,
  });
  const hits = search.items.filter(
    (item): item is YOUTUBE_SEARCH_VIDEO_ITEM & { videoId: string; channelId: string } =>
      isSearchVideoItem(item) && Boolean(item.videoId && item.channelId),
  );
  const channelIds = [...new Set(hits.map((h) => h.channelId))].slice(0, CONTENT_LAB_LIMITS.maxCreatorsPerPlatform);
  const kept = hits.filter((h) => channelIds.includes(h.channelId));

  const [meta, uploads] = await Promise.all([
    fetchVideoWatchMetaByVideoIds(kept.map((h) => h.videoId), { country }),
    runWithConcurrency(channelIds, CONTENT_LAB_CONCURRENCY.youtubeCreators, (channelId) =>
      fetchYoutubeChannelUploads(
        channelId,
        tabsFor(kept.filter((h) => h.channelId === channelId).map((h) => h.duration)),
        country,
      ).catch((err) => {
        console.warn("[content-lab] YouTube channel failed:", channelId, err instanceof Error ? err.message : err);
        return null;
      }),
    ),
  ]);
  const uploadsByChannel = new Map(channelIds.map((id, i) => [id, uploads[i]]));

  return kept.flatMap((hit) => {
    const channel = uploadsByChannel.get(hit.channelId);
    if (!channel) return [];
    const watch = meta.get(hit.videoId);
    const durationSeconds = watch?.lengthSeconds ?? hit.duration;
    const format = youtubeFormat(hit.videoId, durationSeconds, channel);
    return [
      buildContentLabPost(
        {
          platform: "youtube",
          nativeId: hit.videoId,
          format,
          url: format === "short" ? shortsUrl(hit.videoId) : YOUTUBE_VIDEO_URL(hit.videoId),
          title: hit.title ?? "",
          thumbnailUrl: largestThumbnail(hit.thumbnails),
          publishedAt: watch?.publishedAt ?? relativeTimeToIso(hit.publishedTimeText),
          views: hit.viewCount,
          likes: watch?.likeCount ?? null,
          comments: watch?.commentCount ?? null,
          durationSeconds,
          creator: { ...channel.creator, followers: channel.creator.followers ?? watch?.channelSubscribers ?? null },
        },
        channel.baselines,
      ),
    ];
  });
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
