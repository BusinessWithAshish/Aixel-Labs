import { YOUTUBE_BASE_URL } from "./constants";
import { fetchInnertubeClientVersion } from "./helpers";
import {
  closeUrlFetchSession,
  type UrlFetchSession,
} from "../../utils/node-tls-client-session-handler";

/**
 * INNERTUBE_CLIENT_VERSION is a WEB-client build id embedded in every
 * youtube.com page — identical regardless of video/channel/country. Every
 * call site used to scrape it fresh via a full watch/channel-page HTML load
 * (several hundred KB, sometimes 1MB+), which was the single largest
 * contributor to Evomi proxy bandwidth in this module. It only rotates on
 * YouTube's own release cadence (hours, not seconds), so one cached value
 * safely serves a large volume of `postInnertube` calls.
 */
const CLIENT_VERSION_TTL_MS = 6 * 60 * 60 * 1000;

let cached: { version: string; fetchedAt: number } | null = null;
let inflight: Promise<string> | null = null;

function isFresh(): boolean {
  return !!cached && Date.now() - cached.fetchedAt < CLIENT_VERSION_TTL_MS;
}

async function refetch(
  openSession: () => Promise<UrlFetchSession>,
): Promise<string> {
  const session = await openSession();
  try {
    const version = await fetchInnertubeClientVersion(session, YOUTUBE_BASE_URL);
    cached = { version, fetchedAt: Date.now() };
    return version;
  } finally {
    await closeUrlFetchSession(session);
  }
}

/** Returns the cached client version, refreshing via one page fetch when stale/absent. */
export async function getSharedInnertubeClientVersion(
  openSession: () => Promise<UrlFetchSession>,
): Promise<string> {
  if (isFresh()) return cached!.version;
  if (inflight) return inflight;

  inflight = refetch(openSession).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Drops the cached version so the next call refetches — used after a request fails on a possibly-stale version. */
export function invalidateSharedInnertubeClientVersion(): void {
  cached = null;
}

/**
 * Runs `fn` with the cached client version. If it throws and the version
 * came from cache (not a fresh fetch), invalidates and retries once with a
 * freshly scraped version — guards against YouTube rotating
 * INNERTUBE_CLIENT_VERSION mid-TTL without paying the full-page cost on
 * every request just to be safe.
 */
export async function withSharedClientVersion<T>(
  openSession: () => Promise<UrlFetchSession>,
  fn: (clientVersion: string) => Promise<T>,
): Promise<{ result: T; clientVersion: string }> {
  const usedCache = isFresh();
  const clientVersion = await getSharedInnertubeClientVersion(openSession);

  try {
    return { result: await fn(clientVersion), clientVersion };
  } catch (err) {
    if (!usedCache) throw err;
    invalidateSharedInnertubeClientVersion();
    const freshVersion = await getSharedInnertubeClientVersion(openSession);
    return { result: await fn(freshVersion), clientVersion: freshVersion };
  }
}
