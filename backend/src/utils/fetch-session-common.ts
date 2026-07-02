import {
  jitter,
  mergeHttpHeaderRecords,
  shortUrl,
  sleep,
} from "./async-helpers";
import { PROXY_CONFIG } from "./constants";

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
  /** Flat list = one session per URL; nested = one session per inner array. */
  targets: readonly string[] | readonly (readonly string[])[];
  headers?: Record<string, string>;
  mapper?: (body: string, ctx: FetchUrlsMapperCtx) => T;
  /** Default: true when Evomi env creds resolve; false otherwise */
  useProxy?: boolean;
  /**
   * ISO 3166-1 alpha-2 code for Evomi `_country-XX` proxy routing.
   * When set, appended to the proxy password (see `buildEvomiProxyUrl`).
   */
  proxyCountry?: string;
  /** Optional region for Evomi `_region-*` proxy routing (not sent to YouTube). */
  proxyRegion?: string;
};

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

export const INTER_REQUEST_GAP_MS = 600;
export const FETCH_URLS_REQUEST_TIMEOUT_MS = 15_000;
export const MAX_RETRIES_PER_URL = 3;
export const RETRY_BASE_DELAY_MS = 1_000;

export function shouldDebugProxy(): boolean {
  return process.env.FETCH_URLS_DEBUG_PROXY?.trim() === "1";
}

export function proxyDebugLine(
  engine: "tls" | "impit",
  sessionSuffix: string,
  enabled: boolean,
): string {
  const host = PROXY_CONFIG.HOSTNAME;
  const port = PROXY_CONFIG.PORT;
  return `[${engine}] proxy=${enabled ? "on" : "off"} host=${host}:${String(
    port,
  )} sessionSuffix=${sessionSuffix}`;
}

export function dedupeUrlsInBatch(urls: readonly string[]): string[] {
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

export function evomiConfigured(): boolean {
  const { USERNAME, PASSWORD, HOSTNAME, PORT } = PROXY_CONFIG;
  return !!(USERNAME && PASSWORD && HOSTNAME && PORT);
}

/**
 * Builds Evomi proxy URL: password `{BASE}_session-{id}` when `sessionId` is set,
 * `{BASE}_country-{CC}` when `countryCode` is set, `{BASE}_region-{name}` when `region` is set.
 */
export function buildEvomiProxyUrl(parts: {
  sessionId?: string | undefined;
  countryCode?: string | undefined;
  region?: string | undefined;
}): string | undefined {
  const { PROTOCOL, HOSTNAME, PORT, USERNAME, PASSWORD } = PROXY_CONFIG;
  if (!USERNAME || !PASSWORD || !HOSTNAME || !PORT) return undefined;

  let pwd = PASSWORD;
  if (parts.sessionId?.trim()) pwd = `${pwd}_session-${parts.sessionId.trim()}`;
  if (parts.countryCode?.trim()) {
    pwd = `${pwd}_country-${parts.countryCode.trim().toUpperCase()}`;
  }
  if (parts.region?.trim()) {
    const normalizedRegion = parts.region
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "");
    if (normalizedRegion) pwd = `${pwd}_region-${normalizedRegion}`;
  }

  const url = new URL(`${PROTOCOL}://${HOSTNAME}:${String(PORT)}`);
  url.username = USERNAME;
  url.password = pwd;
  return url.href.replace(/\/$/, "");
}

/** Normalize flat URLs to one-batch-per-URL sessions; nested input is caller batches. */
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

export function shouldRetryHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function shouldSkipHttpStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

export function isProxyTunnelError(message: string): boolean {
  return /TunnelUnsuccessful|Failed to connect to the server|proxy|EPIPE/i.test(
    message,
  );
}

export { jitter, mergeHttpHeaderRecords, shortUrl, sleep };
