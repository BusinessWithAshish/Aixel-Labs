import {
  closeUrlFetchSession,
  createUrlFetchSession,
  type UrlFetchSession,
} from "../../utils/node-tls-client-session-handler";
import { FETCH_URLS_REQUEST_TIMEOUT_MS } from "../../utils/fetch-session-common";
import { jitter, sleep, withTimeout } from "../../utils/async-helpers";
import { runWithConcurrency } from "../youtube/concurrency";
import {
  CRAWL,
  CRAWL_STATUS,
  CRAWL_WELL_KNOWN_PATHS,
} from "./constants";
import {
  classifyFetchError,
  extractFromHtml,
  hasCoreContacts,
  mergeExtracts,
  scoreUrl,
  shouldSkipUrl,
} from "./compute";
import type {
  CRAWL_OPTIONS,
  CRAWL_RESULT,
  CRAWL_PAGE_EXTRACT,
  CRAWL_STATUS_VALUE,
} from "./types";

type QueueItem = { url: string; depth: number; score: number };

async function fetchPage(
  session: UrlFetchSession,
  url: string,
): Promise<{ status: number; body: string }> {
  const response = await session.get(url, { followRedirects: true });
  const body = await response.text();
  return { status: response.status, body };
}

async function fetchWithRetry(
  getSession: () => Promise<UrlFetchSession>,
  setSession: (s: UrlFetchSession) => void,
  closeAndReplace: () => Promise<UrlFetchSession>,
  url: string,
): Promise<{ status: number; body: string }> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= CRAWL.FETCH_RETRIES + 1; attempt++) {
    try {
      const session = await getSession();
      const result = await withTimeout(
        fetchPage(session, url),
        FETCH_URLS_REQUEST_TIMEOUT_MS,
        `fetch ${url}`,
      );

      if (result.status === 403 || result.status === 429) {
        lastErr = new Error(`HTTP ${result.status}`);
        if (attempt <= CRAWL.FETCH_RETRIES) {
          await closeAndReplace().then(setSession);
          await sleep(500 + jitter(400));
          continue;
        }
        return result;
      }
      return result;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt <= CRAWL.FETCH_RETRIES) {
        await closeAndReplace().then(setSession);
        await sleep(400 * 2 ** (attempt - 1) + jitter(200));
        continue;
      }
    }
  }
  throw lastErr ?? new Error("fetch failed");
}

/** Priority BFS crawl of one registrable domain with sticky Evomi session. */
export async function crawlDomain(
  domain: string,
  seedUrl: string,
  options: CRAWL_OPTIONS,
): Promise<CRAWL_RESULT> {
  const { maxPages, maxDepth, thorough, country } = options;
  const pagesCrawled: string[] = [];
  const extracts: CRAWL_PAGE_EXTRACT[] = [];
  const errors: string[] = [];
  const visited = new Set<string>();
  const queue: QueueItem[] = [];

  const enqueue = (url: string, depth: number) => {
    const normalized = url.split("#")[0]!;
    if (visited.has(normalized)) return;
    if (shouldSkipUrl(normalized, domain)) return;
    const score = scoreUrl(normalized);
    if (score < 0 && depth > 0) return;
    visited.add(normalized);
    queue.push({ url: normalized, depth, score });
  };

  enqueue(seedUrl, 0);
  for (const path of CRAWL_WELL_KNOWN_PATHS) {
    enqueue(`https://${domain}${path}`, 1);
  }

  let session: UrlFetchSession | null = null;
  let homepageStatus: number | null = null;
  let fatalStatus: CRAWL_STATUS_VALUE | null = null;

  const openSession = async () => {
    session = await createUrlFetchSession({});
    return session;
  };
  const replaceSession = async () => {
    if (session) await closeUrlFetchSession(session);
    return openSession();
  };

  try {
    await openSession();

    while (queue.length > 0 && pagesCrawled.length < maxPages) {
      queue.sort((a, b) => b.score - a.score);

      const batchSize = Math.min(
        CRAWL.PAGE_CONCURRENCY,
        maxPages - pagesCrawled.length,
        queue.length,
      );
      const batch = queue.splice(0, batchSize);

      const batchResults = await runWithConcurrency(
        batch,
        CRAWL.PAGE_CONCURRENCY,
        async (item) => {
          try {
            const result = await fetchWithRetry(
              async () => {
                if (!session) await openSession();
                return session!;
              },
              (s) => {
                session = s;
              },
              replaceSession,
              item.url,
            );
            return { item, ...result, error: null as string | null };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { item, status: 0, body: "", error: msg };
          }
        },
      );

      for (const r of batchResults) {
        if (r.error) {
          errors.push(`${r.item.url}: ${r.error}`);
          if (!fatalStatus && pagesCrawled.length === 0) {
            fatalStatus = classifyFetchError(r.error);
          }
          continue;
        }

        if (r.item.depth === 0 && homepageStatus === null) {
          homepageStatus = r.status;
        }

        if (r.status === 0) {
          errors.push(`${r.item.url}: connection failed (status 0)`);
          if (!fatalStatus) fatalStatus = CRAWL_STATUS.DNS_FAIL;
          continue;
        }

        if (r.status === 404) {
          if (r.item.depth === 0) {
            fatalStatus = CRAWL_STATUS.NOT_FOUND;
          }
          continue;
        }

        if (r.status === 403 || r.status === 429) {
          errors.push(`${r.item.url}: HTTP ${r.status}`);
          if (!fatalStatus) fatalStatus = CRAWL_STATUS.BLOCKED;
          continue;
        }

        if (r.status < 200 || r.status >= 400 || !r.body) {
          errors.push(`${r.item.url}: HTTP ${r.status}`);
          if (!fatalStatus && pagesCrawled.length === 0) {
            fatalStatus = CRAWL_STATUS.UPSTREAM_ERROR;
          }
          continue;
        }

        pagesCrawled.push(r.item.url);
        extracts.push(
          extractFromHtml(r.body, r.item.url, {
            country,
            registrableDomain: domain,
          }),
        );

        if (r.item.depth < maxDepth) {
          for (const link of extracts[extracts.length - 1]!.links) {
            enqueue(link, r.item.depth + 1);
          }
        }
      }

      if (!thorough) {
        const merged = mergeExtracts(extracts);
        if (hasCoreContacts(merged)) break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    fatalStatus = fatalStatus ?? classifyFetchError(err);
  } finally {
    await closeUrlFetchSession(session);
  }

  if (pagesCrawled.length === 0) {
    return {
      extracts: [],
      pagesCrawled,
      status:
        fatalStatus ??
        (homepageStatus === 404
          ? CRAWL_STATUS.NOT_FOUND
          : CRAWL_STATUS.UPSTREAM_ERROR),
      errors,
    };
  }

  return {
    extracts,
    pagesCrawled,
    status: CRAWL_STATUS.SUCCESS,
    errors: errors.length > 0 ? errors : [],
  };
}
