// import { ProxyAgent, fetch as undiciFetch } from "undici";
// import { randomUserAgentGenerator } from "../../utils/stealth-handlers.js";
// import type {
//   InstagramUser,

// } from "@aixellabs/shared/instagram";
// import {INSTAGRAM_RESPONSE} from "./types";

// const fetchText = async (url: string): Promise<string> => {
//   const fetchFn: any = (globalThis as any).fetch;

//   if (typeof fetchFn !== "function") {
//     throw new Error("Global fetch is not available in this runtime.");
//   }

//   const res: any = await fetchFn(url);

//   if (!res || !res.ok) {
//     const status = res?.status ?? "unknown";
//     const statusText = res?.statusText ?? "unknown";
//     throw new Error(`Failed to fetch ${url}: ${status} ${statusText}`);
//   }

//   return await res.text();
// };

// const fetchJson = async <T = unknown>(url: string): Promise<T> => {
//   const fetchFn: any = (globalThis as any).fetch;

//   if (typeof fetchFn !== "function") {
//     throw new Error("Global fetch is not available in this runtime.");
//   }

//   const res: any = await fetchFn(url);

//   if (!res || !res.ok) {
//     const status = res?.status ?? "unknown";
//     const statusText = res?.statusText ?? "unknown";
//     throw new Error(`Failed to fetch ${url}: ${status} ${statusText}`);
//   }

//   return (await res.json()) as T;
// };

// const normalizeProxy = (
//   raw: string,
//   defaultProtocol: string = "http",
// ): string | null => {
//   const line = raw.trim();
//   if (!line) return null;

//   const lower = line.toLowerCase();

//   if (
//     lower.startsWith("http://") ||
//     lower.startsWith("https://") ||
//     lower.startsWith("socks4://") ||
//     lower.startsWith("socks5://")
//   ) {
//     return line;
//   }

//   if (line.includes("://")) {
//     return line;
//   }

//   const parts = line.replace(/\s+/, ":").split(":");
//   if (parts.length < 2) return null;

//   const host = parts[0]?.trim();
//   const portRaw = parts[1]?.trim();
//   if (!host || !portRaw) return null;

//   const port = portRaw.replace(/[^\d]/g, "");
//   if (!port) return null;

//   const proto = defaultProtocol.toLowerCase();
//   return `${proto}://${host}:${port}`;
// };

// const parseProxyListText = (
//   raw: string,
//   defaultProtocol: string = "http",
// ): string[] => {
//   return raw
//     .split(/\r?\n/)
//     .map((line) => line.trim())
//     .filter((line) => line && !line.startsWith("#"))
//     .map((line) => normalizeProxy(line, defaultProtocol))
//     .filter((p): p is string => Boolean(p));
// };

// export type ProviderProxyResult = { proxies: string[]; count: number };

// export const ProxyScrapeProxies = async (): Promise<ProviderProxyResult> => {
//   try {
//     const text = await fetchText(
//       "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text",
//     );
//     const proxies = parseProxyListText(text);
//     return { proxies, count: proxies.length };
//   } catch (error) {
//     console.error("[ProxyScrapeProxies] Failed to fetch proxies:", error);
//     return { proxies: [], count: 0 };
//   }
// };

// type GeonodeProxyRecord = {
//   ip: string;
//   port: number | string;
//   protocols?: string[];
//   latency?: number;
//   responseTime?: number;
// };

// type GeonodeApiResponse = {
//   data?: GeonodeProxyRecord[];
//   total?: number;
//   page?: number;
//   limit?: number;
// };

// const GEONODE_PAGE_LIMIT = 500;
// const GEONODE_MAX_LATENCY_MS = 8_000;

// export const GenodeProxies = async (): Promise<ProviderProxyResult> => {
//   try {
//     const proxies: string[] = [];
//     let page = 1;

//     while (true) {
//       const json = await fetchJson<GeonodeApiResponse>(
//         `https://proxylist.geonode.com/api/proxy-list?limit=${GEONODE_PAGE_LIMIT}&page=${page}&sort_by=lastChecked&sort_type=desc`,
//       );

//       const records = Array.isArray(json?.data) ? json.data : [];

//       const sortedRecords = [...records].sort((a, b) => {
//         const la = (a.latency ?? a.responseTime ?? Number.POSITIVE_INFINITY) as number;
//         const lb = (b.latency ?? b.responseTime ?? Number.POSITIVE_INFINITY) as number;
//         return la - lb;
//       });

//       for (const record of sortedRecords) {
//         if (!record || !record.ip || !record.port) continue;

//         const latency = record.latency ?? record.responseTime;
//         if (latency != null && latency > GEONODE_MAX_LATENCY_MS) continue;

//         const port = String(record.port).trim();
//         const protocols = record.protocols?.length ? record.protocols : ["http"];

