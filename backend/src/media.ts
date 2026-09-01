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
  VIRAL_CLIPPER_CUTS: join(AIXEL_MEDIA_ROOT, "private", "viral-clipper-cuts"),
  TIGHTENING_OUTPUT: join(AIXEL_MEDIA_ROOT, "private", "tightening-output"),
  PUBLIC_BASE_URL:
    process.env.AIXEL_MEDIA_PUBLIC_BASE || "https://hermes.aixellabs.in/media",
} as const;
