import { randomUUID } from "crypto";
import {
  REDDIT_CACHE_MAX_ENTRIES,
  REDDIT_DEFAULT_COUNTRY,
  REDDIT_ERROR_MESSAGES,
  REDDIT_MAX_QUEUE_WAIT_MS,
  REDDIT_MIN_REQUEST_GAP_MS,
  REDDIT_OAUTH_ORIGIN,
  REDDIT_RATE_LIMIT_RETRIES,
  REDDIT_RETRY_AFTER_FALLBACK_MS,
  REDDIT_SESSION_ATTEMPTS,
  REDDIT_TOKEN_COOKIE,
  REDDIT_TOKEN_EXPIRY_MARGIN_MS,
  REDDIT_TOKEN_FALLBACK_TTL_MS,
  REDDIT_TOKEN_MINT_PATH,
  REDDIT_USER_AGENT,
  REDDIT_WEB_ORIGIN,
} from "./constants";
import { isRecord } from "./compute";
import { toAlpha2CountryCode } from "../../utils/country";
import {
  closeUrlFetchSession,
  createUrlFetchSession,
  type UrlFetchSession,
} from "../../utils/node-tls-client-session-handler";
import { evomiConfigured, sleep } from "../../utils/fetch-session-common";

export class RedditApiError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = "RedditApiError";
    this.statusCode = statusCode;
  }
}

/** Proxy tunnel died before Reddit answered (node-tls-client status 0). */
export class RedditTransportError extends RedditApiError {
  constructor() {
    super(REDDIT_ERROR_MESSAGES.TRANSPORT_FAILED, 502);
    this.name = "RedditTransportError";
  }
}

function rateLimitError(waitMs: number): RedditApiError {
  const suffix = waitMs > 0 ? ` (retry in ${Math.ceil(waitMs / 1000)}s)` : "";
  return new RedditApiError(`${REDDIT_ERROR_MESSAGES.RATE_LIMITED}${suffix}`, 429);
}