//         for (const proto of protocols) {
//           const candidate = `${proto.toLowerCase()}://${record.ip}:${port}`;
//           const normalized = normalizeProxy(candidate, "http");
//           if (normalized) proxies.push(normalized);
//         }
//       }

//       if (records.length < GEONODE_PAGE_LIMIT) break;
//       page++;
//       if (page > 100) break;
//     }

//     return { proxies, count: proxies.length };
//   } catch (error) {
//     console.error("[GenodeProxies] Failed to fetch proxies:", error);
//     return { proxies: [], count: 0 };
//   }
// };

// type NodeMavenProxyRecord = {
//   ip?: string;
//   ip_address?: string;
//   host?: string;
//   port?: number | string;
//   protocol?: string;
//   type?: string;
//   proxy?: string;
//   latency?: number;
// };

// type NodeMavenApiResponse =
//   | NodeMavenProxyRecord[]
//   | {
//       data?: NodeMavenProxyRecord[];
//       proxies?: NodeMavenProxyRecord[];
//       result?: NodeMavenProxyRecord[];
//     };

// const NODEMAVEN_PER_PAGE = 100;

// export const NodeMavenProxies = async (): Promise<ProviderProxyResult> => {
//   try {
//     const proxies: string[] = [];
//     let page = 1;

//     while (true) {
//       const json = await fetchJson<NodeMavenApiResponse>(
//         `https://nodemaven.com/wp-json/proxy-list/v1/proxies?page=${page}&per_page=${NODEMAVEN_PER_PAGE}&country=&protocol=&type=&latency=8000`,
//       );

//       const baseArray = Array.isArray(json)
//         ? json
//         : json && typeof json === "object"
//           ? (json.data ?? json.proxies ?? json.result ?? [])
//           : [];

//       const records = Array.isArray(baseArray) ? baseArray : [];

//       const sortedRecords = [...records].sort((a, b) => {
//         const la = (a.latency ?? Number.POSITIVE_INFINITY) as number;
//         const lb = (b.latency ?? Number.POSITIVE_INFINITY) as number;
//         return la - lb;
//       });

//       for (const record of sortedRecords) {
//         const ip = record.ip ?? record.ip_address ?? record.host;
//         const port = record.port;
//         if (!ip || port === undefined || port === null) continue;

//         const proto = (record.protocol ?? record.type ?? "http").toString();
//         const candidate = `${proto.toLowerCase()}://${ip}:${port}`;
//         const normalized = normalizeProxy(candidate, "http");
//         if (normalized) proxies.push(normalized);
//       }

//       if (records.length < NODEMAVEN_PER_PAGE) break;
//       page++;
//       if (page > 50) break;
//     }

//     return { proxies, count: proxies.length };
//   } catch (error) {
//     console.error("[NodeMavenProxies] Failed to fetch proxies:", error);
//     return { proxies: [], count: 0 };
//   }
// };

// export const GITHUBFreeProxyList = async (): Promise<ProviderProxyResult> => {
//   try {
//     const text = await fetchText(
//       "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@master/proxies/all/data.txt",
//     );
//     const proxies = parseProxyListText(text);
//     return { proxies, count: proxies.length };
//   } catch (error) {
//     console.error("[GITHUBFreeProxyList] Failed to fetch proxies:", error);
//     return { proxies: [], count: 0 };
//   }
// };

// const GITHUB_FRESH_BASE =
//   "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/refs/heads/master";

// export const GITHUBFreshProxyList = async (): Promise<ProviderProxyResult> => {
//   const urls = [
//     { url: `${GITHUB_FRESH_BASE}/proxylist.txt`, defaultProtocol: "http" },
//     { url: `${GITHUB_FRESH_BASE}/http.txt`, defaultProtocol: "http" },
//     { url: `${GITHUB_FRESH_BASE}/socks4.txt`, defaultProtocol: "socks4" },
//     { url: `${GITHUB_FRESH_BASE}/socks5.txt`, defaultProtocol: "socks5" },
//   ];
//   const all: string[] = [];
//   const seen = new Set<string>();

//   for (const { url, defaultProtocol } of urls) {
//     try {
//       const text = await fetchText(url);
//       const list = parseProxyListText(text, defaultProtocol);
//       for (const p of list) {
//         const key = p.toLowerCase();
//         if (!seen.has(key)) { seen.add(key); all.push(p); }
//       }
//     } catch (err) {
//       console.error("[GITHUBFreshProxyList] Failed to fetch", url, err);
//     }
//   }

//   return { proxies: all, count: all.length };
// };

// const GITHUB_SPEEDX_BASE =
//   "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master";

// export const GITHUBSpeedXProxyList = async (): Promise<ProviderProxyResult> => {
//   const urls = [
//     { url: `${GITHUB_SPEEDX_BASE}/http.txt`, defaultProtocol: "http" },
//     { url: `${GITHUB_SPEEDX_BASE}/socks4.txt`, defaultProtocol: "socks4" },
//     { url: `${GITHUB_SPEEDX_BASE}/socks5.txt`, defaultProtocol: "socks5" },
//   ];
//   const all: string[] = [];
//   const seen = new Set<string>();

