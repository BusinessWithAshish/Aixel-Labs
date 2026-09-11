import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { assertPersistentDisk } from "../../../config";
import {
  MEDIA_CAPTION,
  MEDIA_CAPTION_OUTPUT_DIR,
  MEDIA_ERROR_MESSAGES,
} from "../constants";
import { cleanupResolvedMediaSource, resolveMediaSource } from "../source";
import { probeMediaStreams } from "../cut/ffmpeg-cut";
import { normalizeToFlac } from "../transcribe/ffmpeg";
import { transcribeWithGroq } from "../transcribe/groq-client";
import { buildCues, cuesToSrt, parseSubtitles, type CAPTION_CUE, type WRAP_OPTIONS } from "./cues";
import { cuesToAss } from "./ass";
import { burnCaptions } from "./ffmpeg-caption";
import type {
  CAPTION_STYLE_RESOLVED,
  MEDIA_CAPTION_REQUEST_PARSED,
  MEDIA_CAPTION_RESPONSE,
} from "./types";

/** Looks like a filesystem path rather than subtitle content? Content always contains `-->`. */
function looksLikePath(value: string): boolean {
  return !value.includes("-->") && !value.includes("\n") && /\.(srt|vtt)$/i.test(value.trim());
}

/**
 * Apply defaults. Font size and vertical margin are derived from the real
 * frame height unless given explicitly, so the same request produces
 * proportionally identical captions on a 720x1280 clip and a 1080x1920 one.
 * Outline scales with the text for the same reason.
 */
function resolveStyle(
  style: MEDIA_CAPTION_REQUEST_PARSED["style"],
  height: number,
): CAPTION_STYLE_RESOLVED {
  const position = style?.position ?? MEDIA_CAPTION.DEFAULT_POSITION;
  const fontSize =
    style?.fontSize ?? Math.round(height * MEDIA_CAPTION.FONT_SIZE_HEIGHT_RATIO);
  return {
    fontName: style?.fontName ?? MEDIA_CAPTION.DEFAULT_FONT_NAME,
    fontSize,
    primaryColour: style?.primaryColour ?? MEDIA_CAPTION.DEFAULT_PRIMARY_COLOUR,
    outlineColour: style?.outlineColour ?? MEDIA_CAPTION.DEFAULT_OUTLINE_COLOUR,
    outline: style?.outline ?? Math.max(1, Math.round(fontSize / 16)),
    shadow: style?.shadow ?? MEDIA_CAPTION.DEFAULT_SHADOW,
    bold: style?.bold ?? MEDIA_CAPTION.DEFAULT_BOLD,
    alignment: MEDIA_CAPTION.ALIGNMENT_BY_POSITION[position],
    marginV:
      style?.marginV ?? Math.round(height * MEDIA_CAPTION.MARGIN_V_HEIGHT_RATIO[position]),
  };
}

/**
 * Line length has to be decided from the geometry, not guessed: the number of
 * characters that fit is `usable width / mean glyph width`, and mean glyph
 * width scales with the font size that `resolveStyle` just derived from the
 * frame height. A fixed default overflows as soon as either changes.
 */
function resolveWrap(
  wrap: MEDIA_CAPTION_REQUEST_PARSED["wrap"],
  uppercase: boolean | undefined,
  width: number,
  fontSize: number,
): WRAP_OPTIONS {
  const usableWidth = width * (1 - 2 * MEDIA_CAPTION.MARGIN_H_WIDTH_RATIO);
  const fitted = Math.floor(usableWidth / (fontSize * MEDIA_CAPTION.CHAR_WIDTH_RATIO));
  return {
    maxCharsPerLine:
      wrap?.maxCharsPerLine ??
      Math.min(
        MEDIA_CAPTION.MAX_CHARS_PER_LINE,
        Math.max(MEDIA_CAPTION.MIN_CHARS_PER_LINE, fitted),
      ),
    maxLinesPerCue: wrap?.maxLinesPerCue ?? MEDIA_CAPTION.DEFAULT_MAX_LINES_PER_CUE,
    uppercase: uppercase ?? MEDIA_CAPTION.DEFAULT_UPPERCASE,
  };
}

