import { GSEARCH_TIME_FILTER, GSEARCH_TIME_FILTER_DAYS } from "./constants";
import type { GsearchResult } from "./types";

/**
 * Build the query text sent to Google. City/region precision on the CSE endpoint
 * comes from the query text ("<query> in <region>") — `uule`/`near` are ignored
 * by the element API, so we mirror the browser-worker's `${query} in ${city}` trick.
 */
export function buildLocationQuery(
  searchQuery: string,
  region?: string | null,
): string {
  const q = searchQuery.trim();
  const loc = region?.trim();
  if (!loc) return q;
  // Avoid double-appending if the caller already put the location in the query.
  if (q.toLowerCase().includes(loc.toLowerCase())) return q;
  return `${q} in ${loc}`;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Translate a time filter into the CSE `sort` value. The element endpoint has no
 * `tbs`; it uses `sort=date:r:<start>:<end>` (per SearXNG's google_cse engine).
 */
export function buildTimeSort(
  timeFilter: GSEARCH_TIME_FILTER | undefined,
): string | null {
  if (!timeFilter) return null;
  const days = GSEARCH_TIME_FILTER_DAYS[timeFilter];
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return `date:r:${formatDate(start)}:${formatDate(end)}`;
}

type RawMetatags = Record<string, string | undefined> & {
  ogSiteName?: string;
  ogDescription?: string;
  ogImage?: string;
  ogImageSecureUrl?: string;
  twitterImage?: string;
  twitterImageSrc?: string;
  ogType?: string;
  ogLocale?: string;
  articlePublishedTime?: string;
  articlePublished?: string;
  pubDate?: string;
  articleModifiedTime?: string;
  articleModified?: string;
  ogUpdatedTime?: string;
  author?: string;
  articleAuthor?: string;
  newsKeywords?: string;
  articleTag?: string;
  parselyTags?: string;
  twitterCreator?: string;
  twitterSite?: string;
  ogVideoUrl?: string;
  ogVideoSecureUrl?: string;
  ogVideoType?: string;
  ogVideoWidth?: string;
  ogVideoHeight?: string;
};

type RawCseResult = {
  url?: string;
  unescapedUrl?: string;
  visibleUrl?: string;
  formattedUrl?: string;
  clicktrackUrl?: string;
  title?: string;
  titleNoFormatting?: string;
  content?: string;
  contentNoFormatting?: string;
  richSnippet?: {
    cseThumbnail?: { src?: string };
    cseImage?: { src?: string };
    metatags?: RawMetatags;
    person?: { name?: string; url?: string };
    videoobject?: { url?: string; duration?: string };
  };
};

const firstDefined = (...vals: (string | undefined)[]): string | null => {
  for (const v of vals) if (v && v.trim()) return v.trim();
  return null;
};

/** Map one raw CSE result row into our enriched web-result shape. */
export function mapCseResult(row: RawCseResult, index: number): GsearchResult {
  const rich = row.richSnippet ?? {};
  const meta: RawMetatags = rich.metatags ?? {};
  const person = rich.person;

  const authorName = firstDefined(
    person?.name,
    meta.author,
    meta.articleAuthor,
  );
  const author = authorName
    ? { name: authorName, url: person?.url ?? null }
    : null;

  const videoUrl = firstDefined(meta.ogVideoUrl, meta.ogVideoSecureUrl);
  const video = videoUrl
    ? {
        url: meta.ogVideoUrl ?? null,
        secureUrl: meta.ogVideoSecureUrl ?? null,
        type: meta.ogVideoType ?? null,
        width: meta.ogVideoWidth ?? null,
        height: meta.ogVideoHeight ?? null,
      }
    : null;

  return {
    index,
    title: row.titleNoFormatting ?? row.title ?? null,
    url: row.unescapedUrl ?? row.url ?? null,
    displayUrl: row.visibleUrl ?? null,
    formattedUrl: row.formattedUrl?.replace(/<\/?b>/g, "") ?? null,
    snippet: row.contentNoFormatting ?? row.content ?? null,
    thumbnail: rich.cseThumbnail?.src ?? null,
    image: firstDefined(
      rich.cseImage?.src,
      meta.ogImageSecureUrl,
      meta.ogImage,
      meta.twitterImage,
      meta.twitterImageSrc,
    ),
    siteName: meta.ogSiteName ?? null,
    metaDescription: firstDefined(meta.ogDescription, row.contentNoFormatting),
    type: meta.ogType ?? null,
    locale: meta.ogLocale ?? null,
    publishedTime: firstDefined(
      meta.articlePublishedTime,
      meta.articlePublished,
      meta.pubDate,
    ),
    modifiedTime: firstDefined(
      meta.articleModifiedTime,
      meta.articleModified,
      meta.ogUpdatedTime,
    ),
    author,
    keywords: firstDefined(
      meta.newsKeywords,
      meta.articleTag,
      meta.parselyTags,
    ),
    twitterHandle: firstDefined(meta.twitterCreator, meta.twitterSite),
    video,
    clickUrl: row.clicktrackUrl ?? null,
  };
}

/** Strip the `/*O_o*\/\n_(...)` JSONP wrapper and parse the inner JSON. */
export function parseJsonp(body: string): Record<string, unknown> {
  const first = body.indexOf("{");
  const last = body.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("CSE element: no JSON object in JSONP response");
  }
  return JSON.parse(body.slice(first, last + 1)) as Record<string, unknown>;
}

/** Parse the trailing `({...})` options blob from `cse.js`. */
export function parseCseJsToken(body: string): {
  cse_token?: string;
  cselibVersion?: string;
  exp?: string[];
} {
  const start = body.lastIndexOf("({");
  const end = body.lastIndexOf("});");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("cse.js: could not locate options blob");
  }
  return JSON.parse(body.slice(start + 1, end + 1));
}
