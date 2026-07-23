/**
 * Google Maps / googleusercontent media URL helpers for the browser.
 */

export const GMAPS_IMAGE_PROXY_PATH = "/api/gmaps/image";

export const GMAPS_IMAGE_PROXY_MAX_AGE_SECONDS = 86_400;
export const GMAPS_IMAGE_PROXY_SWR_SECONDS = 604_800;

const GMAPS_CDN_HOST_SUFFIXES = [
  "googleusercontent.com",
  "ggpht.com",
  "google.com",
] as const;

export function isGmapsCdnUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return GMAPS_CDN_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

/** Prefer mid-size place photos; skip tiny avatar thumbs. */
export function preferGmapsPhotoUrl(url: string): string {
  try {
    const u = new URL(url);
    // Common Maps thumb → request a usable card width.
    if (u.hostname.includes("googleusercontent.com")) {
      if (/[=/]s\d+/.test(u.pathname + u.search)) {
        return url.replace(/=s\d+[^/?]*/i, "=s800").replace(/\/s\d+-/i, "/s800-");
      }
      if (!u.searchParams.has("w")) {
        u.searchParams.set("w", "800");
      }
      return u.toString();
    }
  } catch {
    // keep original
  }
  return url;
}

export function gmapsProxiedImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (!isGmapsCdnUrl(url)) return url;
  const preferred = preferGmapsPhotoUrl(url);
  return `${GMAPS_IMAGE_PROXY_PATH}?url=${encodeURIComponent(preferred)}`;
}

export function pickGmapsCardPhotos(urls: string[] | null | undefined, max = 4): string[] {
  if (!urls?.length) return [];
  return urls
    .filter((u) => !/\/s44[-/]/.test(u) && !u.includes("/AAAAAAAAAAI/AAAAAAAAAAA/"))
    .slice(0, max);
}