//   for (const { url, defaultProtocol } of urls) {
//     try {
//       const text = await fetchText(url);
//       const list = parseProxyListText(text, defaultProtocol);
//       for (const p of list) {
//         const key = p.toLowerCase();
//         if (!seen.has(key)) { seen.add(key); all.push(p); }
//       }
//     } catch (err) {
//       console.error("[GITHUBSpeedXProxyList] Failed to fetch", url, err);
//     }
//   }

//   return { proxies: all, count: all.length };
// };

// export type UnifiedProxyProviderGroup = {
//   name: string;
//   proxies: string[];
//   count: number;
// };

// export type UnifiedProxyResult = {
//   proxies: string[];
//   perProvider: { name: string; count: number }[];
//   totalBeforeDedup: number;
//   uniqueCount: number;
//   byProvider: UnifiedProxyProviderGroup[];
// };

// export const UnifiedProxyList = async (): Promise<UnifiedProxyResult> => {
//   const start = Date.now();
//   logStep("Step 1: UnifiedProxyList — fetching from all providers...");

//   const providerNames = [
//     "ProxyScrape", "Genode", "NodeMaven",
//     "GITHUBFreeProxyList", "GITHUBFreshProxyList", "GITHUBSpeedXProxyList",
//   ] as const;

//   const results = await Promise.allSettled([
//     ProxyScrapeProxies(), GenodeProxies(), NodeMavenProxies(),
//     GITHUBFreeProxyList(), GITHUBFreshProxyList(), GITHUBSpeedXProxyList(),
//   ]);

//   const all: string[] = [];
//   const perProvider: { name: string; count: number }[] = [];
//   const byProvider: UnifiedProxyProviderGroup[] = [];
//   const seen = new Set<string>();

//   results.forEach((result, index) => {
//     const name = providerNames[index];
//     if (result.status === "fulfilled") {
//       const { proxies, count } = result.value;
//       perProvider.push({ name, count });
//       logStep(`  provider ${name}: ${count} proxies`);

//       const providerList: string[] = [];
//       for (const proxy of proxies) {
//         const key = proxy.toLowerCase();
//         if (!seen.has(key)) { seen.add(key); all.push(proxy); providerList.push(proxy); }
//       }
//       byProvider.push({ name, proxies: providerList, count });
//     } else {
//       console.error(`${LOG_PREFIX} Provider ${name} failed:`, result.reason);
//       perProvider.push({ name, count: 0 });
//       byProvider.push({ name, proxies: [], count: 0 });
//     }
//   });

//   const totalBeforeDedup = all.length;
//   const unified: string[] = [...all];

//   logStep(
//     "Step 1: UnifiedProxyList — done",
//     ` | total ${unified.length} unique (from ${totalBeforeDedup} raw)`,
//     Date.now() - start,
//   );
//   return { proxies: unified, perProvider, totalBeforeDedup, uniqueCount: unified.length, byProvider };
// };

// // --- Proxy testing and session management ---

// const INSTAGRAM_MAIN_URL = "https://www.instagram.com/";
// const INSTAGRAM_WEB_PROFILE_INFO_URL =
//   "https://www.instagram.com/api/v1/users/web_profile_info/";
// const DELAY_BETWEEN_REQUESTS_MS_MIN = 2_000;
// const DELAY_BETWEEN_REQUESTS_MS_MAX = 5_000;
// const SESSION_ROTATION_DELAY_MS_MIN = 500;
// const SESSION_ROTATION_DELAY_MS_MAX = 2_000;
// const WEB_PROFILE_REQUEST_TIMEOUT_MS = 15_000;
// export const MAX_FAILURE_RETRY_ROUNDS = 3;

// const PROXY_TEST_TIMEOUT_MS = 8_000;
// const PROXY_MAX_RESPONSE_TIME_MS = 10_000;
// const WORTHY_PROXY_MAX_RESPONSE_MS = 5_000;
// const PROXY_BATCH_SIZE = 300;
// const PROXY_CONCURRENCY = 120;

// const LOG_PREFIX = "[IG-Proxy]";

// export function logStep(step: string, detail?: string, elapsedMs?: number): void {
//   const ts = new Date().toISOString();
//   const extra = elapsedMs != null ? ` | elapsed ${(elapsedMs / 1000).toFixed(1)}s` : "";
//   console.log(`${LOG_PREFIX} ${ts} ${step}${detail ?? ""}${extra}`);
// }