/** node-tls-client keeps Reddit's header casing and wraps values in arrays. */
function headerNumber(headers: Record<string, unknown>, name: string): number | null {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    const n = Number(Array.isArray(value) ? value[0] : value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pacing — every oauth request reserves a start slot, at least
// REDDIT_MIN_REQUEST_GAP_MS after the previous one, and never before Reddit's
// own `Retry-After` / window reset. Stays inside the limit; no rotation.
// ---------------------------------------------------------------------------

const pace = { nextSlotAt: 0 };

async function takeSlot(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, pace.nextSlotAt);
  if (slot - now > REDDIT_MAX_QUEUE_WAIT_MS) throw rateLimitError(slot - now);
  pace.nextSlotAt = slot + REDDIT_MIN_REQUEST_GAP_MS;
  if (slot > now) await sleep(slot - now);
}

function holdUntil(at: number): void {
  pace.nextSlotAt = Math.max(pace.nextSlotAt, at);
}

function notePacing(status: number, headers: Record<string, unknown>): void {
  const now = Date.now();
  if (status === 429) {
    const retryAfter = headerNumber(headers, "retry-after");
    holdUntil(now + (retryAfter !== null ? retryAfter * 1000 + 500 : REDDIT_RETRY_AFTER_FALLBACK_MS));
  }
  const remaining = headerNumber(headers, "x-ratelimit-remaining");
  const reset = headerNumber(headers, "x-ratelimit-reset");
  if (remaining !== null && reset !== null && remaining < 1) {
    holdUntil(now + reset * 1000 + 500);
  }
}

// ---------------------------------------------------------------------------
// Response cache — identical calls inside the TTL share one result (and one
// in-flight request). Failures are not cached.
// ---------------------------------------------------------------------------

const cache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

export function cachedReddit<T>(
  op: string,
  input: unknown,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const key = `${op}:${JSON.stringify(input)}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value as Promise<T>;

  for (const [k, entry] of cache) {
    if (entry.expiresAt <= now || cache.size >= REDDIT_CACHE_MAX_ENTRIES) cache.delete(k);
    else break;
  }
  const value = load();
  cache.delete(key);
  cache.set(key, { expiresAt: now + ttlMs, value });
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

export function mapRedditError(err: unknown): {
  statusCode: number;
  message: string;
} | null {
  if (err instanceof RedditApiError) {
    return { statusCode: err.statusCode, message: err.message };
  }
  return null;
}

/** Evomi `_country-XX` only accepts real ISO alpha-2 codes. */
export function redditProxyCountry(country: string | undefined): string {
  if (!country) return REDDIT_DEFAULT_COUNTRY;
  return toAlpha2CountryCode(country) ?? REDDIT_DEFAULT_COUNTRY;
}

export function createRedditFetchSession(country = REDDIT_DEFAULT_COUNTRY) {
  return createUrlFetchSession({
    useProxy: evomiConfigured(),
    proxyCountry: redditProxyCountry(country),
    proxySessionSuffix: randomUUID().replace(/-/g, "").slice(0, 12),
    headers: {
      "user-agent": REDDIT_USER_AGENT,
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
    },
  });
}

// ---------------------------------------------------------------------------
// Anonymous token — the logged-out web client's `token_v2` JWT, which
// oauth.reddit.com accepts as a Bearer for public read endpoints.
// ---------------------------------------------------------------------------

type RedditToken = { value: string; expiresAt: number };

let tokenCache: RedditToken | null = null;
let tokenInflight: Promise<RedditToken> | null = null;

function jwtExpiryMs(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      exp?: unknown;
    };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

function tokenFresh(token: RedditToken | null): token is RedditToken {
  return !!token && Date.now() < token.expiresAt - REDDIT_TOKEN_EXPIRY_MARGIN_MS;
}

export function invalidateRedditToken(): void {
  tokenCache = null;
}

async function mintToken(session: UrlFetchSession): Promise<RedditToken> {
  const response = await session.get(`${REDDIT_WEB_ORIGIN}${REDDIT_TOKEN_MINT_PATH}`, {
    followRedirects: true,
  });
  await response.text().catch(() => "");
  if (response.status === 0) throw new RedditTransportError();
  if (response.status === 403) {
    throw new RedditApiError(REDDIT_ERROR_MESSAGES.BLOCKED, 403);
  }
  if (response.status === 429) {
    throw rateLimitError((headerNumber(response.headers, "retry-after") ?? 0) * 1000);
  }

  let value: string | undefined = response.cookies?.[REDDIT_TOKEN_COOKIE];
  if (!value) {
    const jar = await session.cookies().catch(() => []);
    value = jar.find((c) => c.key === REDDIT_TOKEN_COOKIE)?.value as string | undefined;
  }
  if (!value) {
    throw new RedditApiError(
      `${REDDIT_ERROR_MESSAGES.TOKEN_FAILED}: ${response.status}`,
    );
  }
  return {
    value,
    expiresAt: jwtExpiryMs(value) ?? Date.now() + REDDIT_TOKEN_FALLBACK_TTL_MS,
  };
}

async function getToken(session: UrlFetchSession): Promise<RedditToken> {
  if (tokenFresh(tokenCache)) return tokenCache;
  if (tokenInflight) return tokenInflight;
  tokenInflight = mintToken(session)
    .then((token) => {
      tokenCache = token;
      return token;
    })
    .finally(() => {
      tokenInflight = null;
    });
  return tokenInflight;
}

export type RedditContext = {
  session: UrlFetchSession;
  token: RedditToken;
};

export type RedditQuery = Record<string, string | number | boolean | undefined>;

function buildUrl(path: string, query: RedditQuery = {}): string {
  const params = new URLSearchParams({ raw_json: "1" });
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return `${REDDIT_OAUTH_ORIGIN}${path}?${params.toString()}`;
}

/** 403 bodies carry `reason` for private/banned/quarantined subs. */
function forbiddenReason(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as unknown;
    return isRecord(parsed) && typeof parsed.reason === "string"
      ? parsed.reason
      : null;
  } catch {
    return null;
  }
}

/**
 * GET an oauth.reddit.com JSON path with the anonymous bearer, paced by
 * `takeSlot`. A 429 is waited out per `Retry-After` and retried. A 401 (or a
 * reason-less 403) means the token is stale or was rejected for this exit IP —
 * re-mint once in the same proxy session and retry.
 */
export async function redditGet<T = unknown>(
  ctx: RedditContext,
  path: string,
  query?: RedditQuery,
  notFoundMessage: string = REDDIT_ERROR_MESSAGES.REQUEST_FAILED,
): Promise<T> {
  const url = buildUrl(path, query);
  let reminted = false;
  for (let limited = 0; ; ) {
    await takeSlot();
    const response = await ctx.session.get(url, {
      headers: { authorization: `Bearer ${ctx.token.value}` },
      followRedirects: true,
    });
    const body = await response.text();
    notePacing(response.status, response.headers);

    if (response.ok) {
      try {
        return JSON.parse(body) as T;
      } catch {
        // Missing subreddits/users redirect to an HTML search page.
        throw new RedditApiError(notFoundMessage, 404);
      }
    }

    if (response.status === 0) throw new RedditTransportError();
    if (response.status === 404) {
      throw new RedditApiError(notFoundMessage, 404);
    }
    if (response.status === 429) {
      // takeSlot waits out Retry-After, or throws 429 when the wait is too long.
      if (++limited > REDDIT_RATE_LIMIT_RETRIES) {
        throw rateLimitError(pace.nextSlotAt - Date.now());
      }
      continue;
    }
    if (response.status === 403) {
      const reason = forbiddenReason(body);
      if (reason) {
        throw new RedditApiError(`${notFoundMessage} (${reason})`, 403);
      }
    }
    if ((response.status === 401 || response.status === 403) && !reminted) {
      reminted = true;
      invalidateRedditToken();
      ctx.token = await getToken(ctx.session);
      continue;
    }
    throw new RedditApiError(
      `${REDDIT_ERROR_MESSAGES.REQUEST_FAILED}: ${response.status}`,
      response.status === 403 ? 403 : 502,
    );
  }
}

/** Resolves `/r/{sub}/s/{code}` share links to their canonical post URL. */
export async function resolveShareLink(
  ctx: RedditContext,
  url: string,
): Promise<string> {
  const response = await ctx.session.get(url, { followRedirects: true });
  await response.text().catch(() => "");
  return response.url || url;
}

/**
 * Runs `fn` on a sticky Evomi session with a valid token. Every call is a
 * read-only GET, so a dead proxy exit (status 0) just reruns `fn` on a fresh one.
 */
export async function withRedditSession<T>(
  country: string,
  fn: (ctx: RedditContext) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < REDDIT_SESSION_ATTEMPTS; attempt++) {
    const session = await createRedditFetchSession(redditProxyCountry(country));
    try {
      const token = await getToken(session);
      return await fn({ session, token });
    } catch (err) {
      if (!(err instanceof RedditTransportError)) throw err;
      lastError = err;
    } finally {
      await closeUrlFetchSession(session);
    }
  }
  throw lastError;
}
