import { randomBytes, randomUUID } from "crypto";
import {
  TWITTER_ABS_MAIN_RE,
  TWITTER_API_ORIGIN,
  TWITTER_API_TWITTER_ORIGIN,
  TWITTER_DEFAULT_COUNTRY,
  TWITTER_ERROR_MESSAGES,
  TWITTER_FALLBACK_OPERATIONS,
  TWITTER_FALSE_FEATURES,
  TWITTER_FALSE_TOGGLES,
  TWITTER_GRAPHQL_OPERATIONS,
  TWITTER_ORIGIN,
  TWITTER_QUERY_CATALOG_TTL_MS,
  TWITTER_USER_AGENT,
  TWITTER_WEB_BEARER,
  type TwitterGraphqlOperation,
  type TwitterGraphqlOperationName,
} from "./constants";
import { isRecord } from "./compute";
import { toAlpha2CountryCode } from "../../utils/country";
import {
  closeUrlFetchSession,
  createUrlFetchSession,
  type UrlFetchSession,
} from "../../utils/node-tls-client-session-handler";
import { evomiConfigured } from "../../utils/fetch-session-common";

export class TwitterApiError extends Error {
  statusCode: number;
  retryCatalog: boolean;
  constructor(message: string, statusCode = 502, retryCatalog = false) {
    super(message);
    this.name = "TwitterApiError";
    this.statusCode = statusCode;
    this.retryCatalog = retryCatalog;
  }
}

export function mapTwitterError(err: unknown): {
  statusCode: number;
  message: string;
} | null {
  if (err instanceof TwitterApiError) {
    return { statusCode: err.statusCode, message: err.message };
  }
  return null;
}

/**
 * Evomi `_country-XX` only accepts real ISO alpha-2 codes. Invalid values
 * (e.g. `ZZ`) make guest/activate fail with a transport status 0 before any
 * Twitter call runs — including the worldwide-trends fallback.
 */
export function twitterProxyCountry(country: string | undefined): string {
  if (!country) return TWITTER_DEFAULT_COUNTRY;
  return toAlpha2CountryCode(country) ?? TWITTER_DEFAULT_COUNTRY;
}

/** Catalog 404 / rate-limit / guest-auth — must not be swallowed as "not found". */
export function shouldPropagateTwitterError(err: unknown): boolean {
  if (!(err instanceof TwitterApiError)) return false;
  return (
    err.retryCatalog ||
    err.statusCode === 429 ||
    err.statusCode === 401 ||
    err.statusCode === 403
  );
}

export function createTwitterFetchSession(country = TWITTER_DEFAULT_COUNTRY) {
  return createUrlFetchSession({
    useProxy: evomiConfigured(),
    proxyCountry: twitterProxyCountry(country),
    proxySessionSuffix: randomUUID().replace(/-/g, "").slice(0, 12),
    headers: {
      "user-agent": TWITTER_USER_AGENT,
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
    },
  });
}

function csrfToken(): string {
  return randomBytes(16).toString("hex");
}

function guestHeaders(guestToken: string, csrf: string): Record<string, string> {
  return {
    authorization: `Bearer ${TWITTER_WEB_BEARER}`,
    "x-guest-token": guestToken,
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
    "x-csrf-token": csrf,
    "content-type": "application/json",
    referer: `${TWITTER_ORIGIN}/`,
    cookie: `gt=${guestToken}; ct0=${csrf}`,
  };
}

export type TwitterGuestContext = {
  session: UrlFetchSession;
  guestToken: string;
  csrf: string;
};