// const DEFAULT_USER_AGENT =
//   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// export type ProxyTestResult = {
//   proxy: string;
//   ok: boolean;
//   statusCode: number | null;
//   responseTimeMs: number;
//   headers: Record<string, string>;
//   cookies: Record<string, string>;
//   tokens: { csrfToken?: string; rolloutHash?: string; viewerId?: string };
//   error?: string;
// };

// export type WorkingProxyResult = ProxyTestResult & { ok: true };

// function parseSetCookieHeaders(setCookie: string | string[] | null): Record<string, string> {
//   const out: Record<string, string> = {};
//   if (!setCookie) return out;
//   const list = Array.isArray(setCookie) ? setCookie : [setCookie];
//   for (const raw of list) {
//     const [part] = raw.split(";").map((s) => s.trim());
//     const eq = part.indexOf("=");
//     if (eq <= 0) continue;
//     const name = part.slice(0, eq).trim();
//     const value = part.slice(eq + 1).trim();
//     if (name && out[name] === undefined) out[name] = value;
//   }
//   return out;
// }

// function extractTokensFromInstagramHtml(html: string): WorkingProxyResult["tokens"] {
//   const tokens: WorkingProxyResult["tokens"] = {};
//   try {
//     const csrfMatch = html.match(/"csrf_token":"([^"]+)"/) ?? html.match(/csrf_token["\s:]+([a-zA-Z0-9]+)/);
//     if (csrfMatch?.[1]) tokens.csrfToken = csrfMatch[1];
//     const rolloutMatch = html.match(/"rollout_hash":\s*"([^"]+)"/);
//     if (rolloutMatch?.[1]) tokens.rolloutHash = rolloutMatch[1];
//     const viewerMatch = html.match(/"viewer_id":\s*(\d+)/) ?? html.match(/"viewerId":"(\d+)"/);
//     if (viewerMatch?.[1]) tokens.viewerId = viewerMatch[1];
//   } catch {}
//   return tokens;
// }

// const RELEVANT_HEADERS = [
//   "x-ig-app-id", "x-ig-www-claim", "x-csrftoken", "x-requested-with",
//   "x-asbd-id", "x-ig-connection-type", "x-ig-capabilities", "x-ig-connection-speed",
// ];

// function pickHeaders(res: { headers: { get: (name: string) => string | null } }): Record<string, string> {
//   const out: Record<string, string> = {};
//   for (const name of RELEVANT_HEADERS) {
//     const value = res.headers.get(name) ?? res.headers.get(name.toLowerCase());
//     if (value) out[name] = value;
//   }
//   return out;
// }

// export async function fetchInstagramWithProxy(proxyUrl: string): Promise<ProxyTestResult> {
//   const start = Date.now();
//   const userAgent = randomUserAgentGenerator();
//   const headers: Record<string, string> = {
//     "User-Agent": userAgent,
//     Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
//     "Accept-Language": "en-US,en;q=0.9",
//     "Accept-Encoding": "gzip, deflate, br",
//     "Cache-Control": "no-cache",
//     "Sec-Fetch-Dest": "document",
//     "Sec-Fetch-Mode": "navigate",
//     "Sec-Fetch-Site": "none",
//     "Upgrade-Insecure-Requests": "1",
//   };

//   try {
//     const agent = new ProxyAgent(proxyUrl);
//     const res = await undiciFetch(INSTAGRAM_MAIN_URL, {
//       dispatcher: agent, headers, redirect: "follow",
//       signal: AbortSignal.timeout(PROXY_TEST_TIMEOUT_MS),
//     });
//     const responseTimeMs = Date.now() - start;

//     const resHeaders = (res as any).headers;
//     const setCookie =
//       (typeof resHeaders.getSetCookie === "function" ? resHeaders.getSetCookie() : null) ??
//       resHeaders.get?.("set-cookie") ?? resHeaders["set-cookie"];
//     const cookies = parseSetCookieHeaders(setCookie);
//     const outHeaders = pickHeaders(res as any);
//     if ((res as any).headers.get) {
//       const ua = (res as any).headers.get("user-agent");
//       if (ua) outHeaders["user-agent"] = ua;
//     }

//     const body = await res.text();
//     const tokens = extractTokensFromInstagramHtml(body);

//     const ok = res.status === 200 && responseTimeMs <= PROXY_MAX_RESPONSE_TIME_MS;
//     return { proxy: proxyUrl, ok, statusCode: res.status, responseTimeMs, headers: outHeaders, cookies, tokens };
//   } catch (err) {
//     const responseTimeMs = Date.now() - start;
//     const error = err instanceof Error ? err.message : String(err);
//     return { proxy: proxyUrl, ok: false, statusCode: null, responseTimeMs, headers: {}, cookies: {}, tokens: {}, error };
//   }
// }

// async function runWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
//   const results: R[] = [];
//   let index = 0;
//   async function worker(): Promise<void> {
//     while (index < items.length) {
//       const i = index++;
//       if (i >= items.length) break;
//       const r = await fn(items[i]);
//       results[i] = r;
//     }
//   }
//   const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
//   await Promise.all(workers);
//   return results;
// }

