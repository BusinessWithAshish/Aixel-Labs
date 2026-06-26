import type {
  INSTAGRAM_REQUEST,
  INSTAGRAM_RESPONSE,
  InstagramUser,
} from "./types";
import { IG_HEADERS, INSTAGRAM_BASE_URL } from "./constants";
import { fetchUrls } from "../../utils/node-tls-client-session-handler";
import {
  GSEARCH_RESPONSE,
  fetchGSearch,
  GOOGLE_SEARCH_QUERY_LIMITS,
  DEFAULT_GSEARCH_MAX_PAGES,
} from "../../utils/browser-worker";

export const generateAdvanceQuery = (
  keywords: string[] | undefined,
  separator: string = " OR ",
) => {
  if (!keywords || keywords.length === 0) {
    return "";
  }
  return `(${keywords.map((keyword) => `${keyword}`).join(separator)})`;
};

export const generateExcludeKeywords = (
  keywords: string[] | undefined,
  separator: string = " -",
) => {
  if (!keywords || keywords.length === 0) {
    return "";
  }
  return `-${keywords.map((keyword) => `${keyword}`).join(separator)}`;
};

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Builds an Instagram Google search query respecting limits (1800 chars, 30 words).
 * Priority: website > keywords > hashtags > excludeKeywords > excludeHashtags > state > cities.
 * When core parts exceed the limit, lower-priority items are omitted. Cities are added whole.
 * Uses maxKeywords, maxHashtags, etc. from request (or INSTAGRAM_QUERY_LIMITS) to cap arrays.
 */
export const generateInstagramSearchQuery = (request: INSTAGRAM_REQUEST) => {
  const website = `site:${INSTAGRAM_BASE_URL}`;
  let finalQuery = "";

  const query = request.query ?? "";

  const keywords = generateAdvanceQuery(request.keywords);
  const hashtags = generateAdvanceQuery(request.hashtags);
  const excludeKeywords = generateExcludeKeywords(request.excludeKeywords);
  const excludeHashtags = generateExcludeKeywords(request.excludeHashtags);

  finalQuery = `${website} ${query} ${keywords} ${hashtags} ${excludeKeywords} ${excludeHashtags}`;

  return {
    searchQuery: finalQuery.trim(),
    words: countWords(finalQuery),
    chars: finalQuery.length,
  };
};

/** First path segment must not be a site section (profile URLs use @handle as first segment). */
const RESERVED_IG_FIRST_SEGMENT = new Set([
  "explore",
  "accounts",
  "p",
  "reel",
  "reels",
  "stories",
  "tv",
  "direct",
]);

function isInstagramHost(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().endsWith("instagram.com");
  } catch {
    return false;
  }
}

/** URL-shaped input: absolute URL or hostname path containing `instagram.com`. */
function looksLikeUrl(input: string): boolean {
  return (
    input.startsWith("http://") ||
    input.startsWith("https://") ||
    input.includes("instagram.com")
  );
}

/**
 * Single extractor for Instagram handles used with `web_profile_info`:
 * - URL-like input: must be `*.instagram.com` with profile-style path
 *   (`/${username}`, `/${username}/…`); rejects `/p/`, `/reel/`, `/explore/`, etc.
 * - Plain input: treated as a bare handle (leading `@` stripped).
 */
export function extractUsername(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (looksLikeUrl(trimmed)) {
    try {
      const url = new URL(
        trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
      );
      if (!isInstagramHost(url.href)) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      const candidate = parts[0];
      if (
        !candidate ||
        RESERVED_IG_FIRST_SEGMENT.has(candidate.toLowerCase())
      ) {
        return null;
      }
      return candidate;
    } catch {
      return null;
    }
  }

  return trimmed.replace(/^@/, "") || null;
}

function uniqueUsernames(entities: (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of entities) {
    if (raw === null) continue;
    const u = extractUsername(raw);
    if (!u) continue;
    const k = u.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(u);
  }
  return out;
}

