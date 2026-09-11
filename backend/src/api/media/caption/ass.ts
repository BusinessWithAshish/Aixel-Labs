import { MEDIA_CAPTION } from "../constants";
import type { CAPTION_CUE } from "./cues";
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
  const marginH = Math.round(width * MEDIA_CAPTION.MARGIN_H_WIDTH_RATIO);
  const styleLine = [
    "Default",
    style.fontName,
    String(style.fontSize),
    toAssColour(style.primaryColour),
    "&H000000FF",
    toAssColour(style.outlineColour),
    "&H00000000",
    style.bold ? "1" : "0",
    "0", "0", "0",
    "100", "100", "0", "0",
    "1",                        // BorderStyle 1 = outline + shadow
    String(style.outline),
    String(style.shadow),
    String(style.alignment),
    String(marginH),
    String(marginH),
    String(style.marginV),
    "1",
  ].join(",");

  const events = cues
    .map(
      (cue) =>
        `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${escapeAssText(cue.lines)}`,
    )
    .join("\n");

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
