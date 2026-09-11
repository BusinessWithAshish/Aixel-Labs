import { execFile } from "node:child_process";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import { MEDIA_ERROR_MESSAGES } from "../constants";

const execFileAsync = promisify(execFile);

/**
 * Escape a path for the `ass=` filter argument.
 *
 * ffmpeg parses this twice — once splitting the filtergraph (where `:`
 * separates options, `'` quotes, and `,` separates filters) and once as the
 * filter's own argument — so the escapes have to survive both passes. Every
 * path we generate is a colon-free absolute POSIX path, but this runs on
 * caller-supplied paths too.
 */
function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, "\\\\\\\\").replace(/:/g, "\\\\:").replace(/'/g, "\\\\'");
}

/**
 * Burn `assPath` into `inputPath`, writing `outputPath`.
 *
 * The `ass` filter is used rather than `subtitles` because we author a full
 * ASS document with its own `PlayResX/Y` and style block (see `ass.ts`) — no
 * `force_style` string, and therefore no second layer of escaping to get
 * wrong.
 *
 * Video is necessarily re-encoded (pixels change); audio is stream-copied,
 * since re-encoding a track we never touch would be slower and lossy for
 * nothing. `-movflags +faststart` moves the moov atom to the front so the
 * result plays before it has fully downloaded — which matters both for HTTP
 * serving and for upload APIs that probe the header.
 */
export async function burnCaptions(
  inputPath: string,
  assPath: string,
  outputPath: string,
): Promise<void> {
  if (!ffmpegPath) {
    throw new Error(MEDIA_ERROR_MESSAGES.CAPTION_BURN_FAILED);
  }

  try {
    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-i", inputPath,
        "-vf", `ass='${escapeFilterPath(assPath)}'`,
        "-c:a", "copy",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        outputPath,
      ],
      { maxBuffer: 1024 * 1024 * 16 },
    );
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? "";
    // ffmpeg's last stderr line names the real cause (missing font, unwritable
    // path, bad filter); surfacing it beats a bare "burn failed".
    const detail = stderr.trim().split("\n").filter(Boolean).slice(-1)[0] ?? "";
    throw new Error(
      detail
        ? `${MEDIA_ERROR_MESSAGES.CAPTION_BURN_FAILED}: ${detail}`
        : MEDIA_ERROR_MESSAGES.CAPTION_BURN_FAILED,
    );
  }
}
