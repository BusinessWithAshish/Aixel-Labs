import { join } from "node:path";

/**
 * Host disk root for staged files. Unset → `cwd/storage` (local/dev).
 * VPS systemd sets `AIXEL_MEDIA_ROOT=/home/ubuntu/media`.
 *
 * Layout: `{root}/public` (Cloudflared `/media/`) and `{root}/private/…`
 * (working files, not served).
 */
export const AIXEL_MEDIA_ROOT =
  process.env.AIXEL_MEDIA_ROOT || join(process.cwd(), "storage");

export const AIXEL_MEDIA = {
  ROOT: AIXEL_MEDIA_ROOT,
  PUBLIC: join(AIXEL_MEDIA_ROOT, "public"),
  PRIVATE: join(AIXEL_MEDIA_ROOT, "private"),
  YOUTUBE_DOWNLOADS: join(AIXEL_MEDIA_ROOT, "private", "youtube-downloads"),
  MEDIA_CUTS: join(AIXEL_MEDIA_ROOT, "private", "media-cuts"),
  MEDIA_CONDENSE_OUTPUT: join(AIXEL_MEDIA_ROOT, "private", "media-condense-output"),
  /** Where `media.fetch` writes a genuine remote (non-local) download — a fixed, persistent folder rather than a temp dir, so the op's response can just be `{ path }` with nothing to track or clean up. */
  MEDIA_FETCHED: join(AIXEL_MEDIA_ROOT, "private", "media-fetched"),
  /** Where `instagram` op=download writes post/reel/carousel media — `{shortcode}/{index}.{mp4|jpg}`. Private: shortcode paths are guessable. */
  INSTAGRAM_DOWNLOADS: join(AIXEL_MEDIA_ROOT, "private", "instagram-downloads"),
  /** `chatgpt` op=stage's downloaded reference images — private (not web-served), a root-level sibling of public/private on purpose since it predates that split and already has real accumulated content. */
  REFS: join(AIXEL_MEDIA_ROOT, "refs"),
  PUBLIC_BASE_URL:
    process.env.AIXEL_MEDIA_PUBLIC_BASE || "https://hermes.aixellabs.in/media",
} as const;
