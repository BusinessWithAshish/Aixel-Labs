import type { GSEARCH_RESULT } from "../../types";
import type { GSEARCH_V2_KNOWLEDGE_GRAPH } from "../types";

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const asNumber = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function displayHostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function isoFromUnix(ts: number): string | null {
  if (!Number.isFinite(ts) || ts <= 0) return null;
  // Docs Explore sometimes returns seconds, sometimes ms.
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Organic row: `[["url","title","snippet"], date?]` or nested timestamp variants. */
export function isDocsExploreOrganic(item: unknown): boolean {
  if (!Array.isArray(item) || item.length === 0) return false;
  const head = item[0];
  if (!Array.isArray(head) || head.length < 3) return false;
  return typeof head[0] === "string" && /^https?:\/\//i.test(head[0]);
}

/** KG card: `[null|"…", [kgmid, [title,type], [desc, source], image?, attrs?]]` */
export function isDocsExploreKnowledgeGraph(item: unknown): boolean {
  if (!Array.isArray(item) || item.length < 2) return false;
  if (isDocsExploreOrganic(item)) return false;
  const payload = item[1];
  if (!Array.isArray(payload) || payload.length < 2) return false;
  const kgmid = payload[0];
  return typeof kgmid === "string" && (kgmid.startsWith("/m/") || kgmid.startsWith("/g/"));
}

export function mapDocsExploreOrganic(
  item: unknown,
  index: number,
): GSEARCH_RESULT | null {
  if (!isDocsExploreOrganic(item)) return null;
  const row = item as unknown[];
  const head = row[0] as unknown[];
  const url = asString(head[0]);
  if (!url) return null;

  let publishedTime: string | null = null;
  // Timestamp inside head: `["url","title","snippet", [unix]]` or bare unix
  if (Array.isArray(head[3]) && typeof head[3][0] === "number") {
    publishedTime = isoFromUnix(head[3][0]);
  } else if (typeof head[3] === "number") {
    publishedTime = isoFromUnix(head[3]);
  }
  // Sibling date field
  if (!publishedTime && typeof row[1] === "number") {
    publishedTime = isoFromUnix(row[1]);
  } else if (!publishedTime && Array.isArray(row[1]) && typeof row[1][0] === "number") {
    publishedTime = isoFromUnix(row[1][0]);
  } else if (!publishedTime && typeof row[1] === "string") {
    publishedTime = asString(row[1]);
  }

  const title = asString(head[1]);
  const snippet = asString(head[2]);
  const displayUrl = displayHostFromUrl(url);

  return {
    id: url,
    index,
    title,
    url,
    displayUrl,
    formattedUrl: displayUrl,
    snippet,
    thumbnail: null,
    image: null,
    siteName: null,
    metaDescription: snippet,
    type: null,
    locale: null,
    publishedTime,
    modifiedTime: null,
    author: null,
    keywords: null,
    twitterHandle: null,
    video: null,
    clickUrl: null,
  };
}

export function mapDocsExploreKnowledgeGraph(
  item: unknown,
): GSEARCH_V2_KNOWLEDGE_GRAPH | null {
  if (!isDocsExploreKnowledgeGraph(item)) return null;
  const payload = (item as unknown[])[1] as unknown[];

  const kgmid = asString(payload[0]);
  const titleType = Array.isArray(payload[1]) ? payload[1] : [];
  const title = asString(titleType[0]);
  const type = asString(titleType[1]);

  const descBlock = Array.isArray(payload[2]) ? payload[2] : [];
  const description = asString(descBlock[0]);
  const sourceArr = Array.isArray(descBlock[1]) ? descBlock[1] : [];
  const descriptionSource =
    sourceArr.length > 0
      ? { url: asString(sourceArr[0]), name: asString(sourceArr[1]) }
      : null;

  const imageBlock = Array.isArray(payload[3]) ? payload[3] : null;
  const image = imageBlock
    ? {
        url: asString(imageBlock[0]),
        width: asNumber(imageBlock[1]),
        height: asNumber(imageBlock[2]),
        sourceUrl: asString(imageBlock[3]),
      }
    : null;

  let attributes: Record<string, string> | null = null;
  const attrsBlock = payload[4];
  if (Array.isArray(attrsBlock)) {
    attributes = {};
    for (const entry of attrsBlock) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const label = asString(entry[0]);
      if (!label) continue;
      const values = Array.isArray(entry[1])
        ? entry[1].map(asString).filter((v): v is string => Boolean(v))
        : [asString(entry[1])].filter((v): v is string => Boolean(v));
      if (values.length) attributes[label] = values.join(", ");
    }
    if (Object.keys(attributes).length === 0) attributes = null;
  }

  return {
    kgmid,
    title,
    type,
    description,
    descriptionSource,
    image,
    attributes,
  };
}

/** Split Docs Explore item list into KG (first, if present) + organic results. */
export function mapDocsExploreItems(
  items: unknown[],
  startIndex: number,
): {
  knowledgeGraph: GSEARCH_V2_KNOWLEDGE_GRAPH | null;
  results: GSEARCH_RESULT[];
} {
  let knowledgeGraph: GSEARCH_V2_KNOWLEDGE_GRAPH | null = null;
  const results: GSEARCH_RESULT[] = [];
  let index = startIndex;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i === 0 && isDocsExploreKnowledgeGraph(item)) {
      knowledgeGraph = mapDocsExploreKnowledgeGraph(item);
      continue;
    }
    // Null / empty first slot when no KG
    if (i === 0 && (item == null || (Array.isArray(item) && item.length === 0))) {
      continue;
    }
    const mapped = mapDocsExploreOrganic(item, index);
    if (mapped) {
      results.push(mapped);
      index++;
    }
  }

  return { knowledgeGraph, results };
}
