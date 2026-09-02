import type { CountryCode } from "libphonenumber-js";
import { randomUUID } from "crypto";

import {
  closeUrlFetchSession,
  createUrlFetchSession,
  type UrlFetchSession,
} from "../../utils/node-tls-client-session-handler";
import { fetchGsearch } from "../gsearch";
import {
  GSEARCH_MAX_PAGES,
  GSEARCH_MAX_QUERY_CHARS,
  GSEARCH_PAGE_SIZE,
} from "../gsearch/constants";
import {
  IG_ASBD_ID,
  IG_HEADERS,
  IG_PRIME_HEADERS,
  IG_PROFILE_MAX_RETRIES,
  INSTAGRAM_BASE_URL,
  INSTAGRAM_ERROR_MESSAGES,
  INSTAGRAM_MOBILE_API_BASE,
  INSTAGRAM_QUERY_LIMITS,
  INSTAGRAM_REQUEST_RESULT_LIMIT_DEFAULT,
  INSTAGRAM_WEB_PROFILE_INFO_PATH,
} from "./constants";
import {
  generateInstagramSearchQuery,
  instagramProfileUrl,
  mapInstagramWebProfileBody,
  mapSsrProfileHtml,
  uniqueUsernames,
} from "./compute";
import type { INSTAGRAM_REQUEST, INSTAGRAM_RESPONSE } from "./types";
import {
  RETRY_BASE_DELAY_MS,
  jitter,
  sleep,
} from "../../utils/fetch-session-common";

/** `INSTAGRAM_DEBUG=1` enables per-attempt prime/profile status logging. */
function igDebug(): boolean {
  return process.env.INSTAGRAM_DEBUG?.trim() === "1";
}

export function instagramWebProfileInfoUrl(username: string): string {
  return `${INSTAGRAM_MOBILE_API_BASE}${INSTAGRAM_WEB_PROFILE_INFO_PATH}?username=${encodeURIComponent(username)}`;
}

function resolveLimit(limit: number | undefined): number {
  return limit ?? INSTAGRAM_REQUEST_RESULT_LIMIT_DEFAULT;
}

/** 32-char lowercase-hex token matching Instagram's `csrftoken` shape. */
function randomCsrfToken(): string {
  return randomUUID().replace(/-/g, "").slice(0, 32).padEnd(32, "0");
}

/** Pull `csrf_token` from the SSR HTML JSON blob the profile page ships. */
function pickCsrfFromHtml(html: string): string | undefined {
  return (
    html.match(/"csrf_token"\s*:\s*"([^"]+)"/)?.[1] ??
    html.match(/{"token":"([^"]+)","claim"/)?.[1]
  );
}

type PrimeResult = {
  csrfToken: string;
  wwwClaim: string | null;
  cookieHeader: string;
  /** The profile HTML body — reused for the SSR fallback if `web_profile_info` 401s. */
  html: string;
  ok: boolean;
  status: number;
};

/**
 * Prime a logged-out guest session by loading the profile's SSR HTML page on
 * `www.instagram.com/{username}/`. This seeds the session cookie jar with
 * `csrftoken` / `mid` / `datr` / `ig_did` (the cookies `web_profile_info`
 * gates on) and exposes the CSRF token both in `Set-Cookie` and in the SSR
 * JSON blob. We manually rebuild the `cookie` header from `res.cookies`
 * because the session jar is host-scoped and the profile call goes to a
 * different host (`i.instagram.com`). The HTML body is captured so the SSR
 * fallback can parse it without a second GET if `web_profile_info` soft-blocks.
 */
async function primeGuestSession(
  session: UrlFetchSession,
  username: string,
): Promise<PrimeResult> {
  const res = await session.get(instagramProfileUrl(username), {
    followRedirects: true,
    headers: IG_PRIME_HEADERS,
  });
  const cookies = res.cookies ?? {};
  const html = await res.text();
  const csrfToken =
    cookies.csrftoken || pickCsrfFromHtml(html) || randomCsrfToken();
  const wwwClaim =
    (res.headers["x-ig-set-www-claim"] as string | undefined) ?? null;

  // Rebuild the cookie header for the cross-host profile call.
  const cookieParts: string[] = [];
  for (const [k, v] of Object.entries(cookies)) {
    cookieParts.push(`${k}=${v}`);
  }
  const cookieHeader = cookieParts.join("; ");

  if (igDebug()) {
    console.log(
      `[instagram] @${username} prime — HTTP ${res.status}, html ${html.length}b, csrf=${csrfToken ? "yes" : "no"}, cookies=[${Object.keys(cookies).join(",")}], wwwClaim=${wwwClaim ?? "none"}`,
    );
  }

  return {
    csrfToken,
    wwwClaim,
    cookieHeader,
    html,
    ok: res.ok,
    status: res.status,
  };
}

/**
 * Fetch one profile. Flow per attempt:
 *  1. Prime the guest session by loading the profile SSR HTML (always 200
 *     for public profiles — this is the guest-accessible surface).
 *  2. Call `web_profile_info` on `i.instagram.com`. On 200, map the full
 *     response (includes business category / email / phone on non-flagged IPs).
 *  3. On 401/403/429 (IP soft-block — `require_login: true`), fall back to
 *     parsing the SSR HTML `xig_user_by_username` blob we already fetched in
 *     step 1. Instagram does NOT ship the business contact block to logged-out
 *     readers, so `businessCategoryName`/`businessEmail`(from API) come back
 *     null — but emails/phones in the public `biography` are extracted, so
 *     the lead is real data, not empty.
 *  4. Only retry (rotate IP) if the SSR fallback itself had no user blob
 *     (rare — means the HTML didn't load properly).
 *
 * Returns the mapped response, or `null` if the profile is gone (404) or
 * unreachable after all retries.
 */