export async function activateGuest(
  session: UrlFetchSession,
): Promise<{ guestToken: string; csrf: string }> {
  const csrf = csrfToken();
  const response = await session.post(
    `${TWITTER_API_TWITTER_ORIGIN}/1.1/guest/activate.json`,
    {
      headers: {
        authorization: `Bearer ${TWITTER_WEB_BEARER}`,
        "content-type": "application/json",
        referer: `${TWITTER_ORIGIN}/`,
      },
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new TwitterApiError(
      `${TWITTER_ERROR_MESSAGES.GUEST_FAILED}: ${response.status}`,
      response.status === 429 ? 429 : 502,
    );
  }
  const parsed = JSON.parse(body) as { guest_token?: string };
  const guestToken = parsed.guest_token;
  if (!guestToken) {
    throw new TwitterApiError(TWITTER_ERROR_MESSAGES.GUEST_FAILED);
  }
  return { guestToken, csrf };
}

let catalogCache: {
  ops: Record<TwitterGraphqlOperationName, TwitterGraphqlOperation>;
  fetchedAt: number;
} | null = null;
let catalogInflight: Promise<
  Record<TwitterGraphqlOperationName, TwitterGraphqlOperation>
> | null = null;

function catalogFresh(): boolean {
  return (
    !!catalogCache &&
    Date.now() - catalogCache.fetchedAt < TWITTER_QUERY_CATALOG_TTL_MS
  );
}

export function invalidateTwitterQueryCatalog(): void {
  catalogCache = null;
}

function parseOperationsFromJs(
  js: string,
): Record<TwitterGraphqlOperationName, TwitterGraphqlOperation> | null {
  const next = { ...TWITTER_FALLBACK_OPERATIONS };
  let found = 0;
  for (const name of Object.values(TWITTER_GRAPHQL_OPERATIONS)) {
    const qidMatch = js.match(
      new RegExp(`queryId:"([^"]+)",operationName:"${name}"`),
    );
    if (!qidMatch?.[1]) continue;
    const idx = js.indexOf(`operationName:"${name}"`);
    const chunk = js.slice(idx, idx + 8000);
    const fsMatch = chunk.match(/featureSwitches:(\[.*?\])/);
    const ftMatch = chunk.match(/fieldToggles:(\[.*?\])/);
    try {
      next[name] = {
        queryId: qidMatch[1],
        featureSwitches: fsMatch
          ? (JSON.parse(fsMatch[1]) as string[])
          : next[name].featureSwitches,
        fieldToggles: ftMatch
          ? (JSON.parse(ftMatch[1]) as string[])
          : next[name].fieldToggles,
      };
      found += 1;
    } catch {
      next[name] = { ...next[name], queryId: qidMatch[1] };
      found += 1;
    }
  }
  return found > 0 ? next : null;
}

async function scrapeQueryCatalog(
  session: UrlFetchSession,
): Promise<Record<TwitterGraphqlOperationName, TwitterGraphqlOperation>> {
  const htmlRes = await session.get(TWITTER_ORIGIN, { followRedirects: true });
  const html = await htmlRes.text();
  const mainUrl = html.match(TWITTER_ABS_MAIN_RE)?.[0];
  if (!mainUrl) return TWITTER_FALLBACK_OPERATIONS;
  const jsRes = await session.get(mainUrl, { followRedirects: true });
  if (!jsRes.ok) return TWITTER_FALLBACK_OPERATIONS;
  const parsed = parseOperationsFromJs(await jsRes.text());
  return parsed ?? TWITTER_FALLBACK_OPERATIONS;
}

export async function getTwitterQueryCatalog(
  session: UrlFetchSession,
): Promise<Record<TwitterGraphqlOperationName, TwitterGraphqlOperation>> {
  if (catalogFresh()) return catalogCache!.ops;
  if (catalogInflight) return catalogInflight;
  catalogInflight = scrapeQueryCatalog(session)
    .then((ops) => {
      catalogCache = { ops, fetchedAt: Date.now() };
      return ops;
    })
    .finally(() => {
      catalogInflight = null;
    });
  return catalogInflight;
}

export async function twitterGraphql<T>(
  ctx: TwitterGuestContext,
  name: TwitterGraphqlOperationName,
  variables: Record<string, unknown>,
): Promise<T> {
  const catalog = catalogCache?.ops ?? TWITTER_FALLBACK_OPERATIONS;
  const op = catalog[name];
  const features: Record<string, boolean> = {};
  for (const key of op.featureSwitches) {
    features[key] = !TWITTER_FALSE_FEATURES.has(key);
  }
  const fieldToggles: Record<string, boolean> = {};
  for (const key of op.fieldToggles) {
    fieldToggles[key] = !TWITTER_FALSE_TOGGLES.has(key);
  }
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(features),
    fieldToggles: JSON.stringify(fieldToggles),
  });
  const url = `${TWITTER_API_ORIGIN}/graphql/${op.queryId}/${name}?${params.toString()}`;
  const response = await ctx.session.get(url, {
    headers: guestHeaders(ctx.guestToken, ctx.csrf),
  });
  const text = await response.text();
  if (response.status === 404) {
    throw new TwitterApiError(
      "Twitter GraphQL operation not found",
      404,
      true,
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new TwitterApiError(
      TWITTER_ERROR_MESSAGES.GUEST_FAILED,
      response.status,
    );
  }
  if (!response.ok) {
    throw new TwitterApiError(
      `${TWITTER_ERROR_MESSAGES.GRAPHQL_FAILED}: ${response.status}`,
      response.status === 429 ? 429 : 502,
    );
  }
  return JSON.parse(text) as T;
}

export async function withTwitterGuest<T>(
  country: string,
  fn: (ctx: TwitterGuestContext) => Promise<T>,
): Promise<T> {
  const session = await createTwitterFetchSession(twitterProxyCountry(country));
  try {
    if (!catalogCache) {
      catalogCache = {
        ops: TWITTER_FALLBACK_OPERATIONS,
        fetchedAt: Date.now(),
      };
    }
    const { guestToken, csrf } = await activateGuest(session);
    const ctx: TwitterGuestContext = { session, guestToken, csrf };
    try {
      return await fn(ctx);
    } catch (err) {
      if (err instanceof TwitterApiError && err.retryCatalog) {
        invalidateTwitterQueryCatalog();
        await getTwitterQueryCatalog(session);
        return await fn(ctx);
      }
      throw err;
    }
  } finally {
    await closeUrlFetchSession(session);
  }
}

export async function twitterGetJson<T>(
  ctx: TwitterGuestContext,
  url: string,
): Promise<T> {
  const response = await ctx.session.get(url, {
    headers: guestHeaders(ctx.guestToken, ctx.csrf),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new TwitterApiError(
      `Twitter request failed: ${response.status}`,
      response.status === 429 ? 429 : 502,
    );
  }
  return JSON.parse(text) as T;
}

export function graphqlData(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  return isRecord(raw.data) ? raw.data : {};
}

export { guestHeaders };
