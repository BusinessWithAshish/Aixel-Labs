import {
  GSEARCH_V2_PAGE_OFFSET_STEP,
  GSEARCH_V2_PAGE_SIZE,
  GSEARCH_V2_XSSI_PREFIX,
} from "../constants";

/** page 1 → `CAA=`, page 2 → `CBQ=`, … (protobuf-ish `\x08` + offset). */
export function docsExplorePaginationToken(page: number): string {
  const offset = Math.max(0, page - 1) * GSEARCH_V2_PAGE_OFFSET_STEP;
  return Buffer.from([0x08, offset & 0xff]).toString("base64");
}

/**
 * Form body for Docs Explore.
 * `["documentsuggest.search.search_request", query, [count, token], [hl,lr]|null, 1]`
 */
export function buildDocsExploreRequestBody(
  query: string,
  page: number,
  hl?: string,
  lr?: string,
): string {
  const lang = hl?.trim()
    ? ([hl.trim(), (lr ?? hl).trim()] as [string, string])
    : null;
  const body = [
    "documentsuggest.search.search_request",
    query,
    [GSEARCH_V2_PAGE_SIZE, docsExplorePaginationToken(page)],
    lang,
    1,
  ];
  return `request=${encodeURIComponent(JSON.stringify(body))}`;
}

/** Strip XSSI `)]}'` prefix (with optional whitespace/newlines). */
export function stripXssiPrefix(body: string): string {
  const trimmed = body.trimStart();
  if (trimmed.startsWith(GSEARCH_V2_XSSI_PREFIX)) {
    return trimmed.slice(GSEARCH_V2_XSSI_PREFIX.length).trimStart();
  }
  return trimmed;
}

export function parseDocsExploreJson(body: string): unknown {
  return JSON.parse(stripXssiPrefix(body));
}

/**
 * Response shape:
 * `[["documentsuggest.search.search_response", [KG?, ...organics], nextToken?], …]`
 */
export function extractDocsExplorePayload(raw: unknown): {
  items: unknown[];
  nextToken: string | null;
} {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { items: [], nextToken: null };
  }
  const outer = raw[0];
  if (!Array.isArray(outer) || outer.length < 2) {
    return { items: [], nextToken: null };
  }
  const items = Array.isArray(outer[1]) ? (outer[1] as unknown[]) : [];
  const nextToken =
    typeof outer[2] === "string" && outer[2].length > 0 ? outer[2] : null;
  return { items, nextToken };
}