// export type TestProxiesBatchOptions = {
//   batchSize?: number;
//   concurrency?: number;
//   maxResponseTimeMs?: number;
// };

// export async function testProxiesBatch(
//   proxyList: string[],
//   options: TestProxiesBatchOptions = {},
// ): Promise<WorkingProxyResult[]> {
//   const {
//     batchSize = PROXY_BATCH_SIZE,
//     concurrency = PROXY_CONCURRENCY,
//     maxResponseTimeMs = PROXY_MAX_RESPONSE_TIME_MS,
//   } = options;

//   const batch = proxyList.slice(0, batchSize);
//   const batchStart = Date.now();
//   logStep(`  batch: testing ${batch.length} proxies (concurrency ${concurrency}, maxResponseTimeMs ${maxResponseTimeMs})...`);

//   const results = await runWithConcurrency(batch, concurrency, fetchInstagramWithProxy);

//   const working: WorkingProxyResult[] = [];
//   for (const r of results) {
//     if (r.ok && r.statusCode === 200 && r.responseTimeMs <= maxResponseTimeMs) {
//       working.push(r as WorkingProxyResult);
//     }
//   }

//   const elapsed = Date.now() - batchStart;
//   logStep(`  batch: done`, ` | ${working.length}/${batch.length} working in ${(elapsed / 1000).toFixed(1)}s`, elapsed);
//   return working;
// }

// export type InstagramProxySession = {
//   proxy: string;
//   userAgent: string;
//   proxyResponseTimeMs: number;
//   targetUrlResponseTimeMs: number;
//   targetUrlInfo: Record<string, any>;
// };

// export const POOL_TARGET_RATIO = 0.35;
// const POOL_BATCH_SIZE_MIN = 100;
// const POOL_BATCH_SIZE_MAX = 500;
// const POOL_WORTHY_MAX_MS = WORTHY_PROXY_MAX_RESPONSE_MS;
// const POOL_BATCH_DELAY_MS = 0;
// const POOL_EARLY_EXIT_TOLERANCE = 1;
// const POOL_PROVIDER_SKIP_AFTER_BATCHES = 2;

// function isWorthyForPool(w: WorkingProxyResult): boolean {
//   return (
//     w.statusCode === 200 &&
//     w.responseTimeMs <= POOL_WORTHY_MAX_MS &&
//     (Object.keys(w.cookies).length > 0 || Object.keys(w.tokens).length > 0)
//   );
// }

// function workingToSession(w: WorkingProxyResult): InstagramProxySession {
//   const ua = w.headers["user-agent"] ?? DEFAULT_USER_AGENT;
//   return {
//     proxy: w.proxy,
//     userAgent: ua,
//     proxyResponseTimeMs: w.responseTimeMs,
//     targetUrlResponseTimeMs: w.responseTimeMs,
//     targetUrlInfo: { headers: w.headers, cookies: w.cookies, tokens: w.tokens },
//   };
// }

// function extractUsername(urlOrUsername: string): string | null {
//   const s = urlOrUsername.trim();
//   const match = s.match(/instagram\.com\/([a-zA-Z0-9_.]+)\/?/);
//   if (match) return match[1];
//   if (/^[a-zA-Z0-9_.]+$/.test(s)) return s;
//   return null;
// }

// function cookiesToHeaderString(cookies: Record<string, string>): string {
//   return Object.entries(cookies).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("; ");
// }

// function buildWebProfileInfoHeaders(session: InstagramProxySession, username: string): Record<string, string> {
//   const info = session.targetUrlInfo ?? {};
//   const headers = (info.headers as Record<string, string>) ?? {};
//   const cookies = (info.cookies as Record<string, string>) ?? {};
//   const tokens = (info.tokens as { csrfToken?: string; rolloutHash?: string; viewerId?: string }) ?? {};
//   const csrf = tokens.csrfToken ?? headers["x-csrftoken"] ?? cookies["csrftoken"] ?? "";
//   const cookieStr = cookiesToHeaderString(cookies);
//   const ua = session.userAgent ?? headers["user-agent"] ?? DEFAULT_USER_AGENT;

//   return {
//     Accept: "*/*",
//     "Accept-Language": "en-US,en;q=0.9",
//     "Accept-Encoding": "gzip, deflate, br",
//     "Cache-Control": "no-cache",
//     Referer: `https://www.instagram.com/${username}/`,
//     "Sec-Fetch-Dest": "empty",
//     "Sec-Fetch-Mode": "cors",
//     "Sec-Fetch-Site": "same-origin",
//     "User-Agent": ua,
//     "X-Requested-With": "XMLHttpRequest",
//     "X-Csrftoken": csrf,
//     "X-Ig-App-Id": headers["x-ig-app-id"] ?? "936619743392459",
//     "X-Ig-Www-Claim": headers["x-ig-www-claim"] ?? "0",
//     "X-Asbd-Id": headers["x-asbd-id"] ?? "129477",
//     "X-Ig-Connection-Type": headers["x-ig-connection-type"] ?? "WIFI",
//     ...(cookieStr ? { Cookie: cookieStr } : {}),
//   };
// }

