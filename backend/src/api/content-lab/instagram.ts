import { withStatusCode } from "../../config";
import { fetchInstagramAdvancedPosts } from "../instagram/advanced/client";
import { mapFeedItem } from "../instagram/advanced/compute";
import { IG_MEDIA_TYPE, IG_POST_EMBED_URL } from "../instagram/advanced/constants";
import { fetchInstagramAdvancedSearch } from "../instagram/advanced/search/client";
import { mediaIdFromShortcode } from "../instagram/advanced/search/compute/classify-url";
import { IG_CONTENT_KIND } from "../instagram/advanced/search/constants";
import type { IG_ADVANCED_POST } from "../instagram/advanced/types";
import { fetchFromEntities } from "../instagram/client";
import { extractUsername } from "../instagram/compute/username";
import { IG_GRAPHQL_CONCURRENCY, INSTAGRAM_BASE_URL } from "../instagram/constants";
import { fetchLoggedOutMedia, readEmbedNumber } from "../instagram/graphql";
import type { INSTAGRAM_RESPONSE } from "../instagram/types";
import { classifyHook } from "../youtube/intelligence/transcript/compute/hook";
import { runWithConcurrency } from "../youtube/concurrency";
import { baselineByFamily, captionCta, computeWhyItWorked, firstLine } from "./compute";
import {
  CONTENT_LAB_CONCURRENCY,
  CONTENT_LAB_ERROR_MESSAGES,
  CONTENT_LAB_INSTAGRAM_BUDGET_MS,
  CONTENT_LAB_INSTAGRAM_PAGE_SIZE,
  CONTENT_LAB_INSTAGRAM_SEARCH_RESOLVE,
  CONTENT_LAB_LIMITS,
} from "./constants";
import {
  beforeDeadline,
  buildContentLabPost,
  errorMessage,
  interleaveBy,
  sortNewestFirst,
  type ContentLabBaselines,
} from "./helpers";
import type {
  CONTENT_LAB_BREAKDOWN_RESPONSE,
  CONTENT_LAB_CREATOR,
  CONTENT_LAB_CREATOR_RESPONSE,
  CONTENT_LAB_POST,
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

/** GSearch /p/ + /reel/ → distinct owners (capped) → each owner's grid → multiple per hit. */
export async function exploreInstagram(query: string, country: string): Promise<CONTENT_LAB_POST[]> {
  const search = await fetchInstagramAdvancedSearch({
    query,
    kinds: [IG_CONTENT_KIND.POST, IG_CONTENT_KIND.REEL],
    pages: 1,
    maxResolve: CONTENT_LAB_INSTAGRAM_SEARCH_RESOLVE,
    enrichProfiles: false,
    country,
  });
  // Posts and reels alternate so the creator cap takes owners of both.
  const hits = interleaveBy(
    search.contents.filter(
      (c): c is typeof c & { username: string; shortcode: string } => Boolean(c.username && c.shortcode),
    ),
    (c) => c.kind,
  );
  const owners = [...new Set(hits.map((h) => h.username.toLowerCase()))].slice(0, CONTENT_LAB_LIMITS.maxCreatorsPerPlatform);

  const creatorsDeadline = Date.now() + CONTENT_LAB_INSTAGRAM_BUDGET_MS.creators;
  const creators = await runWithConcurrency(owners, CONTENT_LAB_CONCURRENCY.instagramCreators, (owner) =>
    beforeDeadline(fetchInstagramCreatorPosts(owner, country), creatorsDeadline).catch((err) => {
      console.warn("[content-lab] Instagram owner failed:", owner, errorMessage(err));
      return null;
    }),
  );
  const byOwner = new Map(owners.map((o, i) => [o, creators[i]]));
  const kept = hits.filter((h) => byOwner.get(h.username.toLowerCase()));
  if (owners.length > 0 && kept.length === 0) throw new Error("Instagram creators could not be loaded in time");

  const hitsDeadline = Date.now() + CONTENT_LAB_INSTAGRAM_BUDGET_MS.hits;
  const posts = await runWithConcurrency(kept, IG_GRAPHQL_CONCURRENCY, async (hit) => {
    const creator = byOwner.get(hit.username.toLowerCase())!;
    // Hits are often older than the creator's latest grid page; those need their own lookup.
    const post =
      creator.posts.find((p) => p.shortcode === hit.shortcode) ??
      (await beforeDeadline(fetchInstagramPost(hit.shortcode), hitsDeadline));
    return post ? toContentLabPost(post, creator.creator, creator.baselines) : null;
  });
  return posts.filter((p): p is CONTENT_LAB_POST => p !== null);
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
