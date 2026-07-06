import { randomUUID } from "crypto";
import {
  YOUTUBE_DEFAULT_COUNTRY,
  YOUTUBE_INNERTUBE_CLIENT_NAME,
  YOUTUBE_INNERTUBE_HL,
  YOUTUBE_INNERTUBE_JSON_HEADERS,
} from "./constants";
import type { YOUTUBE_GEO_REQUEST } from "./types";
import {
  createUrlFetchSession,
  type UrlFetchSession,
} from "../../utils/node-tls-client-session-handler";
import { evomiConfigured } from "../../utils/fetch-session-common";

// ─── Geo routing (proxy + InnerTube gl) ──────────────────────────────────────

/** Resolves country/region into InnerTube `gl` and proxy routing params. */
export function resolveYoutubeGeo(geo: Partial<YOUTUBE_GEO_REQUEST> = {}): {
  country: string;
  region: string | undefined;
  gl: string;
} {
  const country = (geo.country ?? YOUTUBE_DEFAULT_COUNTRY).toUpperCase();
  const region = geo.region?.trim() || undefined;
  return { country, region, gl: country };
}

/** Creates a TLS session with country/region-targeted Evomi proxy when configured. */
export async function createYoutubeFetchSession(
  geo: Partial<YOUTUBE_GEO_REQUEST> = {},
): Promise<UrlFetchSession> {
  const { country, region } = resolveYoutubeGeo(geo);

  return createUrlFetchSession({
    useProxy: evomiConfigured(),
    proxyCountry: country,
    proxyRegion: region,
    proxySessionSuffix: randomUUID().replace(/-/g, "").slice(0, 12),
  });
}

/** Fetches a YouTube HTML page and returns the InnerTube client version. */
export async function fetchInnertubeClientVersion(
  session: UrlFetchSession,
  pageUrl: string,
): Promise<string> {
  const { clientVersion } = await fetchYoutubeWatchPageContext(session, pageUrl);
  return clientVersion;
}

/** Fetches a watch/channel HTML page and extracts InnerTube client version + ytInitialData. */
export async function fetchYoutubeWatchPageContext(
  session: UrlFetchSession,
  pageUrl: string,
): Promise<{
  clientVersion: string;
  initialData: Record<string, unknown>;
}> {
  const response = await session.get(pageUrl);
  if (!response.ok) {
    throw new Error(`YouTube page request failed: ${response.status}`);
  }

  const html = await response.text();
  return {
    clientVersion: extractInnertubeClientVersion(html),
    initialData: extractYtInitialDataFromHtml(html),
  };
}

// ─── Text & number parsing ───────────────────────────────────────────────────

function parseNumericWithSuffix(value: string): number | null {
  const match = value.match(/^([\d,.]+)\s*([KMB])?/i);
  if (!match) return null;

  let num = Number.parseFloat(match[1].replace(/,/g, ""));
  if (Number.isNaN(num)) return null;

  const suffix = match[2]?.toUpperCase();
  if (suffix === "K") num *= 1_000;
  else if (suffix === "M") num *= 1_000_000;
  else if (suffix === "B") num *= 1_000_000_000;

  return Math.round(num);
}

/** Parses abbreviated counts like "1.2M subscribers" or "500K". */
export function abbreviatedCountTextToNumber(
  text: string | null,
): number | null {
  if (!text) return null;
  return parseNumericWithSuffix(text.trim());
}

/** Parses view count display text (e.g. "1.2M views", "5 thousand views"). */
export function viewsTextToNumber(viewsText: string | null): number | null {
  if (!viewsText) return null;

  const thousandMatch = viewsText.match(/^([\d,.]+)\s+thousand\s+views$/i);
  if (thousandMatch) {
    const value = Number.parseFloat(thousandMatch[1].replace(/,/g, ""));
    return Number.isNaN(value) ? null : Math.round(value * 1_000);
  }

  const viewsMatch = viewsText.match(/^([\d,.]+)\s*([KMB])?\s*views$/i);
  if (viewsMatch) {
    const raw = viewsMatch[2]
      ? `${viewsMatch[1]}${viewsMatch[2]}`
      : viewsMatch[1];
    return parseNumericWithSuffix(raw);
  }

  const plainMatch = viewsText.match(/^(\d+(?:,\d+)*)\s*views$/i);
  if (plainMatch) {
    const value = Number.parseInt(plainMatch[1].replace(/,/g, ""), 10);
    return Number.isNaN(value) ? null : value;
  }

  return null;
}

/** Parses duration strings like "3:45" or "1:02:30" into seconds. */
export function durationTextToSeconds(
  durationText: string | null,
): number | null {
  if (!durationText) return null;

  const trimmed = durationText.trim();
  if (!/^\d/.test(trimmed)) return null;

  const parts = trimmed.split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

/** Parses video count text like "42 videos". */
export function videoCountTextToNumber(
  videoCountText: string | null,
): number | null {
  if (!videoCountText) return null;

  const match = videoCountText.match(/^([\d,.]+)\s+videos?$/i);
  if (!match) return null;

  const value = Number.parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isNaN(value) ? null : value;
}

/** Joins YouTube text runs into a single string, or null if empty. */
export function joinYoutubeTextRuns(
  runs?: Array<{ text?: string }>,
): string | null {
  if (!runs?.length) return null;
  const text = runs.map((r) => r?.text ?? "").join("");
  return text || null;
}

export function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveRedirectUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const target = parsed.searchParams.get("q");
    return target ? decodeURIComponent(target) : url;
  } catch {
    return url;
  }
}

// ─── HTML / InnerTube extraction ─────────────────────────────────────────────

export function extractInnertubeClientVersion(html: string): string {
  const match = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
  if (!match) {
    throw new Error(
      "Could not extract INNERTUBE_CLIENT_VERSION from YouTube page",
    );
  }
  return match[1];
}

export function extractYtInitialDataFromHtml<T = Record<string, unknown>>(
  html: string,
): T {
  const initDataMatch = html.match(/var ytInitialData = ({.+?});/);
  if (!initDataMatch) {
    throw new Error("Cannot extract ytInitialData from YouTube page");
  }

  try {
    return JSON.parse(initDataMatch[1]) as T;
  } catch {
    throw new Error("Failed to parse ytInitialData JSON");
  }
}

export function buildInnertubeContext(clientVersion: string, gl: string) {
  return {
    client: {
      clientName: YOUTUBE_INNERTUBE_CLIENT_NAME,
      clientVersion,
      hl: YOUTUBE_INNERTUBE_HL,
      gl,
    },
  };
}

export async function postInnertube<T>(
  session: UrlFetchSession,
  url: string,
  body: Record<string, unknown>,
  errorLabel = "YouTube innertube request",
): Promise<T> {
  const response = await session.post(`${url}?prettyPrint=false`, {
    headers: YOUTUBE_INNERTUBE_JSON_HEADERS,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${errorLabel} failed: ${response.status}`);
  }

  return JSON.parse(await response.text()) as T;
}