// function parseWebProfileApiResponse(data: unknown, username: string): INSTAGRAM_RESPONSE {
//   const raw = data as InstagramUser | undefined;
//   const user = raw?.data?.user;
//   if (!user || typeof user !== "object") {
//     throw new Error(`No user data in response for ${username}`);
//   }
//   const bioEntities = (user as any).biography_with_entities?.entities ?? [];
//   const bioHashtags = bioEntities.map((e: any) => e?.hashtag?.name).filter(Boolean);
//   const bioMentions = bioEntities.map((e: any) => e?.user?.username).filter(Boolean);
//   const bioLinks = (user as any).bio_links ?? [];
//   const websites = bioLinks.map((l: any) => l?.url).filter(Boolean);

//   return {
//     id: user.id ?? null,
//     fullName: user.full_name ?? null,
//     username: user.username ?? username,
//     email: user.business_email ?? null,
//     instagramUrl: `https://www.instagram.com/${user.username ?? username}/`,
//     websites: websites.length ? websites : null,
//     bio: user.biography ?? null,
//     bioHashtags: bioHashtags.length ? bioHashtags : null,
//     bioMentions: bioMentions.length ? bioMentions : null,
//     followers: (user as any).edge_followed_by?.count ?? null,
//     following: (user as any).edge_follow?.count ?? null,
//     posts: (user as any).edge_owner_to_timeline_media?.count ?? null,
//     profilePicture: user.profile_pic_url ?? null,
//     profilePcitureHd: user.profile_pic_url_hd ?? null,
//     isVerified: user.is_verified ?? null,
//     isBusiness: user.is_business_account ?? null,
//     isProfessional: user.is_professional_account ?? null,
//     isPrivate: user.is_private ?? null,
//     isJoinedRecently: user.if_joined_recently ?? null,
//     businessEmail: user.business_email ?? null,
//     businessPhoneNumber: user.business_phone_number ?? null,
//     businessCategoryName: user.business_category_name ?? null,
//     overallCategoryName: user.overall_category_name ?? null,
//     businessAddressJson: user.business_address_json ?? null,
//   };
// }

// export type FetchSingleProfileResult =
//   | { success: true; username: string; data: INSTAGRAM_RESPONSE }
//   | { success: false; username: string; error: string; proxy: string };

// export async function fetchSingleProfileWithSession(
//   username: string,
//   session: InstagramProxySession,
// ): Promise<FetchSingleProfileResult> {
//   const url = `${INSTAGRAM_WEB_PROFILE_INFO_URL}?username=${encodeURIComponent(username)}`;
//   const headers = buildWebProfileInfoHeaders(session, username);

//   try {
//     const agent = new ProxyAgent(session.proxy);
//     const res = await undiciFetch(url, {
//       dispatcher: agent, headers, redirect: "follow",
//       signal: AbortSignal.timeout(WEB_PROFILE_REQUEST_TIMEOUT_MS),
//     });

//     if (res.status !== 200) {
//       const body = await res.text().catch(() => "");
//       return { success: false, username, error: `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`, proxy: session.proxy };
//     }

//     const json = (await res.json()) as unknown;
//     const data = parseWebProfileApiResponse(json, username);
//     return { success: true, username, data };
//   } catch (err) {
//     const error = err instanceof Error ? err.message : String(err);
//     return { success: false, username, error, proxy: session.proxy };
//   }
// }

// function randomDelayMs(minMs: number, maxMs: number): Promise<void> {
//   const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
//   return new Promise((r) => setTimeout(r, ms));
// }

// function delayBetweenRequests(): Promise<void> {
//   return randomDelayMs(DELAY_BETWEEN_REQUESTS_MS_MIN, DELAY_BETWEEN_REQUESTS_MS_MAX);
// }

// function sessionRotationDelay(): Promise<void> {
//   return randomDelayMs(SESSION_ROTATION_DELAY_MS_MIN, SESSION_ROTATION_DELAY_MS_MAX);
// }

// function distributeProfilesAcrossSessions(
//   usernames: string[],
//   sessions: InstagramProxySession[],
// ): Map<number, string[]> {
//   if (sessions.length === 0 || usernames.length === 0) return new Map();
//   const indices = Array.from({ length: sessions.length }, (_, i) => i);
//   for (let i = indices.length - 1; i > 0; i--) {
//     const j = Math.floor(Math.random() * (i + 1));
//     [indices[i], indices[j]] = [indices[j], indices[i]];
//   }
//   const perSession: Map<number, string[]> = new Map();
//   indices.forEach((idx) => perSession.set(idx, []));
//   let u = 0;
//   while (u < usernames.length) {
//     for (const idx of indices) {
//       if (u >= usernames.length) break;
//       const chunkSize = Math.max(1, Math.min(Math.floor(Math.random() * 5) + 1, usernames.length - u));
//       const chunk = usernames.slice(u, u + chunkSize);
//       u += chunk.length;
//       perSession.get(idx)!.push(...chunk);
//     }
//   }
//   return perSession;
// }

