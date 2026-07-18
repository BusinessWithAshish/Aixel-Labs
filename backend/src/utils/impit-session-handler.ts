import { randomUUID } from "crypto";
import { Impit } from "impit";
import { withTimeout } from "./async-helpers";
import {
  DEFAULT_HTML_HEADERS,
  FETCH_URLS_REQUEST_TIMEOUT_MS,
  INTER_REQUEST_GAP_MS,
  MAX_RETRIES_PER_URL,
  RETRY_BASE_DELAY_MS,
  buildEvomiProxyUrl,
  dedupeUrlsInBatch,
  evomiConfigured,
  isProxyTunnelError,
  jitter,
  mergeHttpHeaderRecords,
  proxyDebugLine,
  shouldDebugProxy,
  shouldRetryHttpStatus,
  shouldSkipHttpStatus,
  shortUrl,
  sleep,
  toFetchBatches,
  type FetchUrlsMapperCtx,
  type FetchUrlsOptions,
} from "./fetch-session-common";

export type { FetchUrlsMapperCtx, FetchUrlsOptions };
export {
  DEFAULT_HTML_HEADERS,
  FETCH_URLS_REQUEST_TIMEOUT_MS,
} from "./fetch-session-common";

export type ImpitFetchSession = Impit;

export type CreateImpitFetchSessionOptions = {
  headers?: Record<string, string>;
  useProxy?: boolean;
  /** Evomi sticky suffix; random when omitted. */
  proxySessionSuffix?: string;
  /** ISO 3166-1 alpha-2 code for `_country-XX` proxy routing. */
  proxyCountry?: string;
  /** Optional region for `_region-*` proxy routing. */
  proxyRegion?: string;
  timeoutMs?: number;
};

/** Create an Impit client with the same Evomi sticky-session semantics as the TLS handler. */
export function createImpitFetchSession(
  options: CreateImpitFetchSessionOptions = {},
): ImpitFetchSession {
  const {
    headers = {},
    useProxy,
    proxySessionSuffix = randomUUID().replace(/-/g, "").slice(0, 12),
    proxyCountry,
    proxyRegion,
    timeoutMs = FETCH_URLS_REQUEST_TIMEOUT_MS,
  } = options;

  const resolvedUseProxy = useProxy ?? evomiConfigured();
  const proxyUrl = resolvedUseProxy
    ? buildEvomiProxyUrl({
        sessionId: proxySessionSuffix,
        countryCode: proxyCountry,
        region: proxyRegion,
      })
    : undefined;

  if (shouldDebugProxy()) {
    console.log(proxyDebugLine("impit", proxySessionSuffix, Boolean(proxyUrl)));
  }

  return new Impit({
    browser: "chrome",
    ignoreTlsErrors: true,
    timeout: timeoutMs,
    followRedirects: true,
    headers: mergeHttpHeaderRecords(DEFAULT_HTML_HEADERS, headers),
    ...(proxyUrl ? { proxyUrl } : {}),
  });
}

export async function closeImpitFetchSession(
  sess: ImpitFetchSession | null,
): Promise<void> {
  if (!sess) return;
  await (sess as unknown as { close?: () => Promise<void> })
    .close?.()
    .catch(() => {});
}

function shouldRetryImpitHttpStatus(status: number): boolean {
  if (status === 999) return true;
  return shouldRetryHttpStatus(status);
}

/**
 * Impit-based URL fetcher with the same return semantics and batching rules as `fetchUrls`.
 */
