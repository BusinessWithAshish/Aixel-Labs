import { MEDIA_FETCH_DIR } from "../constants";
import { downloadToFixedDir } from "../source";
import type { MEDIA_FETCH_REQUEST_PARSED, MEDIA_FETCH_RESPONSE } from "../types";

/**
 * Resolves any media source to a local file the caller can hand to the rest
 * of the module.
 *
 * A local path passes through untouched; a remote URL downloads to
 * `MEDIA_FETCH_DIR` — a fixed, persistent folder rather than a per-call temp
 * dir, so this op's response can just be `{ path }` with nothing to track
 * or clean up. `cut` and `diarize` still resolve their own source
 * internally into their own scratch space, so reach for this only when a
 * workflow genuinely wants the bytes sitting on disk itself — e.g. to
 * transcribe and cut the same file without pulling it twice, to stage a
 * reference image for a later `chatgpt`/`claude` call, or to hand a
 * downloaded file's path to another tool.
 *
 * `imageOnly`/`maxBytes` are what used to be `chatgpt` op=stage_image's own,
 * separate, weaker implementation (plain `fetch()`, no gated-CDN fallback) —
 * folded in here instead of staying duplicated. Any caller that wants a
 * validated reference image uses this op now, not a chatgpt-specific one.
 *
 * Never touches YouTube — see the module-level note in `../source.ts`. Get
 * a YouTube video onto local disk via `youtube` op=video_download first,
 * then pass that local path here.
 */
export async function fetchMedia(
  input: MEDIA_FETCH_REQUEST_PARSED,
): Promise<MEDIA_FETCH_RESPONSE> {
  return downloadToFixedDir(input.source, MEDIA_FETCH_DIR, {
    imageOnly: input.imageOnly,
    maxBytes: input.maxBytes,
  });
}
