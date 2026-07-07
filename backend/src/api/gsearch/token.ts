import {
  GSEARCH_CSE_ELEMENT_URL,
  GSEARCH_CSE_JS_URL,
  GSEARCH_PAGE_SIZE,
  GSEARCH_TOKEN_TTL_MS,
} from "./constants";
import { parseCseJsToken } from "./compute";
import { gsearchProxiedGet } from "./http";
import type { GSEARCH_TOKEN } from "./types";

// Token is tied to `cx` (not IP-bound) and valid ~1h — cache per cx.
const tokenCache = new Map<string, GSEARCH_TOKEN>();

export async function fetchGsearchToken(
  cx: string,
  proxyUrl: string,
): Promise<GSEARCH_TOKEN> {
  const cached = tokenCache.get(cx);
  if (cached && Date.now() - cached.fetchedAt < GSEARCH_TOKEN_TTL_MS) {
    return cached;
  }

  const { status, body } = await gsearchProxiedGet(GSEARCH_CSE_JS_URL(cx), {
    proxyUrl,
  });
  if (status !== 200) throw new Error(`cse.js fetch failed: HTTP ${status}`);

  const opts = parseCseJsToken(body);
  if (!opts.cse_token) throw new Error("cse.js: cse_token missing");

  const token: GSEARCH_TOKEN = {
    cseToken: opts.cse_token,
    cselibVersion: opts.cselibVersion ?? "",
    exp: Array.isArray(opts.exp) ? opts.exp : [],
    fetchedAt: Date.now(),
  };
  tokenCache.set(cx, token);
  return token;
}

export function buildGsearchSearchUrl(params: {
  cx: string;
  token: GSEARCH_TOKEN;
  query: string;
  language: string;
  country: string;
  safe: string;
  start: number;
  sort: string | null;
}): string {
  const sp = new URLSearchParams({
    rsz: "filtered_cse",
    num: String(GSEARCH_PAGE_SIZE),
    hl: params.language,
    cselibv: params.token.cselibVersion,
    cx: params.cx,
    q: params.query,
    safe: params.safe,
    cse_tok: params.token.cseToken,
    callback: "_",
    rurl: "",
    searchtype: "",
    gl: params.country,
  });
  if (params.token.exp.length) sp.set("exp", params.token.exp.join(","));
  if (params.sort) sp.set("sort", params.sort);
  if (params.start > 0) sp.set("start", String(params.start));
  return `${GSEARCH_CSE_ELEMENT_URL}?${sp.toString()}`;
}
