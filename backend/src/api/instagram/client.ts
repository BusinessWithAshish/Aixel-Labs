import type { CountryCode } from "libphonenumber-js";

import { fetchGsearch } from "../gsearch";
import {
  GSEARCH_MAX_PAGES,
  GSEARCH_MAX_QUERY_CHARS,
  GSEARCH_PAGE_SIZE,
} from "../gsearch/constants";
import { runWithConcurrency } from "../youtube/concurrency";
import {
  IG_GRAPHQL_CONCURRENCY,
  IG_PROFILE_EMBED_URL,
  IG_PROFILE_PAGE_VARIABLES,
  INSTAGRAM_ERROR_MESSAGES,
  INSTAGRAM_QUERY_LIMITS,
  INSTAGRAM_REQUEST_RESULT_LIMIT_DEFAULT,
  INSTAGRAM_SUGGESTED_LIMIT_DEFAULT,
} from "./constants";
import {
  extractUsername,
  generateInstagramSearchQuery,
  instagramProfileUrl,
  mapXigUserToResponse,
  uniqueUsernames,
  type XigProfilePageUser,
  type XigUserByUsername,
} from "./compute";
import { igLoggedOutQuery, readEmbedNumber } from "./graphql";
import type {
  INSTAGRAM_REQUEST,
  INSTAGRAM_RESPONSE,
  INSTAGRAM_SUGGESTED_PROFILE,
  INSTAGRAM_SUGGESTED_REQUEST,
  INSTAGRAM_SUGGESTED_RESPONSE,
} from "./types";

function resolveLimit(limit: number | undefined): number {
  return limit ?? INSTAGRAM_REQUEST_RESULT_LIMIT_DEFAULT;
}

/** Total post count from the profile embed page — `null` for e.g. private accounts. */
function fetchPostsCount(username: string): Promise<number | null> {
  return readEmbedNumber(IG_PROFILE_EMBED_URL(username), "posts_count");
}

/**
 * The business half of a profile — `account_type`, `category`, the HD
 * picture — from the profile page query. Best-effort: on any failure the
 * profile still ships, with those fields null.
 */