// export type FetchProfilesWithRotationResult = {
//   successes: INSTAGRAM_RESPONSE[];
//   failed: Array<{ username: string; proxy: string; error: string }>;
// };

// export async function fetchProfilesWithRotatingSessions(
//   usernames: string[],
//   pool: InstagramProxySession[],
// ): Promise<FetchProfilesWithRotationResult> {
//   const successes: INSTAGRAM_RESPONSE[] = [];
//   const failed: Array<{ username: string; proxy: string; error: string }> = [];

//   if (pool.length === 0 || usernames.length === 0) {
//     return { successes, failed: usernames.map((u) => ({ username: u, proxy: "", error: "No session pool" })) };
//   }

//   const distribution = distributeProfilesAcrossSessions(usernames, pool);
//   const sessionIndices = Array.from(distribution.keys()).filter((idx) => distribution.get(idx)!.length > 0);

//   async function runSessionWorker(sessionIndex: number): Promise<void> {
//     const session = pool[sessionIndex];
//     const list = distribution.get(sessionIndex) ?? [];
//     if (list.length === 0) return;
//     await sessionRotationDelay();
//     for (let i = 0; i < list.length; i++) {
//       const username = list[i];
//       const result = await fetchSingleProfileWithSession(username, session);
//       if (result.success) {
//         successes.push(result.data);
//         logStep(`  [${session.proxy}] ${username} OK`);
//       } else {
//         failed.push({ username: result.username, proxy: result.proxy, error: result.error });
//         logStep(`  [${session.proxy}] ${username} FAIL: ${result.error}`);
//       }
//       if (i < list.length - 1) await delayBetweenRequests();
//     }
//   }

//   await Promise.all(sessionIndices.map((idx) => runSessionWorker(idx)));
//   return { successes, failed };
// }

// export async function fetchInstagramProfilesWithRetry(
//   profileUrlsOrUsernames: string[],
//   pool: InstagramProxySession[],
//   options: { maxRetryRounds?: number } = {},
// ): Promise<{
//   successes: INSTAGRAM_RESPONSE[];
//   failed: Array<{ username: string; proxy: string; error: string }>;
// }> {
//   const usernames = profileUrlsOrUsernames.map((u) => extractUsername(u)).filter((u): u is string => u != null);
//   const uniqueUsernames = Array.from(new Set(usernames));
//   let currentPool = [...pool];
//   const allSuccesses: INSTAGRAM_RESPONSE[] = [];
//   let pendingUsernames = [...uniqueUsernames];
//   const maxRounds = options.maxRetryRounds ?? MAX_FAILURE_RETRY_ROUNDS;

//   let lastFailed: Array<{ username: string; proxy: string; error: string }> = [];

//   for (let round = 0; round <= maxRounds; round++) {
//     if (pendingUsernames.length === 0) break;
//     if (currentPool.length === 0) {
//       logStep(`Failure retry round ${round}: no pool left, ${pendingUsernames.length} profiles still failed`);
//       lastFailed = pendingUsernames.map((u) => ({ username: u, proxy: "", error: "No session pool left after removing failed IPs" }));
//       break;
//     }
//     logStep(`Round ${round + 1}: fetching ${pendingUsernames.length} profiles with ${currentPool.length} sessions`);
//     const { successes, failed } = await fetchProfilesWithRotatingSessions(pendingUsernames, currentPool);
//     allSuccesses.push(...successes);
//     lastFailed = failed;
//     if (failed.length === 0) break;
//     const failedProxies = new Set(failed.map((f) => f.proxy));
//     currentPool = currentPool.filter((s) => !failedProxies.has(s.proxy));
//     pendingUsernames = failed.map((f) => f.username);
//     logStep(`Round ${round + 1}: ${successes.length} ok, ${failed.length} failed; removed ${failedProxies.size} proxies, ${currentPool.length} remaining`);
//   }

//   return { successes: allSuccesses, failed: lastFailed };
// }

// export const fetchInstagramProfiles = async (
//   profileUrlsOrUsernames: string[],
//   sessionPool: InstagramProxySession[],
// ): Promise<INSTAGRAM_RESPONSE[]> => {
//   const { successes, failed } = await fetchInstagramProfilesWithRetry(
//     profileUrlsOrUsernames, sessionPool, { maxRetryRounds: MAX_FAILURE_RETRY_ROUNDS },
//   );
//   if (failed.length > 0) {
//     logStep(`fetchInstagramProfiles: ${failed.length} profiles could not be fetched`, failed.map((f) => f.username).join(", "));
//   }
//   return successes;
// };

