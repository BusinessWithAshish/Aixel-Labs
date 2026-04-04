import type {
  INSTAGRAM_REQUEST,
  INSTAGRAM_RESPONSE,
  InstagramUser,
} from "./types";
import crypto from "crypto";
import { INSTAGRAM_BASE_URL } from "./constants";
import { Impit } from "impit";
import {
  IG_HEADERS,
  REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
  RETRY_BASE_DELAY_MS,
} from "./constants";
import { PROXY_CONFIG } from "../../utils/constants";
import { GSEARCH_RESPONSE } from "../gsearch/types";
import { fetchGSearch } from "../gsearch/helpers";
import { GOOGLE_SEARCH_QUERY_LIMITS } from "../gsearch/constants";
import { DEFAULT_GSEARCH_MAX_PAGES } from "../gsearch/constants";

const IMPIT_CONCURRENCY = Math.max(
  1,
  Math.min(32, Number(process.env.INSTAGRAM_IMPIT_CONCURRENCY) || 2),
);
const IMPIT_CHUNK_GAP_MS = Math.max(
  0,
  Number(process.env.INSTAGRAM_IMPIT_CHUNK_GAP_MS) || 400,
);

function newStickySessionId(): string {
  return (
    (crypto as { randomUUID?: () => string }).randomUUID?.() ??
    crypto.randomBytes(16).toString("hex")
  );
}

/** `{password}_session-{id}` via `URL` userinfo */
function evomiProxyUrl(sessionId: string): string | undefined {
  const { PROTOCOL, HOSTNAME, PORT, USERNAME, PASSWORD } = PROXY_CONFIG;
  if (!USERNAME || !PASSWORD || !HOSTNAME || !PORT) return undefined;
  const sep = "_";
  const sid = sessionId.trim() || newStickySessionId();
  const pwd = `${PASSWORD}${sep}session-${sid}`;
  const u = new URL(`${PROTOCOL}://${HOSTNAME}:${String(PORT)}`);
  u.username = USERNAME;
  u.password = pwd;
  return u.href.replace(/\/$/, "");
}

function createInstagramImpit(sessionId: string): Impit {
  const proxyUrl = evomiProxyUrl(sessionId);
  return new Impit({
    browser: "chrome",
    ignoreTlsErrors: true,
    timeout: REQUEST_TIMEOUT_MS,
    ...(proxyUrl ? { proxyUrl } : {}),
  });
}

type ProfileFetchOpts = { client?: Impit };

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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Request timed out after ${ms}ms (${label})`)),
        ms,
      ),
    ),
  ]);
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

export async function fetchInstagramProfile(
  username: string,
  opts: ProfileFetchOpts = {},
): Promise<INSTAGRAM_RESPONSE | null> {
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;

  let lastError: Error | null = null;
  const client = opts.client ?? createInstagramImpit(newStickySessionId());

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await withTimeout(
        client.fetch(url, { headers: IG_HEADERS }),
        REQUEST_TIMEOUT_MS,
        username,
      );

      // Not found / banned / deactivated → skip silently
      if (response.status === 404) return null;

      // Rate-limited or transient server error → retry with backoff
      if (response.status === 429 || response.status >= 500) {
        const retryAfterHeader = response.headers.get?.("retry-after");
        const backoff = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1_000
          : RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 500;

        lastError = new Error(`HTTP ${response.status} on attempt ${attempt}`);

        if (attempt < MAX_RETRIES) {
          await sleep(backoff);
          continue;
        }

        // Retries exhausted on transient error → skip
        return null;
      }

      // Hard auth failure (app-id stale) → throw so the handler can surface it
      if (response.status === 401 || response.status === 403) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Instagram auth failure (${response.status}) — x-ig-app-id may be stale. Body: ${body.slice(0, 200)}`,
        );
      }

      // Any other unexpected non-OK status → skip
      if (!response.ok) return null;

      // Parse response
      let json: InstagramUser;
      try {
        json = await response.json();
      } catch {
        // Encoding / decompression mismatch → retry
        lastError = new Error(`JSON parse failed for @${username}`);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        return null;
      }

      const user = json?.data?.user;

      // null user = private / deactivated / banned → skip
      if (!user) return null;

      return mapToResponse(user);
    } catch (err) {
      const error = err as Error;

      // Hard auth failure — bubble up immediately, stop all retries
      if (error.message.includes("auth failure")) throw error;

      lastError = error;

      if (attempt < MAX_RETRIES) {
        const base =
          RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 500;
        const tunnel =
          /TunnelUnsuccessful|Failed to connect to the server/i.test(
            error.message,
          );
        await sleep(tunnel ? base * 3 + 1_500 + Math.random() * 1_000 : base);
      }
    }
  }

  console.error(
    `[instagram] Giving up on @${username} after ${MAX_RETRIES} attempts: ${lastError?.message}`,
  );
  return null;
}

export async function fetchFromEntities(
  entities: string[] | (string | null)[],
): Promise<INSTAGRAM_RESPONSE[]> {
  if (!Array.isArray(entities)) {
    throw new Error("Entities must be an array of strings.");
  }

  const usernames = uniqueUsernames(entities);
  const impit = createInstagramImpit(newStickySessionId());
  const settled: PromiseSettledResult<INSTAGRAM_RESPONSE | null>[] = [];

  for (let i = 0; i < usernames.length; i += IMPIT_CONCURRENCY) {
    const chunk = usernames.slice(i, i + IMPIT_CONCURRENCY);
    settled.push(
      ...(await Promise.allSettled(
        chunk.map((u) => fetchInstagramProfile(u, { client: impit })),
      )),
    );
    if (i + IMPIT_CONCURRENCY < usernames.length && IMPIT_CHUNK_GAP_MS > 0) {
      await sleep(IMPIT_CHUNK_GAP_MS);
    }
  }

  return settled
    .filter(
      (r): r is PromiseFulfilledResult<INSTAGRAM_RESPONSE> =>
        r.status === "fulfilled" && r.value !== null,
    )
    .map((r) => r.value);
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

  // CALL THE GSEARCH ENDPOINT
  const searchResulstsData: GSEARCH_RESPONSE[] = await fetchGSearch({
    searchQuery: searchQuery,
    pages: DEFAULT_GSEARCH_MAX_PAGES,
    country: country!,
    city: city!,
  });

  if (!searchResulstsData.length) {
    throw new Error("Failed to fetch search results from GSearch.");
  }

  // SERP URLs like /handle/reel/… or /handle/tagged/… still yield the profile handle
  // from the first path segment via `extractUsername` (same path as fetchFromEntities).
  const entities = uniqueUsernames(
    searchResulstsData.map((row) => row.url ?? null),
  );

  console.log(
    `[instagram] SERP rows=${searchResulstsData.length} → unique profile handles=${entities.length}`,
  );

  return await fetchFromEntities(entities);
}
