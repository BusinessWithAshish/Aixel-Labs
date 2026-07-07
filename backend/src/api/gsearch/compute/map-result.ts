import { GSEARCH_FORMATTED_URL_HIGHLIGHT_PATTERN } from "../constants";
import type {
  GSEARCH_RAW_CSE_RESULT,
  GSEARCH_RAW_METATAGS,
  GSEARCH_RESULT,
} from "../types";

const firstDefined = (...vals: (string | undefined)[]): string | null => {
  for (const v of vals) if (v && v.trim()) return v.trim();
  return null;
};

/** Map one raw CSE result row into our enriched web-result shape. */
export function mapCseResult(
  row: GSEARCH_RAW_CSE_RESULT,
  index: number,
): GSEARCH_RESULT {
  const rich = row.richSnippet ?? {};
  const meta: GSEARCH_RAW_METATAGS = rich.metatags ?? {};
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
    formattedUrl:
      row.formattedUrl?.replace(GSEARCH_FORMATTED_URL_HIGHLIGHT_PATTERN, "") ??
      null,
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