// export async function createInstagramProxySessionPool(profileCount: number): Promise<InstagramProxySession[]> {
//   const stepStart = Date.now();
//   const targetSize = Math.min(Math.max(1, Math.ceil(profileCount * POOL_TARGET_RATIO)), 50);

//   logStep("Step 2: createInstagramProxySessionPool — start", ` | target ${targetSize} sessions (35% of ${profileCount} profiles)`);

//   const unified = await UnifiedProxyList();
//   const { byProvider } = unified;

//   const providerPriority = [
//     "ProxyScrape", "Genode", "NodeMaven",
//     "GITHUBFreeProxyList", "GITHUBFreshProxyList", "GITHUBSpeedXProxyList",
//   ] as const;

//   logStep("Step 2: testing proxies in batches...", ` | ${unified.uniqueCount} unique proxies across ${byProvider.length} providers, batch 100–500, worthy ≤${POOL_WORTHY_MAX_MS}ms`);

//   const pool: InstagramProxySession[] = [];
//   let globalBatchIndex = 0;

//   for (const name of providerPriority) {
//     if (pool.length >= targetSize || pool.length >= targetSize - POOL_EARLY_EXIT_TOLERANCE) {
//       logStep("Step 2: early exit", ` | pool ${pool.length} within ${POOL_EARLY_EXIT_TOLERANCE} of target ${targetSize}`);
//       break;
//     }

//     const group = byProvider.find((g) => g.name === name);
//     if (!group || group.proxies.length === 0) continue;

//     let offset = 0;
//     let tested = 0;
//     let workingCount = 0;
//     let worthyCountTotal = 0;
//     let batchesThisProvider = 0;

//     logStep(`  provider ${name} — start`, ` | ${group.proxies.length} proxies (post-dedup)`);

//     while (pool.length < targetSize && offset < group.proxies.length) {
//       batchesThisProvider++;
//       if (pool.length >= targetSize - POOL_EARLY_EXIT_TOLERANCE && pool.length > 0) {
//         logStep("Step 2: early exit", ` | pool ${pool.length} within ${POOL_EARLY_EXIT_TOLERANCE} of target ${targetSize}`);
//         break;
//       }

//       if (globalBatchIndex > 0 && POOL_BATCH_DELAY_MS > 0) {
//         logStep(`    waiting ${POOL_BATCH_DELAY_MS}ms before next batch...`);
//         await new Promise((r) => setTimeout(r, POOL_BATCH_DELAY_MS));
//       }

//       globalBatchIndex++;
//       const batchSize = Math.min(POOL_BATCH_SIZE_MAX, Math.max(POOL_BATCH_SIZE_MIN, group.proxies.length - offset));
//       const batch = group.proxies.slice(offset, offset + batchSize);
//       offset += batch.length;
//       tested += batch.length;

//       logStep(`    ${name} batch #${globalBatchIndex}`, ` | offset ${offset - batch.length}–${offset}, need ${targetSize - pool.length} more`);

//       const working = await testProxiesBatch(batch, {
//         batchSize: batch.length,
//         concurrency: PROXY_CONCURRENCY,
//         maxResponseTimeMs: POOL_WORTHY_MAX_MS,
//       });
//       workingCount += working.length;

//       let worthyCount = 0;
//       for (const w of working) {
//         if (pool.length >= targetSize) break;
//         if (isWorthyForPool(w)) { pool.push(workingToSession(w)); worthyCount++; worthyCountTotal++; }
//       }
//       logStep(`    ${name} batch #${globalBatchIndex} worthy`, ` | +${worthyCount} → pool size ${pool.length}/${targetSize}`);

//       if (batchesThisProvider >= POOL_PROVIDER_SKIP_AFTER_BATCHES && worthyCountTotal === 0) {
//         logStep(`  provider ${name} — skip rest`, ` | 0 worthy in ${batchesThisProvider} batches, moving to next provider`);
//         break;
//       }
//     }

//     const hitRate = tested > 0 ? ((worthyCountTotal / tested) * 100).toFixed(2) : "0.00";
//     logStep(`  provider ${name} — summary`, ` | tested=${tested}, httpOkFast=${workingCount}, worthy=${worthyCountTotal}, worthyRate=${hitRate}%`);

//     if (pool.length >= targetSize || pool.length >= targetSize - POOL_EARLY_EXIT_TOLERANCE) break;
//   }

//   const totalElapsed = Date.now() - stepStart;
//   logStep("Step 2: createInstagramProxySessionPool — done", ` | pool ${pool.length} sessions in ${(totalElapsed / 1000).toFixed(1)}s`, totalElapsed);
//   return pool;
// }
