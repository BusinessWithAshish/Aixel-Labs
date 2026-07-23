import { fetchGsearch } from "../../../gsearch";
import { fetchFromEntities } from "../../client";
import { IG_HEADERS, INSTAGRAM_BASE_URL } from "../../constants";
import {
  closeUrlFetchSession,
  createUrlFetchSession,
} from "../../../../utils/node-tls-client-session-handler";
import {
  IG_ADVANCED_SEARCH_ERROR_MESSAGES,
  IG_ADVANCED_SEARCH_LIMITS,
  IG_CONTENT_KIND,
  type IgContentKind,
} from "./constants";
import {
  buildContentGsearchQuery,
  classifyInstagramContentUrl,
} from "./compute/classify-url";
import {
  contentPageUrl,
  resolveOwnerFromContentHtml,
} from "./compute/resolve-owner";
import type {
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
 * Niche/query → GSearch Instagram posts/reels → resolve owners → optional profile enrich.
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
  const contents: IG_ADVANCED_CONTENT_HIT[] = [];
  const handleSet = new Set<string>();

  const session = await createUrlFetchSession({
    headers: { ...IG_HEADERS, referer: INSTAGRAM_BASE_URL },
  });

  try {
    for (const c of toResolve) {
      let username = c.usernameFromPath;
      let likeCount: number | null = null;
      let commentCount: number | null = null;
      let titleSnippet: string | null = null;
      let resolveMethod: string | null = username
        ? "gsearch-url-path"
        : null;

      if (!username && c.shortcode) {
        const pageUrl = contentPageUrl(
          c.kind as "post" | "reel",
          c.shortcode,
        );
        try {
          const res = await session.get(pageUrl, { followRedirects: true });
          const html = await res.text();
          if (res.status < 400) {
            const owner = resolveOwnerFromContentHtml(html);
            username = owner.username;
            likeCount = owner.likeCount;
            commentCount = owner.commentCount;
            titleSnippet = owner.titleSnippet;
            resolveMethod = owner.method;
          }
        } catch {
          /* skip resolve failure */
        }
      }

      if (username) handleSet.add(username.toLowerCase());

      contents.push({
        kind: c.kind,
        url: c.url,
        shortcode: c.shortcode,
        username,
        likeCount,
        commentCount,
        titleSnippet,
        resolveMethod,
      });
    }
  } finally {
    await closeUrlFetchSession(session);
  }

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
