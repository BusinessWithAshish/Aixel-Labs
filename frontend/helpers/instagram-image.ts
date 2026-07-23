/**
 * Instagram media URL helpers for the browser.
 *
 * Prefer **direct CDN URLs** with `referrerPolicy="no-referrer"` on `<img>`.
 * That avoids a same-origin proxy hop per avatar (which clogs Next.js + the
 * network tab on large lead lists). Proxy remains a fallback for edge cases.
 */

export const INSTAGRAM_IMAGE_PROXY_PATH = "/api/instagram/image";

/** Browser + CDN cache for proxied avatars (HTTP Cache-Control). */
export const IG_IMAGE_PROXY_MAX_AGE_SECONDS = 86_400; // 24h
export const IG_IMAGE_PROXY_SWR_SECONDS = 604_800; // 7d

const IG_CDN_HOST_SUFFIXES = ["fbcdn.net", "cdninstagram.com"] as const;

export function isInstagramCdnUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return IG_CDN_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

/**
 * Same-origin proxy URL — use only as fallback when direct CDN load fails.
 */
export function instagramProxiedImageUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;
  if (!isInstagramCdnUrl(url)) return url;
  return `${INSTAGRAM_IMAGE_PROXY_PATH}?url=${encodeURIComponent(url)}`;
}

/**
 * Prefer the small profile thumbnail for list avatars (typically `s150x150`).
 */
export function pickInstagramAvatarCdnUrl(opts: {
  profilePicture?: string | null;
  profilePictureHd?: string | null;
  preferHd?: boolean;
}): string | undefined {
  const { profilePicture, profilePictureHd, preferHd = false } = opts;
  const raw = preferHd
    ? profilePictureHd || profilePicture
    : profilePicture || profilePictureHd;
  if (!raw) return undefined;
  if (!isInstagramCdnUrl(raw) && !raw.startsWith("http")) return undefined;
  return raw;
}

/**
 * @deprecated Prefer `pickInstagramAvatarCdnUrl` + direct `<img referrerPolicy="no-referrer">`.
 * Kept for products page / fallback proxy paths.
 */
export function instagramAvatarSourceUrl(opts: {
  profilePicture?: string | null;
  profilePictureHd?: string | null;
  preferHd?: boolean;
}): string | undefined {
  const raw = pickInstagramAvatarCdnUrl(opts);
  return instagramProxiedImageUrl(raw);
}