export async function fetchUrlsImpit<T = unknown>(
  options: FetchUrlsOptions<T>,
): Promise<T[]> {
  const { targets, headers = {}, mapper, useProxy } = options;

  const resolvedUseProxy = useProxy ?? evomiConfigured();
  const batches = toFetchBatches(targets).map(dedupeUrlsInBatch);

  const mapBody =
    mapper ??
    ((body: string, _ctx: FetchUrlsMapperCtx) => JSON.parse(body) as T);

  const tag = "[impit]";
  const totalUrls = batches.reduce((n, b) => n + b.length, 0);
  const results: T[] = [];

  if (totalUrls === 0) {
    console.log(`${tag} No URLs to fetch.`);
    return results;
  }

  console.log(
    `${tag} Starting — ${totalUrls} URL(s) in ${batches.length} batch(es).`,
  );

  let globalOrdinal = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]!;
    if (batch.length === 0) continue;

    if (batchIndex > 0 && INTER_REQUEST_GAP_MS > 0) {
      await sleep(INTER_REQUEST_GAP_MS);
    }

    let batchEvomiSuffix = randomUUID().replace(/-/g, "").slice(0, 12);
    let session: ImpitFetchSession | null = createImpitFetchSession({
      headers,
      useProxy: resolvedUseProxy,
      proxySessionSuffix: batchEvomiSuffix,
    });

    try {
      for (let j = 0; j < batch.length; j++) {
        if (j > 0 && INTER_REQUEST_GAP_MS > 0) {
          await sleep(INTER_REQUEST_GAP_MS);
        }

        globalOrdinal++;
        const url = batch[j]!;
        const ctx: FetchUrlsMapperCtx = { url, batchIndex };
        const pos = `[${globalOrdinal}/${totalUrls}]`;

        console.log(
          `${tag} ${pos} Fetching (batch ${batchIndex + 1}): ${shortUrl(url)}`,
        );

        const startMs = Date.now();
        let lastError: Error | null = null;
        let settled = false;

        for (
          let attempt = 1;
          attempt <= MAX_RETRIES_PER_URL && !settled;
          attempt++
        ) {
          if (attempt > 1) {
            await closeImpitFetchSession(session);
            batchEvomiSuffix = randomUUID().replace(/-/g, "").slice(0, 12);
            session = createImpitFetchSession({
              headers,
              useProxy: resolvedUseProxy,
              proxySessionSuffix: batchEvomiSuffix,
            });
          }

          try {
            const response = await withTimeout(
              session.fetch(url, { method: "GET" }),
              FETCH_URLS_REQUEST_TIMEOUT_MS,
              `${pos} attempt ${attempt}`,
            );

            const elapsed = Date.now() - startMs;

            if (shouldSkipHttpStatus(response.status)) {
              await response.text().catch(() => "");
              console.log(
                `${tag} ${pos} — Skipped (${elapsed}ms, HTTP ${response.status})`,
              );
              settled = true;
              break;
            }

            if (!response.ok && shouldRetryImpitHttpStatus(response.status)) {
              await response.text().catch(() => "");
              lastError = new Error(`HTTP ${response.status}`);
              if (attempt < MAX_RETRIES_PER_URL) {
                const backoff =
                  RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + jitter();
                console.log(
                  `${tag} ${pos} ↻ Retry ${attempt + 1}/${MAX_RETRIES_PER_URL} in ${Math.round(backoff)}ms (HTTP ${response.status})`,
                );
                await sleep(backoff);
              }
              continue;
            }

            if (!response.ok) {
              await response.text().catch(() => "");
              console.log(
                `${tag} ${pos} — Skipped (${elapsed}ms, HTTP ${response.status})`,
              );
              settled = true;
              break;
            }

            const body = await response.text();
            const value = mapBody(body, ctx);
            console.log(`${tag} ${pos} ✓ Success (${Date.now() - startMs}ms)`);
            results.push(value);
            settled = true;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            const elapsed = Date.now() - startMs;
            console.log(
              `${tag} ${pos} ✗ Error on attempt ${attempt}/${MAX_RETRIES_PER_URL}: ${lastError.message} (${elapsed}ms)`,
            );
            if (attempt < MAX_RETRIES_PER_URL) {
              const backoff =
                RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + jitter();
              const wait = isProxyTunnelError(lastError.message)
                ? backoff * 3 + 1_500 + jitter(1_000)
                : backoff;
              console.log(
                `${tag} ${pos} ↻ Retry ${attempt + 1}/${MAX_RETRIES_PER_URL} in ${Math.round(wait)}ms`,
              );
              await sleep(wait);
            }
          }
        }

        if (!settled && lastError) {
          const elapsed = Date.now() - startMs;
          console.log(
            `${tag} ${pos} ✗ Failed after ${MAX_RETRIES_PER_URL} attempt(s): ${lastError.message} (${elapsed}ms)`,
          );
        }
      }
    } finally {
      await closeImpitFetchSession(session);
    }
  }

  console.log(`${tag} Done — ${results.length}/${totalUrls} succeeded.`);
  return results;
}
