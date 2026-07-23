import "server-only";

/** Upstream CDN fetch TTL in the Next.js Data Cache (shared across requests). */
export const IG_CDN_FETCH_REVALIDATE_SECONDS = 86_400; // 24h

export const IG_CDN_FETCH_HEADERS: Record<string, string> = {
  Referer: "https://www.instagram.com/",
  Origin: "https://www.instagram.com",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};

export type InstagramCdnImage = {
  body: ArrayBuffer;
  contentType: string;
};

/**
 * Fetch an Instagram CDN asset with Next.js Data Cache so route handlers and
 * `after()` warmers share the same upstream result (docs: `fetch` + `next.revalidate`).
 */
export async function fetchInstagramCdnImage(
  imageUrl: string,
): Promise<InstagramCdnImage> {
  const response = await fetch(imageUrl, {
    headers: IG_CDN_FETCH_HEADERS,
    next: { revalidate: IG_CDN_FETCH_REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`Instagram CDN HTTP ${response.status}`);
  }

  const body = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  return { body, contentType };
}

/**
 * Warm the Next.js Data Cache for many CDN URLs in parallel (bounded concurrency).
 * Used from `after()` on lead list pages so avatar proxy hits are cache-warm.
 */
export async function warmInstagramCdnImages(
  urls: readonly string[],
  concurrency = 12,
): Promise<void> {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return;

  let cursor = 0;
  async function worker() {
    while (cursor < unique.length) {
      const index = cursor++;
      const url = unique[index]!;
      try {
        await fetchInstagramCdnImage(url);
      } catch {
        // Best-effort warm — skip failures (expired signed URLs, etc.)
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, unique.length) },
    () => worker(),
  );
  await Promise.all(workers);
}
