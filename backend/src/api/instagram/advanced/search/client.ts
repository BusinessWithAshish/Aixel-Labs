import { fetchGsearch } from "../../../gsearch";
import { runWithConcurrency } from "../../../youtube/concurrency";
import {
  closeUrlFetchSession,
  createUrlFetchSession,
} from "../../../../utils/node-tls-client-session-handler";
import { fetchFromEntities } from "../../client";
import {
  IG_GRAPHQL_CONCURRENCY,
  IG_GRAPHQL_HEADERS,
  INSTAGRAM_BASE_URL,
} from "../../constants";
import { fetchLoggedOutMedia } from "../../graphql";
import {
  IG_ADVANCED_SEARCH_ERROR_MESSAGES,
  IG_ADVANCED_SEARCH_LIMITS,
  IG_CONTENT_KIND,
  IG_TAGS_SEARCH_PATH,
  type IgContentKind,
} from "./constants";
import {
  buildContentGsearchQuery,
  classifyInstagramContentUrl,
  mediaIdFromShortcode,
} from "./compute/classify-url";
import type {
  IG_HASHTAG,
  IG_ADVANCED_CONTENT_HIT,
  IG_ADVANCED_SEARCH_REQUEST,
  IG_ADVANCED_SEARCH_RESPONSE,
} from "./types";

function normalizeKinds(
  kinds: IgContentKind[] | undefined,
): Array<typeof IG_CONTENT_KIND.POST | typeof IG_CONTENT_KIND.REEL> {
  const raw =
    kinds?.length
      ? kinds
      : [...IG_ADVANCED_SEARCH_LIMITS.defaultKinds];
  return raw.filter(
    (k): k is typeof IG_CONTENT_KIND.POST | typeof IG_CONTENT_KIND.REEL =>
      k === IG_CONTENT_KIND.POST || k === IG_CONTENT_KIND.REEL,
  );
}

/**
 * Niche/query → GSearch Instagram posts/reels → resolve owners (logged-out post
 * query) → optional profile enrich.
 */
export async function fetchInstagramAdvancedSearch(
  input: IG_ADVANCED_SEARCH_REQUEST,
): Promise<IG_ADVANCED_SEARCH_RESPONSE> {
  const query = input.query.trim();
  const kinds = normalizeKinds(input.kinds as IgContentKind[] | undefined);
  const pages = input.pages ?? IG_ADVANCED_SEARCH_LIMITS.defaultPages;
  const maxResolve = input.maxResolve ?? IG_ADVANCED_SEARCH_LIMITS.maxResolve;
  const enrichProfiles = input.enrichProfiles ?? true;
  const country = input.country ?? "IN";

  let gsearchRows = 0;
  const classified: ReturnType<typeof classifyInstagramContentUrl>[] = [];
  const seenCodes = new Set<string>();

  for (const kind of kinds) {
    const searchQuery = buildContentGsearchQuery(query, kind);
    const { results } = await fetchGsearch({
      searchQuery,
      pages,
      country,
    });
    gsearchRows += results.length;
    for (const row of results) {
      if (!row.url) continue;
      const c = classifyInstagramContentUrl(row.url);
      if (c.kind !== IG_CONTENT_KIND.POST && c.kind !== IG_CONTENT_KIND.REEL) {
        continue;
      }
      const key = c.shortcode ?? c.url;
      if (seenCodes.has(key)) continue;
      seenCodes.add(key);
      classified.push(c);
    }
  }

  if (classified.length === 0) {
    throw new Error(IG_ADVANCED_SEARCH_ERROR_MESSAGES.GSEARCH_EMPTY);
  }

  const toResolve = classified.slice(0, maxResolve);

  // Owner + counts come from the logged-out post query, direct from the VPS.
  // `titleSnippet` keeps the `og:title` shape the post page used to give.
  const contents: IG_ADVANCED_CONTENT_HIT[] = await runWithConcurrency(
    toResolve,
    IG_GRAPHQL_CONCURRENCY,
    async (c) => {
      const hit: IG_ADVANCED_CONTENT_HIT = {
        kind: c.kind,
        url: c.url,
        shortcode: c.shortcode,
        username: c.usernameFromPath,
        likeCount: null,
        commentCount: null,
        titleSnippet: null,
        resolveMethod: c.usernameFromPath ? "gsearch-url-path" : null,
      };
      const mediaId = c.shortcode ? mediaIdFromShortcode(c.shortcode) : null;
      if (hit.username || !mediaId) return hit;

      const media = await fetchLoggedOutMedia(mediaId).catch(() => null);
      if (!media?.user?.username) return hit;
      const owner = media.user.full_name || media.user.username;
      const caption = media.caption?.text?.trim();
      return {
        ...hit,
        username: media.user.username,
        likeCount: media.like_count ?? null,
        commentCount: media.comment_count ?? null,
        titleSnippet: caption
          ? `${owner} on Instagram: "${caption}`.slice(0, 180)
          : `${owner} on Instagram`,
        resolveMethod: "graphql",
      };
    },
  );
  const handleSet = new Set(
    contents.flatMap((c) => (c.username ? [c.username.toLowerCase()] : [])),
  );

  const usernames = [...handleSet];
  let leads: IG_ADVANCED_SEARCH_RESPONSE["leads"] = [];
  if (enrichProfiles && usernames.length > 0) {
    leads = await fetchFromEntities(usernames, country);
  }

  return {
    query,
    kinds,
    contents,
    usernames,
    leads,
    meta: {
      gsearchRows,
      resolved: contents.filter((c) => c.username).length,
      uniqueHandles: usernames.length,
    },
  };
}

type IgTagSearchResponse = {
  results?: Array<{ name?: string; media_count?: number }>;
};

/**
 * Hashtags matching a phrase, biggest first, from `GET /api/v1/tags/search/`
 * — the one Instagram search endpoint that still answers a guest (direct,
 * ~1 s, checked 2026-10-28; user search and hashtag pages redirect to login).
 * Names and post counts only; never throws (empty on any failure).
 */
export async function searchInstagramHashtags(
  query: string,
): Promise<IG_HASHTAG[]> {
  const session = await createUrlFetchSession({ useProxy: false });
  try {
    const url = `${INSTAGRAM_BASE_URL}${IG_TAGS_SEARCH_PATH}?q=${encodeURIComponent(query.trim())}`;
    const res = await session.get(url, { headers: IG_GRAPHQL_HEADERS });
    if (!res.ok) return [];
    const body = JSON.parse(await res.text()) as IgTagSearchResponse;
    return (body.results ?? [])
      .flatMap((r) => (r.name ? [{ name: r.name, mediaCount: r.media_count ?? null }] : []))
      .sort((a, b) => (b.mediaCount ?? 0) - (a.mediaCount ?? 0));
  } catch {
    return [];
  } finally {
    await closeUrlFetchSession(session);
  }
}
