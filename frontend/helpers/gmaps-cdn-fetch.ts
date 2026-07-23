import "server-only";

export const GMAPS_CDN_FETCH_REVALIDATE_SECONDS = 86_400;

export const GMAPS_CDN_FETCH_HEADERS: Record<string, string> = {
  Referer: "https://www.google.com/maps/",
  Origin: "https://www.google.com",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
};

export type GmapsCdnImage = {
  body: ArrayBuffer;
  contentType: string;
};

export async function fetchGmapsCdnImage(imageUrl: string): Promise<GmapsCdnImage> {
  const response = await fetch(imageUrl, {
    headers: GMAPS_CDN_FETCH_HEADERS,
    next: { revalidate: GMAPS_CDN_FETCH_REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`Google Maps CDN HTTP ${response.status}`);
  }

  const body = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  return { body, contentType };
}
