import type { IgFeedItem } from "../../advanced/types";

const JSON_SCRIPT_RE =
  /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;

function isMediaItem(o: Record<string, unknown>, shortcode: string): boolean {
  return (
    o.code === shortcode &&
    ("image_versions2" in o || "video_versions" in o || "carousel_media" in o)
  );
}

/**
 * Finds the v1 feed item for `shortcode` inside the crawler SSR page.
 *
 * Only blobs that mention the shortcode are parsed — the page carries dozens
 * of unrelated JSON scripts. Walks iteratively (the relay payload nests
 * deeply) and returns the first object whose `code` matches and that carries
 * media keys; related-post teasers carry other codes, so they never match.
 */
export function findFeedItemInSsr(
  html: string,
  shortcode: string,
): IgFeedItem | null {
  const needle = `"code":"${shortcode}"`;
  for (const m of html.matchAll(JSON_SCRIPT_RE)) {
    const blob = m[1];
    if (!blob || !blob.includes(needle)) continue;
    let data: unknown;
    try {
      data = JSON.parse(blob);
    } catch {
      continue;
    }
    const stack: unknown[] = [data];
    while (stack.length) {
      const o = stack.pop();
      if (Array.isArray(o)) {
        stack.push(...o);
      } else if (o && typeof o === "object") {
        const rec = o as Record<string, unknown>;
        if (isMediaItem(rec, shortcode)) return rec as IgFeedItem;
        stack.push(...Object.values(rec));
      }
    }
  }
  return null;
}