async function fetchOneProfile(
  username: string,
  countryCode: CountryCode,
): Promise<INSTAGRAM_RESPONSE | null> {
  const profileUrl = instagramWebProfileInfoUrl(username);
  const referer = instagramProfileUrl(username);

  let lastStatus = 0;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= IG_PROFILE_MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      await sleep(jitter(RETRY_BASE_DELAY_MS * 2 ** (attempt - 2)));
    }

    // Fresh sticky Evomi session per attempt so prime + profile share one
    // exit IP; retries rotate the suffix (and thus the exit IP). Route
    // through US residential exits — Instagram is US-based and US pools
    // are far less soft-blocked for `web_profile_info` guest access than
    // the random-country default.
    const session = await createUrlFetchSession({
      headers: IG_HEADERS,
      proxyCountry: process.env.INSTAGRAM_PROXY_COUNTRY ?? "US",
    });

    try {
      const prime = await primeGuestSession(session, username);

      // Guest-only cookie header: primed csrftoken/mid/datr/ig_did. We do
      // NOT inject logged-in `sessionid` — using account cookies risks
      // checkpointing the account, and the SSR HTML fallback already
      // covers flagged-IP cases without any login.
      const apiHeaders: Record<string, string> = {
        ...IG_HEADERS,
        "x-asbd-id": IG_ASBD_ID,
        "x-csrftoken": prime.csrfToken,
        ...(prime.wwwClaim ? { "x-ig-www-claim": prime.wwwClaim } : {}),
        ...(prime.cookieHeader ? { cookie: prime.cookieHeader } : {}),
        referer,
      };

      const res = await session.get(profileUrl, {
        followRedirects: true,
        headers: apiHeaders,
      });
      lastStatus = res.status;

      if (res.status === 404) {
        // Permanent — don't retry, don't fall back.
        if (igDebug()) console.log(`[instagram] @${username} — 404 (gone)`);
        return null;
      }

      if (res.ok) {
        const text = await res.text();
        try {
          if (igDebug()) {
            console.log(
              `[instagram] @${username} — web_profile_info 200, ${text.length}b (full data)`,
            );
          }
          return mapInstagramWebProfileBody(text, countryCode);
        } catch (err) {
          // `web_profile_info` returned 200 but no `data.user` (age-restricted
          // accounts return 200 with null user). Fall through to SSR fallback.
          lastErr = err instanceof Error ? err : new Error(String(err));
          if (igDebug()) {
            console.log(
              `[instagram] @${username} — 200 but map failed: ${lastErr.message}, trying SSR fallback`,
            );
          }
        }
      } else {
        // 401 / 403 / 429 — IP soft-blocked. Don't waste the prime HTML; fall
        // back to SSR parsing below.
        const body = await res.text().catch(() => "");
        lastErr = new Error(`HTTP ${res.status}`);
        if (igDebug()) {
          console.log(
            `[instagram] @${username} — web_profile_info HTTP ${res.status}: ${body.slice(0, 120)} → SSR fallback`,
          );
        }
      }

      // SSR fallback: parse the `xig_user_by_username` blob from the prime
      // HTML. This works on any IP (the SSR page is guest-accessible) and
      // gives basic fields + bio-extracted emails/phones.
      const ssr = mapSsrProfileHtml(prime.html, countryCode);
      if (ssr) {
        if (igDebug()) {
          console.log(
            `[instagram] @${username} — SSR fallback resolved (followers=${ssr.followers}, bio=${ssr.bio ? `${ssr.bio.length}ch` : "none"})`,
          );
        }
        return ssr;
      }

      // SSR blob missing — the prime HTML didn't load properly (rare).
      // Retry with a rotated IP.
      lastErr = new Error("SSR fallback: no xig_user_by_username blob in HTML");
      if (attempt < IG_PROFILE_MAX_RETRIES) continue;
      return null;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (igDebug()) {
        console.log(
          `[instagram] @${username} attempt ${attempt} threw: ${lastErr.message}`,
        );
      }
      if (attempt < IG_PROFILE_MAX_RETRIES) continue;
      return null;
    } finally {
      await closeUrlFetchSession(session);
    }
  }

  // Exhausted retries — log and skip this handle.
  console.log(
    `[instagram] @${username} — failed after ${IG_PROFILE_MAX_RETRIES} attempt(s) (last status ${lastStatus}, ${lastErr?.message ?? "no error"})`,
  );
  return null;
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
  const results: INSTAGRAM_RESPONSE[] = [];

  // Sequential per-handle fetches; each handle gets its own primed guest
  // session + sticky proxy IP. One blocked handle doesn't fail the batch.
  for (const username of usernames) {
    const profile = await fetchOneProfile(username, countryCode);
    if (profile) results.push(profile);
  }

  console.log(
    `[instagram] entities: ${usernames.length} requested → ${results.length} resolved`,
  );
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
