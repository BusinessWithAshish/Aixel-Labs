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
import { maskProfanityInText, maskProfanityInWords } from "./profanity";
import {
  alignHeardToTimings,
  judgeWithClaude,
  listenWithGemini,
  whisperLanguageFor,
  type BASE_SEGMENT,
  type HEARD,
  type WITNESS,
} from "./listen";
import type {
  CAPTION_STYLE_RESOLVED,
  MEDIA_CAPTION_REQUEST_PARSED,
  MEDIA_CAPTION_RESPONSE,
} from "./types";

function chunkWords<T>(words: T[], size = 10): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < words.length; i += size) parts.push(words.slice(i, i + size));
  return parts;
}

/** Whisper's words as short timed lines, so a judge can see WHEN each stretch was said. */
function timedLines(words: Array<{ word: string; start: number; end: number }>): string {
  return chunkWords(words)
    .map((part) => `[${part[0].start.toFixed(1)}-${part[part.length - 1].end.toFixed(1)}] ${part.map((w) => w.word).join(" ")}`)
    .join("\n");
}

/** `verified`: below this share of words agreeing between the listener and Whisper, the judge decides. */
const MEDIA_CAPTION_VERIFY_MIN_AGREEMENT = 0.8;

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

  const { videoSource, subtitles, language, model, burn, script, channel, listener, maskProfanity } = request;
  const groqApiKey = resolveGroqKeyForChannel(channel);
  const geminiApiKey = resolveGeminiKeyForChannel(channel);

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
    let usedListener: "gemini" | "claude" | "whisper" | undefined;
    let witnessLabels: string[] | undefined;
    let unclearStretches: number | undefined;
    let listenerFallbackReason: string | undefined;
    let timingAnchoredShare: number | undefined;

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
        // The second listener goes first: what it hears decides the language
        // Whisper is asked for, and its text is the prompt that pulls
        // Whisper's spelling toward what was actually said.
        let heard: HEARD | undefined;
        if (listener === "gemini" || listener === "verified") {
          try {
            // Patient in both modes. Without a listener the judge can only work
            // from Whisper, and on a hard mixed clip that recovered barely half
            // the words (tested): waiting a minute for a busy listener is
            // worth far more than a fast answer with holes in it.
            heard = await listenWithGemini(normalized.path, geminiApiKey, true);
            usedListener = "gemini";
          } catch (err) {
            usedListener = "whisper";
            listenerFallbackReason = `second listener unavailable: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`;
          }
        }
        // Word timings are what let a cue appear exactly on its first word
        // instead of being apportioned by character count — see `cues.ts`.
        const groq = await transcribeWithGroq(normalized.path, {
          model,
          language: heard ? whisperLanguageFor(heard, language) : language,
          wordTimestamps: true,
          // No decoder prompt. Handing Whisper the listener's text to "help" it
          // made it skip 24 seconds of a 65-second clip outright — the words it
          // was told to expect, it stopped listening for — and every caption in
          // that stretch landed twenty seconds early.
          apiKey: groqApiKey,
        });
        detectedLanguage = heard?.language ?? groq.language;
        // Captioning what Whisper only imagined (a looped phrase, words over
        // music) puts garbage on screen, so those spans are left out. With a
        // second listener they stay: Whisper's text is not shown, only its
        // timings are used, and a dropped span is a stretch with no anchors.
        const reliable = heard
          ? { segments: groq.segments ?? [], words: groq.words ?? [] }
          : dropUnreliableSpans(groq.segments ?? [], groq.words ?? []);
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

        // Whisper's own words in the script they will be compared in: the clock
        // every other transcript is laid onto.
        const whisperWords = words;
        // `verified`: a second pass in the other language. On mixed speech each
        // pass understands what the other garbles, and between them they time
        // far more of the clip. Its text is also a witness for the judge.
        const otherLanguage = (groq.language ?? "").toLowerCase().startsWith("en") ? "hi" : "en";
        let other: Awaited<ReturnType<typeof transcribeWithGroq>> | undefined;
        let otherWords: typeof words = [];
        if (listener === "verified") {
          try {
            other = await transcribeWithGroq(normalized.path, {
              model,
              language: otherLanguage,
              wordTimestamps: true,
              apiKey: groqApiKey,
            });
            otherWords = other.words ?? [];
            if (script === "roman" && otherWords.length > 0) {
              otherWords = (await romanizeWords(otherWords, groqApiKey, geminiApiKey)).words;
            }
          } catch {
            other = undefined;
          }
        }
        const clocks = otherWords.length > 0 ? [whisperWords, otherWords] : [whisperWords];
        if (heard) {
          // Whisper's words (now in the same script as the listener's) are the
          // clock; the listener's words are what goes on screen.
          const aligned = alignHeardToTimings(heard, clocks, probe.durationSeconds ?? 0);
          words = aligned.words;
          timingAnchoredShare = Math.round(aligned.anchoredShare * 100) / 100;
          segments = heard.segments.map((s, id) => ({ id, start: s.start, end: s.end, text: s.text }));
        }

        // `verified`: when there is no listener, or it and Whisper agree on too
        // little of the clip to trust either, the transcripts go to a judge.
        const agreed = heard ? (timingAnchoredShare ?? 0) >= MEDIA_CAPTION_VERIFY_MIN_AGREEMENT : false;
        if (listener === "verified" && !agreed) {
          try {
            const witnesses: WITNESS[] = [];
            // The timeline the judge corrects: the listener's lines when there
            // is a listener, otherwise Whisper's own words in ten-word lines.
            const base: BASE_SEGMENT[] = heard
              ? heard.segments
              : chunkWords(whisperWords).map((part) => ({
                  start: part[0].start,
                  end: part[part.length - 1].end,
                  text: part.map((w) => w.word).join(" "),
                }));
            const baseLabel = heard
              ? "a model that listened to the audio with no language forced; usually the most accurate, but it can soften, skip or mishear words, and its times are only good to a second or two"
              : "speech recognition; it garbles stretches spoken in another language, but its times are exact";
            if (heard) {
              witnesses.push({
                label: `WHISPER (${groq.language ?? "auto"})`,
                note: "speech recognition; garbles stretches spoken in another language, but its times are exact",
                text: timedLines(whisperWords),
              });
            }
            witnesses.push({
              label: `WHISPER (${otherLanguage})`,
              note:
                otherLanguage === "en"
                  ? "the same audio forced to English: it TRANSLATES the Hindi parts, which you must not keep, but its English stretches are reliable"
                  : "the same audio forced to Hindi; its English stretches are unreliable",
              text:
                (other?.segments ?? []).map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text.trim()}`).join("\n") ||
                (other?.text ?? "(unavailable)"),
            });
            const judged = await judgeWithClaude(base, baseLabel, witnesses, probe.durationSeconds ?? 0);
            const aligned = alignHeardToTimings(judged.heard, clocks, probe.durationSeconds ?? 0);
            words = aligned.words;
            timingAnchoredShare = Math.round(aligned.anchoredShare * 100) / 100;
            segments = judged.heard.segments.map((s, id) => ({ id, start: s.start, end: s.end, text: s.text }));
            detectedLanguage = judged.heard.language;
            usedListener = "claude";
            listenerFallbackReason = undefined;
            witnessLabels = [heard ? "LISTENER" : "WHISPER timeline", ...witnesses.map((w) => w.label)];
            unclearStretches = judged.unclearStretches;
          } catch (err) {
            // The judge is the safety net, not a requirement: keep what there was.
            const why = (err instanceof Error ? err.message : String(err)).slice(0, 160);
            listenerFallbackReason = heard
              ? `listener and Whisper disagreed and the judge was unavailable (${why}); the listener's words were kept`
              : `no listener and no judge (${why}); these are Whisper's words alone`;
          }
        }

        if (maskProfanity) {
          words = maskProfanityInWords(words);
          segments = segments.map((s) => ({ ...s, text: maskProfanityInText(s.text) }));
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
      ...(usedListener ? { listener: usedListener } : {}),
      ...(listenerFallbackReason ? { listenerFallbackReason } : {}),
      ...(timingAnchoredShare !== undefined ? { timingAnchoredShare } : {}),
      ...(witnessLabels ? { witnesses: witnessLabels } : {}),
      ...(unclearStretches !== undefined ? { unclearStretches } : {}),
      durationSeconds: probe.durationSeconds,
    };
  } finally {
    await cleanupResolvedMediaSource(resolved);
  }
}