async function fetchProfilePage(pk: string): Promise<XigProfilePageUser | null> {
  try {
    const data = await igLoggedOutQuery<{ user: XigProfilePageUser | null }>(
      "profilePage",
      { id: pk, ...IG_PROFILE_PAGE_VARIABLES },
    );
    return data?.user ?? null;
  } catch (err) {
    console.log(
      `[instagram] profile page ${pk} — ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * One profile: the logged-out profile query (by username, gives the pk), then
 * the profile page query (by pk) and the embed page's post count in parallel.
 * `null` when the account doesn't exist; throws when Instagram can't be
 * reached on any route.
 */
async function fetchOneProfile(
  username: string,
  countryCode: CountryCode,
): Promise<INSTAGRAM_RESPONSE | null> {
  const postsCount = fetchPostsCount(username);
  const data = await igLoggedOutQuery<{
    xig_user_by_username: XigUserByUsername | null;
  }>("profile", { username });
  const user = data?.xig_user_by_username;
  if (!user) return null;
  const [page, posts] = await Promise.all([
    fetchProfilePage(user.pk),
    postsCount,
  ]);
  return mapXigUserToResponse(user, countryCode, { page, posts });
}

export async function fetchFromEntities(
  entities: string[] | (string | null)[],
  country: string,
  limit: number = INSTAGRAM_REQUEST_RESULT_LIMIT_DEFAULT,
): Promise<INSTAGRAM_RESPONSE[]> {
  if (!Array.isArray(entities)) {
    throw new Error(INSTAGRAM_ERROR_MESSAGES.ENTITIES_NOT_ARRAY);
  }

  const usernames = uniqueUsernames(entities).slice(0, resolveLimit(limit));
  if (usernames.length === 0) {
    return [];
  }

  const countryCode = country as CountryCode;
  let lastErr: Error | null = null;

  // A missing handle is skipped; one that can't be reached is logged and
  // skipped too, unless every handle failed that way — then the caller gets
  // the error instead of an empty list that reads as "no such accounts".
  const settled = await runWithConcurrency(
    usernames,
    IG_GRAPHQL_CONCURRENCY,
    async (username) => {
      try {
        return await fetchOneProfile(username, countryCode);
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        console.log(`[instagram] @${username} — ${lastErr.message}`);
        return undefined;
      }
    },
  );
  const results = settled.filter((p): p is INSTAGRAM_RESPONSE => Boolean(p));

  console.log(
    `[instagram] entities: ${usernames.length} requested → ${results.length} resolved`,
  );
  if (lastErr && settled.every((p) => p === undefined)) throw lastErr;
  return results;
}

export async function fetchFromQuery(
  data: INSTAGRAM_REQUEST,
): Promise<INSTAGRAM_RESPONSE[]> {
  const { country, city, state } = data;
  const limit = resolveLimit(data.limit);

  const { searchQuery, words, chars } = generateInstagramSearchQuery(data);

  if (
    chars > GSEARCH_MAX_QUERY_CHARS ||
    words > INSTAGRAM_QUERY_LIMITS.maxQueryWords
  ) {
    throw new Error(INSTAGRAM_ERROR_MESSAGES.QUERY_TOO_LONG);
  }

  const countryCode = country as CountryCode;
  const pages = Math.min(
    Math.ceil(limit / GSEARCH_PAGE_SIZE),
    GSEARCH_MAX_PAGES,
  );

  const { results: searchResultsData } = await fetchGsearch({
    searchQuery,
    pages,
    country: countryCode,
    region: city,
    state,
  });

  if (!searchResultsData.length) {
    throw new Error(INSTAGRAM_ERROR_MESSAGES.GSEARCH_EMPTY);
  }

  // SERP URLs like /handle/reel/… or /handle/tagged/… still yield the profile handle
  // from the first path segment via `extractUsername` (same path as fetchFromEntities).
  const entities = uniqueUsernames(
    searchResultsData.map((row) => row.url ?? null),
  ).slice(0, limit);

  console.log(
    `[instagram] SERP rows=${searchResultsData.length} → unique profile handles=${entities.length} (limit=${limit})`,
  );

  return await fetchFromEntities(entities, countryCode, limit);
}

/** One AYML entry as Instagram ships it to a logged-out viewer. */
type AymlUser = {
  pk?: string | null;
  id?: string | null;
  username?: string | null;
  full_name?: string | null;
  is_verified?: boolean | null;
  profile_pic_url?: string | null;
};

type AymlData = {
  xig_user_by_igid_v2: { ayml_logged_out?: AymlUser[] | null } | null;
};

function mapAymlUser(user: AymlUser): INSTAGRAM_SUGGESTED_PROFILE {
  return {
    id: user.pk ?? user.id ?? null,
    username: user.username ?? null,
    fullName: user.full_name ?? null,
    instagramUrl: user.username ? instagramProfileUrl(user.username) : null,
    isVerified: user.is_verified ?? null,
    profilePicture: user.profile_pic_url ?? null,
  };
}

/**
 * "Accounts you might like" for one handle — the suggested/related accounts a
 * profile page shows a logged-out viewer, via the AYML query (keyed by pk, so
 * the profile query resolves the pk first). Instagram only populates this for
 * notable accounts; a small account returns an empty list, not an error. A
 * handle that doesn't exist returns `userId: null` and no suggestions.
 */
export async function fetchSuggestedProfiles(
  input: INSTAGRAM_SUGGESTED_REQUEST,
): Promise<INSTAGRAM_SUGGESTED_RESPONSE> {
  const username = extractUsername(input.username);
  if (!username) {
    throw new Error(INSTAGRAM_ERROR_MESSAGES.INVALID_ENTITY_FORMAT);
  }
  const limit = input.limit ?? INSTAGRAM_SUGGESTED_LIMIT_DEFAULT;

  const profile = await igLoggedOutQuery<{
    xig_user_by_username: { pk?: string | null } | null;
  }>("profile", { username });
  const pk = profile?.xig_user_by_username?.pk ?? null;
  if (!pk) return { username, userId: null, suggested: [] };

  const data = await igLoggedOutQuery<AymlData>("suggested", { id: pk });
  const list = data?.xig_user_by_igid_v2?.ayml_logged_out ?? [];
  const suggested = list.slice(0, limit).map(mapAymlUser);

  console.log(
    `[instagram] suggested: @${username} (${pk}) → ${suggested.length}`,
  );
  return { username, userId: pk, suggested };
}
