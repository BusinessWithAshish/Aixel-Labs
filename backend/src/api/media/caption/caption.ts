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
import { dropUnreliableSpans } from "../transcribe/formatters";
import { transcribeWithGroq } from "../transcribe/groq-client";
import {
  buildCues,
  buildWordChunks,
  chunksToCues,
  cuesToSrt,
  parseSubtitles,
  type CAPTION_CHUNK,
  type CAPTION_CUE,
  type WRAP_OPTIONS,
} from "./cues";
import { chunksToAss, cuesToAss } from "./ass";
import { burnCaptions } from "./ffmpeg-caption";
import { romanizeWords } from "./transliterate";
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
 * Apply defaults. Font size and margins are derived from the real frame size
 * unless given explicitly, so the same request produces proportionally
 * identical captions on a 720x1280 clip and a 1080x1920 one. Outline scales
 * with the text for the same reason. The `chunks` preset swaps in its own
 * defaults (`MEDIA_CAPTION.CHUNKS`); explicit style fields still win.
 */
function resolveStyle(
  style: MEDIA_CAPTION_REQUEST_PARSED["style"],
  width: number,
  height: number,
): CAPTION_STYLE_RESOLVED {
  const preset = style?.preset ?? MEDIA_CAPTION.DEFAULT_PRESET;
  const chunks = preset === "chunks";
  const position =
    style?.position ?? (chunks ? MEDIA_CAPTION.CHUNKS.POSITION : MEDIA_CAPTION.DEFAULT_POSITION);
  const fontSize =
    style?.fontSize ??
    Math.round(
      height *
        (chunks ? MEDIA_CAPTION.CHUNKS.FONT_SIZE_HEIGHT_RATIO : MEDIA_CAPTION.FONT_SIZE_HEIGHT_RATIO),
    );
  return {
    preset,
    fontName: style?.fontName ?? (chunks ? MEDIA_CAPTION.CHUNKS.FONT_NAME : MEDIA_CAPTION.DEFAULT_FONT_NAME),
    fontSize,
    primaryColour: style?.primaryColour ?? MEDIA_CAPTION.DEFAULT_PRIMARY_COLOUR,
    highlightColour: style?.highlightColour ?? MEDIA_CAPTION.CHUNKS.HIGHLIGHT_COLOUR,
    outlineColour: style?.outlineColour ?? MEDIA_CAPTION.DEFAULT_OUTLINE_COLOUR,
    outline: style?.outline ?? Math.max(1, Math.round(fontSize / 16)),
    shadow: style?.shadow ?? (chunks ? MEDIA_CAPTION.CHUNKS.SHADOW : MEDIA_CAPTION.DEFAULT_SHADOW),
    bold: style?.bold ?? (chunks ? MEDIA_CAPTION.CHUNKS.BOLD : MEDIA_CAPTION.DEFAULT_BOLD),
    uppercase:
      style?.uppercase ?? (chunks ? MEDIA_CAPTION.CHUNKS.UPPERCASE : MEDIA_CAPTION.DEFAULT_UPPERCASE),
    alignment: MEDIA_CAPTION.ALIGNMENT_BY_POSITION[position],
    marginV:
      style?.marginV ?? Math.round(height * MEDIA_CAPTION.MARGIN_V_HEIGHT_RATIO[position]),
    marginH: Math.round(
      width *
        (chunks ? MEDIA_CAPTION.CHUNKS.MARGIN_H_WIDTH_RATIO : MEDIA_CAPTION.MARGIN_H_WIDTH_RATIO),
    ),
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
  style: CAPTION_STYLE_RESOLVED,
  width: number,
): WRAP_OPTIONS {
  const usableWidth = width - 2 * style.marginH;
  const fitted = Math.floor(usableWidth / (style.fontSize * MEDIA_CAPTION.CHAR_WIDTH_RATIO));
  return {
    maxCharsPerLine:
      wrap?.maxCharsPerLine ??
      Math.min(
        MEDIA_CAPTION.MAX_CHARS_PER_LINE,
        Math.max(MEDIA_CAPTION.MIN_CHARS_PER_LINE, fitted),
      ),
    maxLinesPerCue: wrap?.maxLinesPerCue ?? MEDIA_CAPTION.DEFAULT_MAX_LINES_PER_CUE,
    uppercase: style.uppercase,
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
 * The `chunks` preset needs word timings, so it applies to transcribed
 * captions; supplied `subtitles` (no word timings) render as `lines`. The same
 * holds for `script: "roman"`, which rewrites transcribed words one for one.
 *
 * Content-agnostic: nothing here knows what a Short is. The Shorts-shaped
 * choices live in `MEDIA_CAPTION`'s defaults, which any caller can override.
 */
export async function captionVideo(
  request: MEDIA_CAPTION_REQUEST_PARSED,
): Promise<MEDIA_CAPTION_RESPONSE> {
  assertPersistentDisk(MEDIA_ERROR_MESSAGES.VERCEL);

  const { videoSource, subtitles, language, model, burn, script } = request;

  const resolved = await resolveMediaSource(videoSource);

  try {
    await mkdir(MEDIA_CAPTION_OUTPUT_DIR, { recursive: true });
    const probe = await probeMediaStreams(resolved.path);
    if (burn && !probe.hasVideo) {
      throw new Error(MEDIA_ERROR_MESSAGES.CAPTION_NO_VIDEO);
    }
    const width = probe.width ?? MEDIA_CAPTION.FALLBACK_WIDTH;
    const height = probe.height ?? MEDIA_CAPTION.FALLBACK_HEIGHT;
    const style = resolveStyle(request.style, width, height);
    const wrap = resolveWrap(request.wrap, style, width);

    let cues: CAPTION_CUE[];
    let chunks: CAPTION_CHUNK[] | undefined;
    let source: "transcribed" | "provided";
    let detectedLanguage: string | undefined;
    let romanized = false;
    let scriptFallbackReason: string | undefined;

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
        // Captioning what Whisper only imagined (a looped phrase, words over
        // music) puts garbage on screen, so those spans are left out.
        const reliable = dropUnreliableSpans(groq.segments ?? [], groq.words ?? []);
        let segments = reliable.segments;
        let words = reliable.words;

        if (script === "roman" && words.length > 0) {
          const result = await romanizeWords(words);
          words = result.words;
          romanized = result.romanized;
          scriptFallbackReason = result.fallbackReason;
          if (romanized) {
            // `lines` builds cues from segment text, so it has to be the
            // rewritten words too — same words, same count, same timings.
            segments = segments.map((segment) => {
              const spoken = words.filter(
                (w) => w.start >= segment.start - 0.01 && w.end <= segment.end + 0.01,
              );
              return spoken.length > 0 ? { ...segment, text: spoken.map((w) => w.word).join(" ") } : segment;
            });
          }
        }

        if (style.preset === "chunks" && words.length > 0) {
          chunks = buildWordChunks(words, {
            maxWords: MEDIA_CAPTION.CHUNKS.MAX_WORDS,
            maxChars: MEDIA_CAPTION.CHUNKS.MAX_CHARS,
            breakGapSeconds: MEDIA_CAPTION.CHUNKS.BREAK_GAP_SECONDS,
            holdSeconds: MEDIA_CAPTION.CHUNKS.HOLD_SECONDS,
            uppercase: style.uppercase,
          });
          cues = chunksToCues(chunks);
        } else {
          cues = buildCues(segments, words, wrap);
        }
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
      const ass = chunks
        ? chunksToAss(chunks, style, width, height)
        : cuesToAss(cues, style, width, height);
      await writeFile(assPath, ass, "utf8");
      captionedPath = join(MEDIA_CAPTION_OUTPUT_DIR, `${stem}.mp4`);
      await burnCaptions(resolved.path, assPath, captionedPath);
    }

    return {
      captionedPath,
      subtitlePath,
      cueCount: cues.length,
      source,
      language: detectedLanguage,
      ...(romanized ? { script: "roman" as const } : {}),
      ...(scriptFallbackReason ? { scriptFallbackReason } : {}),
      durationSeconds: probe.durationSeconds,
    };
  } finally {
    await cleanupResolvedMediaSource(resolved);
  }
}