function mapToResponse(
  user: InstagramUser["data"]["user"],
): INSTAGRAM_RESPONSE {
  const bioEntities = user.biography_with_entities?.entities ?? [];

  const bioHashtags = bioEntities
    .filter((e) => e.hashtag?.name)
    .map((e) => e.hashtag.name);

  const bioMentions = bioEntities
    .filter((e) => e.user?.username)
    .map((e) => e.user.username);

  const websites = (user.bio_links ?? []).map((l) => l.url).filter(Boolean);

  return {
    id: user.id ?? null,
    fullName: user.full_name ?? null,
    username: user.username ?? null,
    instagramUrl: user.username
      ? `https://www.instagram.com/${user.username}/`
      : null,
    websites: websites.length > 0 ? websites : null,
    bio: user.biography ?? null,
    bioHashtags: bioHashtags.length > 0 ? bioHashtags : null,
    bioMentions: bioMentions.length > 0 ? bioMentions : null,
    followers: user.edge_followed_by?.count ?? null,
    following: user.edge_follow?.count ?? null,
    posts: user.edge_owner_to_timeline_media?.count ?? null,
    profilePicture: user.profile_pic_url ?? null,
    profilePictureHd: user.profile_pic_url_hd ?? null,
    isVerified: user.is_verified ?? null,
    isBusiness: user.is_business_account ?? null,
    isProfessional: user.is_professional_account ?? null,
    isPrivate: user.is_private ?? null,
    isJoinedRecently: user.if_joined_recently ?? null,
    businessEmail: user.business_email ?? null,
    businessPhoneNumber: user.business_phone_number ?? null,
    businessCategoryName: user.business_category_name ?? null,
    overallCategoryName: user.overall_category_name ?? null,
    businessAddressJson: user.business_address_json ?? null,
  };
}

export const hasEntities = (entities: string[] | undefined) =>
  Array.isArray(entities) && entities.length > 0;
export const hasQuery = (q: string | undefined) =>
  typeof q === "string" && q.trim().length > 0;

export function instagramWebProfileInfoUrl(username: string): string {
  return `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
}

function mapInstagramWebProfileBody(text: string): INSTAGRAM_RESPONSE {
  const json = JSON.parse(text) as InstagramUser;
  const user = json?.data?.user;
  if (!user) throw new Error("Instagram profile response missing user");
  return mapToResponse(user);
}

export async function fetchFromEntities(
  entities: string[] | (string | null)[],
): Promise<INSTAGRAM_RESPONSE[]> {
  if (!Array.isArray(entities)) {
    throw new Error("Entities must be an array of strings.");
  }

  const usernames = uniqueUsernames(entities);
  const urls = usernames.map(instagramWebProfileInfoUrl);

  if (urls.length === 0) {
    return [];
  }

  // Flat targets → one TLS session + fresh Evomi sticky proxy per profile URL.
  return fetchUrls<INSTAGRAM_RESPONSE>({
    targets: urls,
    headers: IG_HEADERS,
    mapper: (text) => mapInstagramWebProfileBody(text),
  });
}

export async function fetchFromQuery(
  data: INSTAGRAM_REQUEST,
): Promise<INSTAGRAM_RESPONSE[]> {
  const { country, city } = data;

  if (!country && !city) {
    throw new Error("Country and city are required to fetch search results");
  }

  const { searchQuery, words, chars } = generateInstagramSearchQuery(data);

  if (
    chars > GOOGLE_SEARCH_QUERY_LIMITS.maxQueryChars ||
    words > GOOGLE_SEARCH_QUERY_LIMITS.maxQueryWords
  ) {
    throw new Error(
      `Query is too long. Try adjusting the keywors, hashtags, excludeKeywords, excludeHashtags, country, state, cities, or query.`,
    );
  }

  const searchResultsData: GSEARCH_RESPONSE[] = await fetchGSearch({
    searchQuery: searchQuery,
    pages: DEFAULT_GSEARCH_MAX_PAGES,
    country: country!,
    city: city!,
  });

  if (!searchResultsData.length) {
    throw new Error("Failed to fetch instagram search results from GSearch.");
  }

  // SERP URLs like /handle/reel/… or /handle/tagged/… still yield the profile handle
  // from the first path segment via `extractUsername` (same path as fetchFromEntities).
  const entities = uniqueUsernames(
    searchResultsData.map((row) => row.url ?? null),
  );

  console.log(
    `[instagram] SERP rows=${searchResultsData.length} → unique profile handles=${entities.length}`,
  );

  return await fetchFromEntities(entities);
}
