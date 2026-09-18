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
  /** Where `media.caption` writes the burned-in clip and its `.srt` sidecar. Separate from MEDIA_CUTS so a
   * captioned result is never confused with the raw cut it came from — both survive, and the caller picks. */
  MEDIA_CAPTIONS: join(AIXEL_MEDIA_ROOT, "private", "media-captions"),
  /** Where `media.effects` writes graded/treated clips and its preset contact sheets. Separate from
   * MEDIA_CUTS and MEDIA_CAPTIONS for the same reason those are separate from each other: a treated
   * clip and the cut it came from both survive, and the caller picks which one goes on to the next step. */
  MEDIA_EFFECTS: join(AIXEL_MEDIA_ROOT, "private", "media-effects"),
  /** Where the diarize ops write full transcripts, so \`segment\` can be handed a
   * path instead of the model re-sending a ~50K-token transcript as a tool
   * argument (see api/media/diarize/transcript-store.ts). */
  MEDIA_TRANSCRIPTS: join(AIXEL_MEDIA_ROOT, "private", "transcripts"),
  /** Where `media.fetch` writes a genuine remote (non-local) download — a fixed, persistent folder rather than a temp dir, so the op's response can just be `{ path }` with nothing to track or clean up. Also where a caller stages a reference image (`imageOnly: true`) for later use, e.g. by `chatgpt`/`claude` — one download op, one folder, not a second bucket per consumer. */
  MEDIA_FETCHED: join(AIXEL_MEDIA_ROOT, "private", "media-fetched"),
  /** Where `instagram` op=download writes post/reel/carousel media — `{shortcode}/{index}.{mp4|jpg}`. Private: shortcode paths are guessable. */
  INSTAGRAM_DOWNLOADS: join(AIXEL_MEDIA_ROOT, "private", "instagram-downloads"),
  /** Where the chunked `media.upload` flow lands finished uploads (its `.tmp/` subfolder holds in-progress sidecar metadata + `.part` files — see api/media/upload/). */
  UPLOADS: join(AIXEL_MEDIA_ROOT, "private", "uploads"),
  PUBLIC_BASE_URL:
    process.env.AIXEL_MEDIA_PUBLIC_BASE || "https://hermes.aixellabs.in/media",
} as const;
