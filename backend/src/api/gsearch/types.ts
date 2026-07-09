import type { z } from "zod";

import type { GSEARCH_REQUEST_SCHEMA } from "./schemas";

export type GSEARCH_REQUEST = z.infer<typeof GSEARCH_REQUEST_SCHEMA>;

/** Short-lived token pair required by the CSE element endpoint. */
export type GSEARCH_TOKEN = {
  cseToken: string;
  cselibVersion: string;
  exp: string[];
  fetchedAt: number;
};

/** OpenGraph video block (present on YouTube/video results). */
export type GSEARCH_VIDEO = {
  url: string | null;
  secureUrl: string | null;
  type: string | null;
  width: string | null;
  height: string | null;
};

/** Author/creator extracted from schema.org `person` or article meta. */
export type GSEARCH_AUTHOR = {
  name: string | null;
  url: string | null;
};

/**
 * A single organic web result. Superset of the browser-worker's
 * `{ url, title, snippet, index }`, enriched with CSE richSnippet metadata.
 */
export type GSEARCH_RESULT = {
  /** 1-based position across all requested pages. */
  index: number;
  title: string | null;
  url: string | null;
  /** Display host, e.g. `reliantplumbing.com`. */
  displayUrl: string | null;
  /** Google's formatted URL (with query-highlight markup stripped). */
  formattedUrl: string | null;
  snippet: string | null;
  /** Small gstatic thumbnail (`richSnippet.cseThumbnail`). */
  thumbnail: string | null;
  /** Larger source image (`cseImage` → og:image → twitter:image). */
  image: string | null;
  /** OpenGraph site name (`metatags.ogSiteName`). */
  siteName: string | null;
  /** OpenGraph/meta description (falls back to snippet). */
  metaDescription: string | null;
  /** Content type / og:type (e.g. `article`, `website`, `video.other`). */
  type: string | null;
  /** BCP-47 locale from `og:locale` (e.g. `en_US`). */
  locale: string | null;
  /** ISO publish time (`article:published_time` / `pubdate`). */
  publishedTime: string | null;
  /** ISO modified time (`article:modified_time` / `og:updated_time`). */
  modifiedTime: string | null;
  /** Article author / schema.org person. */
  author: GSEARCH_AUTHOR | null;
  /** Comma-joined keywords/tags from `news_keywords` / `article:tag`. */
  keywords: string | null;
  /** Twitter handle (`twitter:site` / `twitter:creator`). */
  twitterHandle: string | null;
  /** Video block for video results (YouTube etc.). */
  video: GSEARCH_VIDEO | null;
  /** Google click-tracking redirect URL. */
  clickUrl: string | null;
};

export type GSEARCH_RESPONSE = {
  query: string;
  /** Query actually sent to Google (with location appended when city/state set). */
  resolvedQuery: string;
  country: string;
  /** City / locality passed as `region`. */
  region: string | null;
  state: string | null;
  language: string;
  /** Google's estimated total result count (string as returned). */
  estimatedResultCount: string | null;
  pagesFetched: number;
  results: GSEARCH_RESULT[];
};

// ─── Raw CSE payload shapes (internal) ───────────────────────────────────────

export type GSEARCH_RAW_METATAGS = Record<string, string | undefined> & {
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

export type GSEARCH_RAW_CSE_RESULT = {
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
    metatags?: GSEARCH_RAW_METATAGS;
    person?: { name?: string; url?: string };
    videoobject?: { url?: string; duration?: string };
  };
};

export type GSEARCH_CSE_JS_OPTIONS = {
  cse_token?: string;
  cselibVersion?: string;
  exp?: string[];
};
