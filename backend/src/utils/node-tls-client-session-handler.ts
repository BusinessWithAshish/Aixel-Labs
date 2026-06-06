import { randomUUID } from "crypto";
import {
  ClientIdentifier,
  type SessionOptions,
  Session,
  destroyTLS,
  initTLS,
} from "node-tls-client";
import type { IncomingHttpHeaders } from "node:http";
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
  fetchUrlPresets,
} from "./fetch-session-common";

/**
 * URL fetch helper built on **node-tls-client** (`Session`): sequential GETs with
 * browser-like TLS fingerprints, optional Evomi residential proxy, retries, and
 * caller-defined response mapping (`string` body → `T`).
 *
 * **`targets` decides TLS session boundaries** (cookie jar + sticky proxy suffix):
 * - **`string[]`** — each URL is its own implicit batch → **new Session per URL**
 * - **`string[][]`** — each inner array is one batch → **one Session shared**
 */
export const DEFAULT_TLS_FETCH_CLIENT_IDENTIFIER = ClientIdentifier.chrome_131;

let tlsInitialized = false;
let tlsInitPromise: Promise<void> | null = null;
let tlsShutdownRegistered = false;

async function ensureTls(): Promise<void> {
  if (tlsInitialized) return;

  if (!tlsInitPromise) {
    registerTlsShutdown();
    tlsInitPromise = initTLS()
      .then(() => {
        tlsInitialized = true;
      })
      .catch((err) => {
        tlsInitPromise = null;
        throw err;
      });
  }

  await tlsInitPromise;
}

function registerTlsShutdown(): void {
  if (tlsShutdownRegistered) return;
  tlsShutdownRegistered = true;

  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.once(sig, () => {
      void shutdownTls();
    });
  }
}

async function shutdownTls(): Promise<void> {
  if (!tlsInitialized) return;
  await destroyTLS().catch(() => {});
  tlsInitialized = false;
  tlsInitPromise = null;
}

export type UrlFetchSession = InstanceType<typeof Session>;

export type CreateUrlFetchSessionOptions = {
  headers?: Record<string, string>;
  clientIdentifier?: ClientIdentifier;
  useProxy?: boolean;
  /** Evomi sticky suffix; random when omitted. */
  proxySessionSuffix?: string;
};

/** One TLS session (cookie jar + optional Evomi sticky proxy) for a caller batch. */
export async function createUrlFetchSession(
  options: CreateUrlFetchSessionOptions = {},
): Promise<UrlFetchSession> {
  await ensureTls();

  const {
    headers = {},
    clientIdentifier = DEFAULT_TLS_FETCH_CLIENT_IDENTIFIER,
    useProxy,
    proxySessionSuffix = randomUUID().replace(/-/g, "").slice(0, 12),
  } = options;

  const resolvedUseProxy = useProxy ?? evomiConfigured();
  const proxyUrl = resolvedUseProxy
    ? buildEvomiProxyUrl({ sessionId: proxySessionSuffix })
    : undefined;

  if (shouldDebugProxy()) {
    console.log(proxyDebugLine("tls", proxySessionSuffix, Boolean(proxyUrl)));
  }

  const sessionOpts: SessionOptions = {
    clientIdentifier,
    timeout: FETCH_URLS_REQUEST_TIMEOUT_MS,
    headers: mergeHttpHeaderRecords(DEFAULT_HTML_HEADERS, headers),
    insecureSkipVerify: true,
    randomTlsExtensionOrder: true,
    ...(proxyUrl ? { proxy: proxyUrl } : {}),
  };

  return new Session(sessionOpts);
}

export async function closeUrlFetchSession(
  sess: UrlFetchSession | null,
): Promise<void> {
  if (!sess) return;
  await sess.close().catch(() => {});
}

function retryAfterMs(headers: IncomingHttpHeaders): number | undefined {
  const raw = headers["retry-after"];
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s || typeof s !== "string") return undefined;
  const sec = parseInt(s, 10);
  if (Number.isFinite(sec) && sec > 0) return sec * 1_000;
  return undefined;
}

type ExecSession = InstanceType<typeof Session>;

export async function fetchUrls<T = unknown>(
  options: FetchUrlsOptions<T> & { clientIdentifier?: ClientIdentifier },
): Promise<T[]> {
  await ensureTls();

  const {
    targets,
    headers = {},
    mapper,
    clientIdentifier = DEFAULT_TLS_FETCH_CLIENT_IDENTIFIER,
    useProxy,
  } = options;

  const resolvedUseProxy = useProxy ?? evomiConfigured();
  const batches = toFetchBatches(targets).map(dedupeUrlsInBatch);

  const mapBody =
    mapper ??
    ((body: string, _ctx: FetchUrlsMapperCtx) => JSON.parse(body) as T);

  const tag = "[tls]";
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

  async function openSession(proxySessionSuffix: string): Promise<ExecSession> {
    return createUrlFetchSession({
      headers,
      clientIdentifier,
      useProxy: resolvedUseProxy,
      proxySessionSuffix,
    });
  }

  async function disposeSession(sess: ExecSession | null): Promise<void> {
    await closeUrlFetchSession(sess);
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]!;
    if (batch.length === 0) continue;

    if (batchIndex > 0 && INTER_REQUEST_GAP_MS > 0) {
      await sleep(INTER_REQUEST_GAP_MS);
    }

    let batchEvomiSuffix = randomUUID().replace(/-/g, "").slice(0, 12);
    let session: ExecSession | null = await openSession(batchEvomiSuffix);

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
            await disposeSession(session);
            batchEvomiSuffix = randomUUID().replace(/-/g, "").slice(0, 12);
            session = await openSession(batchEvomiSuffix);
          }

          try {
            const response = await withTimeout(
              session!.get(url, { followRedirects: true }),
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

            if (!response.ok && shouldRetryHttpStatus(response.status)) {
              await response.text().catch(() => "");
              lastError = new Error(`HTTP ${response.status}`);
              const waitAfter = retryAfterMs(response.headers);
              if (attempt < MAX_RETRIES_PER_URL) {
                const backoff =
                  waitAfter ??
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
      await disposeSession(session);
    }
  }

  console.log(`${tag} Done — ${results.length}/${totalUrls} succeeded.`);
  return results;
}
