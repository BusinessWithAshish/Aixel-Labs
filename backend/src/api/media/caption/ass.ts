import { MEDIA_CAPTION } from "../constants";
import type { CAPTION_CHUNK, CAPTION_CUE } from "./cues";
import type { CAPTION_STYLE_RESOLVED } from "./types";

/** `#RRGGBB` -> ASS `&HAABBGGRR` (byte-reversed, alpha first, 00 = opaque). */
function toAssColour(hex: string): string {
  const c = hex.replace(/^#/, "");
  return `&H00${c.slice(4, 6)}${c.slice(2, 4)}${c.slice(0, 2)}`.toUpperCase();
}

/** ASS timestamps are `H:MM:SS.cc` — one hour digit, centiseconds, not milliseconds. */
function assTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${Math.floor(cs / 360_000)}:` +
    `${pad(Math.floor((cs % 360_000) / 6000))}:` +
    `${pad(Math.floor((cs % 6000) / 100))}.` +
    `${pad(cs % 100)}`
  );
}

/**
 * `{`/`}` open and close ASS override blocks, so unescaped braces in speech
 * silently swallow the rest of the line. Replaced with lookalikes rather than
 * dropped: a transcript that genuinely said "{" should still show something.
 */
function escapeAssText(lines: string[]): string {
  return lines
    .map((line) => line.replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, " "))
    .join("\\N");
}

/**
 * Render cues as a complete ASS subtitle document.
 *
 * We author ASS rather than handing libass an SRT plus `force_style` for one
 * reason: **font size**. An SRT carries no resolution, so libass falls back to
 * a default script height (a few hundred pixels) and then scales everything up
 * to the real frame — turning `FontSize=48` into roughly 320px of text on a
 * 1920-tall video. Declaring `PlayResX`/`PlayResY` as the actual frame size
 * makes every measurement here mean exactly what it says in real pixels.
 *
 * `ScaledBorderAndShadow: yes` keeps the outline proportional to the text
 * instead of a fixed hairline once the player rescales the video.
 *
 * `WrapStyle: 0` (libass smart wrapping) is a safety net, not the primary
 * mechanism: lines are already broken to fit by `cues.ts`. It only matters
 * when a line still overflows — unusually wide glyphs, a caller-supplied font
 * — and the alternative, `WrapStyle: 2`, silently runs the text off both
 * edges of the frame rather than wrapping it.
 */
export function cuesToAss(
  cues: CAPTION_CUE[],
  style: CAPTION_STYLE_RESOLVED,
  width: number,
  height: number,
): string {
  const events = cues.map(
    (cue) =>
      `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${escapeAssText(cue.lines)}`,
  );
  return assDocument(style, width, height, events);
}

/** `#RRGGBB` -> the inline override form `&HBBGGRR&`. */
function toInlineColour(hex: string): string {
  const c = hex.replace(/^#/, "");
  return `&H${c.slice(4, 6)}${c.slice(2, 4)}${c.slice(0, 2)}&`.toUpperCase();
}

/**
 * The `chunks` preset: one Dialogue per spoken word. Each shows the whole
 * chunk with that word recoloured, so the highlight steps word by word while
 * the chunk stays put. The first word's event also slides the chunk up into
 * place and fades it in; the rest are pinned at the same spot, so only a new
 * chunk animates.
 */
export function chunksToAss(
  chunks: CAPTION_CHUNK[],
  style: CAPTION_STYLE_RESOLVED,
  width: number,
  height: number,
): string {
  const { ENTRY_RISE_HEIGHT_RATIO, ENTRY_MOVE_MS, ENTRY_FADE_MS } = MEDIA_CAPTION.CHUNKS;
  const x = Math.round(width / 2);
  const y = height - style.marginV;
  const rise = Math.round(height * ENTRY_RISE_HEIGHT_RATIO);
  const highlight = toInlineColour(style.highlightColour);
  const base = toInlineColour(style.primaryColour);

  const events = chunks.flatMap((chunk) =>
    chunk.words.map((word, i) => {
      const end = i + 1 < chunk.words.length ? chunk.words[i + 1].start : chunk.end;
      const place =
        i === 0
          ? `{\\an2\\move(${x},${y + rise},${x},${y},0,${ENTRY_MOVE_MS})\\fad(${ENTRY_FADE_MS},0)}`
          : `{\\an2\\pos(${x},${y})}`;
      const text = chunk.words
        .map((w, j) => {
          const escaped = escapeAssText([w.text]);
          return j === i ? `{\\c${highlight}}${escaped}{\\c${base}}` : escaped;
        })
        .join(" ");
      return `Dialogue: 0,${assTime(word.start)},${assTime(Math.max(end, word.start + MEDIA_CAPTION.CHUNKS.MIN_STEP_SECONDS))},Default,,0,0,0,,${place}${text}`;
    }),
  );
  return assDocument(style, width, height, events);
}

function assDocument(
  style: CAPTION_STYLE_RESOLVED,
  width: number,
  height: number,
  eventLines: string[],
): string {
  const styleLine = [
    "Default",
    style.fontName,
    String(style.fontSize),
    toAssColour(style.primaryColour),
    "&H000000FF",
    toAssColour(style.outlineColour),
    // BackColour is the shadow's colour: half-transparent black reads as a soft drop shadow.
    style.shadow > 0 ? MEDIA_CAPTION.SHADOW_BACK_COLOUR : "&H00000000",
    style.bold ? "1" : "0",
    "0", "0", "0",
    "100", "100", "0", "0",
    "1",                        // BorderStyle 1 = outline + shadow
    String(style.outline),
    String(style.shadow),
    String(style.alignment),
    String(style.marginH),
    String(style.marginH),
    String(style.marginV),
    "1",
  ].join(",");
  const events = eventLines.join("\n");

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${styleLine}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}
