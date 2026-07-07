import type { GSEARCH_REQUEST_SCHEMA } from "./schemas";
import type { z } from "zod";

export type { GsearchRequest } from "./schemas";

/** Short-lived token pair required by the CSE element endpoint. */
export type GsearchToken = {
  cseToken: string;
  cselibVersion: string;
  exp: string[];
  fetchedAt: number;
};

/** OpenGraph video block (present on YouTube/video results). */
export type GsearchVideo = {
  url: string | null;
  secureUrl: string | null;
  type: string | null;
  width: string | null;
  height: string | null;
};

/** Author/creator extracted from schema.org `person` or article meta. */
export type GsearchAuthor = {
  name: string | null;
  url: string | null;
};

/**
 * A single organic web result. Superset of the browser-worker's
 * `{ url, title, snippet, index }`, enriched with everything useful the CSE
 * endpoint exposes: display/formatted URLs, thumbnail + full-size image,
 * OpenGraph/Twitter metadata, publish/modified dates, author, site, and video.
 */
export type GsearchResult = {
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
  author: GsearchAuthor | null;
  /** Comma-joined keywords/tags from `news_keywords` / `article:tag`. */
  keywords: string | null;
  /** Twitter handle (`twitter:site` / `twitter:creator`). */
  twitterHandle: string | null;
  /** Video block for video results (YouTube etc.). */
  video: GsearchVideo | null;
  /** Google click-tracking redirect URL. */
  clickUrl: string | null;
};

export type GsearchResponse = {
  query: string;
  /** Query actually sent to Google (with location appended when `region` set). */
  resolvedQuery: string;
  country: string;
  region: string | null;
  language: string;
  /** Google's estimated total result count (string as returned). */
  estimatedResultCount: string | null;
  pagesFetched: number;
  results: GsearchResult[];
};

export type GsearchRequestType = z.infer<typeof GSEARCH_REQUEST_SCHEMA>;
