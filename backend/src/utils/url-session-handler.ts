import { randomUUID } from "crypto";
import {
  ClientIdentifier,
  type SessionOptions,
  Session,
  destroyTLS,
  initTLS,
} from "node-tls-client";
import {
  jitter,
  mergeHttpHeaderRecords,
  shortUrl,
  sleep,
  withTimeout,
} from "./async-helpers";
import type { IncomingHttpHeaders } from "node:http";
import { PROXY_CONFIG } from "./constants";

/**
 * URL fetch helper built on **node-tls-client** (`Session`): sequential GETs with
 * browser-like TLS fingerprints, optional Evomi residential proxy, retries, and
 * caller-defined response mapping (`string` body → `T`).
 *
 * **`targets` decides TLS session boundaries** (cookie jar + sticky proxy suffix):
 * - **`string[]`** — each URL is its own implicit batch → **new Session per URL**
 *   (max isolation / rotation).
 * - **`string[][]`** — each inner array is one batch → **one Session shared**
 *   across those URLs (cookies + `_session-{id}` sticky on Evomi for the batch).
 *
 * **Return value:** always a **flat `T[]`** of **successful** rows only, in batch
 * order then URL order inside each batch. HTTP 401/403/404 are skipped without
 * throwing; other failures exhaust retries then omit (same spirit as the old
 * Impit helper). Use **`mapper`** for HTML vs JSON; default mapper `JSON.parse`s.
 *
 * **Proxy:** `useProxy` defaults to whether Evomi env vars in `PROXY_CONFIG`
 * resolve. Password suffix `_session-{random}` pins residential sessions per
 * batch/retry (see `buildEvomiProxyUrl`). **`proxyCountry`** exists on options for
 * future Evomi geography routing but is **currently ignored** (app country labels
 * ≠ Evomi codes).
 *
 * **Lifecycle:** **`initTLS()`** / **`destroyTLS()`** run lazily in this module
 * on first fetch and on process shutdown (after TLS was used). Consumers include
 * Instagram / LinkedIn batch fetchers; multi-step scrapers (e.g. Google Maps PSI
 * + pagination) use `createUrlFetchSession` per caller batch.
 */

export type FetchUrlsMapperCtx = { url: string; batchIndex: number };

/** Baseline merged under caller headers (HTML navigation / XHR overrides). */
export const DEFAULT_HTML_HEADERS: Record<string, string> = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  "upgrade-insecure-requests": "1",
  referer: "https://www.google.com/",
};

export type FetchUrlsOptions<T = unknown> = {
  /** Flat list = one TLS session per URL; nested = one session per inner array. */
  targets: readonly string[] | readonly (readonly string[])[];
  headers?: Record<string, string>;
  mapper?: (body: string, ctx: FetchUrlsMapperCtx) => T;
  clientIdentifier?: ClientIdentifier;
  /** Default: true when Evomi env creds resolve; false otherwise */
  useProxy?: boolean;
  /**
   * Reserved for future Evomi geography routing. Currently ignored — we do not
   * append `_country-*` (app locale strings differ from Evomi’s supported codes).
   */
  proxyCountry?: string;
};

export const DEFAULT_TLS_FETCH_CLIENT_IDENTIFIER = ClientIdentifier.chrome_131;

export const fetchUrlPresets = {
  oneBatch(
    urls: string[],
    extra?: Partial<Omit<FetchUrlsOptions<unknown>, "targets">>,
  ): FetchUrlsOptions<unknown> {
    return {
      targets: [urls],
      useProxy: true,
      ...extra,
    };
  },

  direct(urls: string[]): FetchUrlsOptions<unknown> {
    return {
      targets: urls,
      useProxy: false,
    };
  },
};

const INTER_REQUEST_GAP_MS = 600;
export const FETCH_URLS_REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES_PER_URL = 3;
const RETRY_BASE_DELAY_MS = 1_000;

let tlsInitialized = false;
let tlsInitPromise: Promise<void> | null = null;
let tlsShutdownRegistered = false;

/** Lazy, once-only `initTLS()` — safe under concurrent first requests. */
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

/** `destroyTLS()` only when this module initialized the Go binary. */
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

function dedupeUrlsInBatch(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const u = raw.trim();
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function evomiConfigured(): boolean {
  const { USERNAME, PASSWORD, HOSTNAME, PORT } = PROXY_CONFIG;
  return !!(USERNAME && PASSWORD && HOSTNAME && PORT);
}

/**
 * Builds Evomi proxy URL: password `{BASE}_session-{id}` when `sessionId` is set.
 * (Country suffix intentionally omitted until we map app locales → Evomi codes.)
 */
export function buildEvomiProxyUrl(parts: {
  sessionId?: string | undefined;
}): string | undefined {
  const { PROTOCOL, HOSTNAME, PORT, USERNAME, PASSWORD } = PROXY_CONFIG;
  if (!USERNAME || !PASSWORD || !HOSTNAME || !PORT) return undefined;

  let pwd = PASSWORD;
  if (parts.sessionId?.trim()) pwd = `${pwd}_session-${parts.sessionId.trim()}`;

  const url = new URL(`${PROTOCOL}://${HOSTNAME}:${String(PORT)}`);
  url.username = USERNAME;
  url.password = pwd;
  return url.href.replace(/\/$/, "");
}

/**
 * Normalize flat URLs to one-batch-per-URL sessions; nested input is caller batches.
 */
export function toFetchBatches(
  targets: readonly string[] | readonly (readonly string[])[],
): string[][] {
  if (targets.length === 0) return [];

  const first = targets[0] as unknown;
  if (typeof first === "string") {
    return (targets as readonly string[]).map((url) => [url]);
  }
  return (targets as readonly (readonly string[])[]).map((batch) => [...batch]);
}

function retryAfterMs(headers: IncomingHttpHeaders): number | undefined {
  const raw = headers["retry-after"];
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s || typeof s !== "string") return undefined;
  const sec = parseInt(s, 10);
  if (Number.isFinite(sec) && sec > 0) return sec * 1_000;
  return undefined;
}

function shouldRetryHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function shouldSkipHttpStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

function isTlsTunnelError(message: string): boolean {
  return /TunnelUnsuccessful|Failed to connect to the server|proxy|EPIPE/i.test(
    message,
  );
}

type ExecSession = InstanceType<typeof Session>;

/** Sequential GET driver — see module docblock above for `targets`, batches, and return semantics. */
export async function fetchUrls<T = unknown>(
  options: FetchUrlsOptions<T>,
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

    /** New Evomi sticky id per TLS batch (caller batch or single-URL pseudo-batch). */
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
              session!.get(url, {}),
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
              const wait = isTlsTunnelError(lastError.message)
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
