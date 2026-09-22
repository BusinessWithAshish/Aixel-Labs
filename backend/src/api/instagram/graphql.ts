import { randomBytes } from "crypto";

import {
  closeUrlFetchSession,
  createUrlFetchSession,
} from "../../utils/node-tls-client-session-handler";
import {
  RETRY_BASE_DELAY_MS,
  evomiConfigured,
  jitter,
  sleep,
} from "../../utils/fetch-session-common";
import type { IgFeedItem } from "./advanced/types";
import {
  IG_DOC_ID_DISCOVERY_USERNAME,
  IG_GRAPHQL_HEADERS,
  IG_GRAPHQL_URL,
  IG_LOGGED_OUT_QUERIES,
  IG_PAGE_HEADERS,
  INSTAGRAM_BASE_URL,
  INSTAGRAM_ERROR_MESSAGES,
} from "./constants";
import { IG_CRAWLER_HEADERS } from "./download/constants";

export type IgLoggedOutQuery = keyof typeof IG_LOGGED_OUT_QUERIES;

type GraphqlBody = {
  data?: Record<string, unknown> | null;
  errors?: Array<{ message?: string }>;
};

/** Doc ids read off live pages after a rotation; the constants are the fallback. */
const discoveredDocIds: Partial<Record<IgLoggedOutQuery, string>> = {};
let rediscovery: Promise<void> | null = null;
let lastRediscoveryAt = 0;
let lastBundleScanAt = 0;
const REDISCOVERY_COOLDOWN_MS = 10 * 60_000;
/** A bundle scan reads ~50 MB of JS — at most one per window. */
const BUNDLE_SCAN_COOLDOWN_MS = 6 * 60 * 60_000;
const BUNDLE_SCAN_CONCURRENCY = 8;

const STALE_DOC_ID_RE = /GraphQL document with ID \d+ was not found/i;
/** How Instagram says an entity doesn't exist — any other error is a failure. */
const NOT_FOUND_RE = /field_exception/;
const PRELOADER_RE =
  /"queryID":"(\d+)","variables":\{[^}]*\},"queryName":"(\w+)"/g;
const JS_BUNDLE_RE =
  /https:\\?\/\\?\/static\.cdninstagram\.com\\?\/rsrc\.php\\?\/[^"\s]+?\.js/g;
const RELAY_OPERATION_RE =
  /__d\("(\w+)_instagramRelayOperation",\[\],\(function\([^)]*\)\{\w\.exports="(\d+)"/g;

function docIdFor(query: IgLoggedOutQuery): string {
  return discoveredDocIds[query] ?? IG_LOGGED_OUT_QUERIES[query].docId;
}

async function postQuery(
  query: IgLoggedOutQuery,
  variables: Record<string, unknown>,
  useProxy: boolean,
): Promise<GraphqlBody> {
  const session = await createUrlFetchSession({
    useProxy,
    ...(useProxy ? { proxyCountry: "US" } : {}),
  });
  try {
    // Any value is accepted — it only has to be present as both the form
    // field and the `x-fb-lsd` header.
    const lsd = `AV${randomBytes(8).toString("base64url")}`;
    const { name } = IG_LOGGED_OUT_QUERIES[query];
    const body = new URLSearchParams({
      av: "0",
      __d: "www",
      __user: "0",
      __a: "1",
      __comet_req: "7",
      lsd,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: name,
      variables: JSON.stringify(variables),
      server_timestamps: "true",
      doc_id: docIdFor(query),
    });
    const res = await session.post(IG_GRAPHQL_URL, {
      body: body.toString(),
      followRedirects: false,
      headers: {
        ...IG_GRAPHQL_HEADERS,
        "x-fb-lsd": lsd,
        "x-fb-friendly-name": name,
      },
    });
    const text = await res.text();
    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
    }
    try {
      return JSON.parse(text) as GraphqlBody;
    } catch {
      throw new Error(`non-JSON body: ${text.slice(0, 160)}`);
    }
  } finally {
    await closeUrlFetchSession(session);
  }
}

/**
 * A page carrying `expectedPreloaders`, or "" — one retry on a fresh session
 * (a new exit IP when proxied), since a rate-limited exit gets a login page.
 */
async function fetchPreloaderPage(url: string, useProxy: boolean): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await createUrlFetchSession({
      useProxy,
      ...(useProxy ? { proxyCountry: "US" } : {}),
    });
    try {
      const res = await session.get(url, {
        followRedirects: true,
        headers: useProxy ? IG_PAGE_HEADERS : IG_CRAWLER_HEADERS,
      });
      const html = await res.text();
      if (html.includes('"queryID":"')) return html;
    } catch {
      /* next attempt */
    } finally {
      await closeUrlFetchSession(session);
    }
  }
  return "";
}