/**
 * Caption a video: get cues, write an `.srt`, and (by default) burn them in.
 *
 * Cues normally come from transcribing the video's OWN audio rather than from
 * a transcript of whatever it was cut out of. That is the point of the op:
 * Whisper timings on a clip are already relative to that clip's zero, so there
 * is no re-timing arithmetic to get subtly wrong, and transcribing 40 seconds
 * of clip audio is more accurate than slicing a two-hour episode's captions.
 * `subtitles` exists for the case where the text must be verbatim.
 *
 * Content-agnostic: nothing here knows what a Short is. The Shorts-shaped
 * choices live in `MEDIA_CAPTION`'s defaults, which any caller can override.
 */
export async function captionVideo(
  request: MEDIA_CAPTION_REQUEST_PARSED,
): Promise<MEDIA_CAPTION_RESPONSE> {
  assertPersistentDisk(MEDIA_ERROR_MESSAGES.VERCEL);

  const { videoSource, subtitles, language, model, burn } = request;

  const resolved = await resolveMediaSource(videoSource);

  try {
    await mkdir(MEDIA_CAPTION_OUTPUT_DIR, { recursive: true });
    const probe = await probeMediaStreams(resolved.path);
    if (burn && !probe.hasVideo) {
      throw new Error(MEDIA_ERROR_MESSAGES.CAPTION_NO_VIDEO);
    }
    const width = probe.width ?? MEDIA_CAPTION.FALLBACK_WIDTH;
    const height = probe.height ?? MEDIA_CAPTION.FALLBACK_HEIGHT;
    const style = resolveStyle(request.style, height);
    const wrap = resolveWrap(request.wrap, request.style?.uppercase, width, style.fontSize);

    let cues: CAPTION_CUE[];
    let source: "transcribed" | "provided";
    let detectedLanguage: string | undefined;

    if (subtitles) {
      const raw = looksLikePath(subtitles)
        ? await readFile(subtitles.trim(), "utf8")
        : subtitles;
      cues = parseSubtitles(raw, wrap);
      source = "provided";
      if (cues.length === 0) {
        throw new Error(MEDIA_ERROR_MESSAGES.CAPTION_SUBTITLE_PARSE_FAILED);
      }
    } else {
      if (!probe.hasAudio) {
        throw new Error(MEDIA_ERROR_MESSAGES.CAPTION_NO_AUDIO);
      }
      const normalized = await normalizeToFlac(resolved.path);
      try {
        // Word timings are what let a cue appear exactly on its first word
        // instead of being apportioned by character count — see `cues.ts`.
        const groq = await transcribeWithGroq(normalized.path, {
          model,
          language,
          wordTimestamps: true,
        });
        detectedLanguage = groq.language;
        cues = buildCues(groq.segments ?? [], groq.words ?? [], wrap);
      } finally {
        await rm(normalized.path, { force: true }).catch(() => {});
      }
      source = "transcribed";
      if (cues.length === 0) {
        throw new Error(MEDIA_ERROR_MESSAGES.CAPTION_EMPTY);
      }
    }

    const stem = `caption-${randomUUID()}`;
    const subtitlePath = join(MEDIA_CAPTION_OUTPUT_DIR, `${stem}.srt`);
    await writeFile(subtitlePath, cuesToSrt(cues), "utf8");

    let captionedPath: string | undefined;
    if (burn) {
      // The .srt above is the portable sidecar the caller keeps; the .ass is
      // what actually gets rendered, because only it can carry the frame
      // resolution the style is measured against.
      const assPath = join(MEDIA_CAPTION_OUTPUT_DIR, `${stem}.ass`);
      await writeFile(assPath, cuesToAss(cues, style, width, height), "utf8");
      captionedPath = join(MEDIA_CAPTION_OUTPUT_DIR, `${stem}.mp4`);
      await burnCaptions(resolved.path, assPath, captionedPath);
    }

    return {
      captionedPath,
      subtitlePath,
      cueCount: cues.length,
      source,
      language: detectedLanguage,
      durationSeconds: probe.durationSeconds,
    };
  } finally {
    await cleanupResolvedMediaSource(resolved);
  }
}