/**
 * Doc ids for `names`, read from the JS bundles the given pages load (each
 * bundle defines `{name}_instagramRelayOperation` with the id inline). For
 * queries no logged-out page preloads. Bundles come direct from the static
 * CDN; the scan stops as soon as every name is found.
 */
async function scanBundlesForDocIds(
  pages: string[],
  names: string[],
): Promise<Record<string, string>> {
  const urls = [
    ...new Set(
      pages.flatMap((html) =>
        [...html.matchAll(JS_BUNDLE_RE)].map((m) => m[0].replace(/\\\//g, "/")),
      ),
    ),
  ];
  const wanted = new Set(names);
  const found: Record<string, string> = {};
  const session = await createUrlFetchSession({ useProxy: false });
  let next = 0;
  try {
    await Promise.all(
      Array.from({ length: BUNDLE_SCAN_CONCURRENCY }, async () => {
        while (next < urls.length && wanted.size > 0) {
          const url = urls[next++]!;
          const js = await session
            .get(url, { followRedirects: true })
            .then((r) => r.text())
            .catch(() => "");
          for (const [, name, id] of js.matchAll(RELAY_OPERATION_RE)) {
            if (!wanted.delete(name!)) continue;
            found[name!] = id!;
          }
        }
      }),
    );
  } finally {
    await closeUrlFetchSession(session);
  }
  return found;
}

/**
 * Re-reads the current doc ids from the pages that preload each query.
 * Profile pages redirect this VPS to the login page, so those go through the
 * proxy; a post page is served direct to a crawler UA. A query no page
 * preloads (`profilePage`) is then looked up in those pages' JS bundles. One
 * refresh at a time, and at most one per cooldown, so a burst of stale calls
 * costs one pass.
 */
async function rediscoverDocIds(stale: IgLoggedOutQuery): Promise<void> {
  if (Date.now() - lastRediscoveryAt < REDISCOVERY_COOLDOWN_MS) return;
  rediscovery ??= (async () => {
    const proxied = evomiConfigured();
    const profileUrl = `${INSTAGRAM_BASE_URL}/${IG_DOC_ID_DISCOVERY_USERNAME}/`;
    const [profileHtml, reelsHtml] = await Promise.all([
      fetchPreloaderPage(profileUrl, proxied),
      fetchPreloaderPage(`${profileUrl}reels/`, proxied),
    ]);
    const code = `${profileHtml}${reelsHtml}`.match(
      /"code":"([A-Za-z0-9_-]{8,})"/,
    )?.[1];
    const postHtml = code
      ? await fetchPreloaderPage(`${INSTAGRAM_BASE_URL}/p/${code}/`, false)
      : "";
    const pages = [profileHtml, reelsHtml, postHtml];
    const found: Partial<Record<IgLoggedOutQuery, string>> = {};
    for (const html of pages) {
      for (const [, id, name] of html.matchAll(PRELOADER_RE)) {
        for (const [key, q] of Object.entries(IG_LOGGED_OUT_QUERIES)) {
          if (q.name === name) found[key as IgLoggedOutQuery] = id!;
        }
      }
    }
    if (
      !found[stale] &&
      Date.now() - lastBundleScanAt >= BUNDLE_SCAN_COOLDOWN_MS
    ) {
      lastBundleScanAt = Date.now();
      const { name } = IG_LOGGED_OUT_QUERIES[stale];
      const id = (await scanBundlesForDocIds(pages, [name]))[name];
      if (id) found[stale] = id;
    }
    Object.assign(discoveredDocIds, found);
    lastRediscoveryAt = Date.now();
    const summary = Object.entries(found).map(([k, v]) => `${k}=${v}`);
    console.log(
      `[instagram] doc id rediscovery (${stale} stale): ${summary.join(", ") || "nothing found"}`,
    );
  })().finally(() => {
    rediscovery = null;
  });
  await rediscovery;
}

/**
 * Runs one logged-out query and returns its `data`, or `null` when Instagram
 * says the entity doesn't exist (a null root that comes with a
 * `field_exception` error). Goes direct from this VPS first — `/api/graphql` is not
 * behind the rate limit that sends its profile pages to login — and only then
 * through the Evomi proxy. A stale doc id triggers one rediscovery and a retry.
 * Throws when every route fails.
 */
export async function igLoggedOutQuery<T>(
  query: IgLoggedOutQuery,
  variables: Record<string, unknown>,
): Promise<T | null> {
  const routes = evomiConfigured() ? [false, true] : [false];
  let lastErr: Error | null = null;
  let rediscovered = false;

  for (let i = 0; i < routes.length; i++) {
    try {
      const body = await postQuery(query, variables, routes[i]!);
      const message = body.errors?.[0]?.message ?? "";
      if (STALE_DOC_ID_RE.test(message) && !rediscovered) {
        rediscovered = true;
        await rediscoverDocIds(query);
        i--;
        continue;
      }
      if (body.data && typeof body.data === "object") {
        const root = Object.values(body.data)[0];
        if (root != null) return body.data as T;
        if (NOT_FOUND_RE.test(message)) return null;
      }
      lastErr = new Error(message || "empty data");
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `${INSTAGRAM_ERROR_MESSAGES.GRAPHQL_FAILED} (${query}: ${lastErr?.message ?? "unknown"})`,
  );
}

/**
 * A numeric field (`posts_count`, `video_view_count`, …) from an embed page's
 * escaped `contextJSON`, fetched direct. Embed pages 500 on roughly one fetch
 * in four, so up to 4 attempts on fresh sessions with a growing pause;
 * `null` when the field never shows up.
 */
export async function readEmbedNumber(
  url: string,
  field: string,
): Promise<number | null> {
  const re = new RegExp(`\\\\?"${field}\\\\?":(\\d+)`);
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(RETRY_BASE_DELAY_MS * attempt + jitter(500));
    const session = await createUrlFetchSession({ useProxy: false });
    try {
      const res = await session.get(url, {
        followRedirects: true,
        headers: IG_PAGE_HEADERS,
      });
      const value = (await res.text()).match(re)?.[1];
      if (res.ok && value) return Number(value);
    } catch {
      /* next attempt */
    } finally {
      await closeUrlFetchSession(session);
    }
  }
  return null;
}

type MediaData = {
  xig_polaris_media: { if_not_gated_logged_out?: IgFeedItem | null } | null;
};

/**
 * One post's full logged-out record — likes, comments, `taken_at`, caption,
 * owner, image/video URLs and carousel slides, the same item shape the
 * crawler post page embeds. `null` when the post is gone or gated.
 */
export async function fetchLoggedOutMedia(
  mediaId: string,
): Promise<IgFeedItem | null> {
  const data = await igLoggedOutQuery<MediaData>("media", {
    media_id: mediaId,
  });
  return data?.xig_polaris_media?.if_not_gated_logged_out ?? null;
}
