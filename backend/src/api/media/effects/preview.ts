import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import { MEDIA_CAPTION, MEDIA_EFFECTS, MEDIA_ERROR_MESSAGES } from "../constants";
import { everyPresetChain } from "./grade";

const execFileAsync = promisify(execFile);

/** Escape a path for an `ass=` filter argument — see `caption/ffmpeg-caption.ts` for why it is doubled. */
function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, "\\\\\\\\").replace(/:/g, "\\\\:").replace(/'/g, "\\\\'");
}

async function runFfmpeg(args: string[], failure: string): Promise<void> {
  if (!ffmpegPath) throw new Error(failure);
  try {
    await execFileAsync(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 16 });
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? "";
    const detail = stderr.trim().split("\n").filter(Boolean).slice(-1)[0] ?? "";
    throw new Error(detail ? `${failure}: ${detail}` : failure);
  }
}

/** Even dimensions only — odd ones break yuv420p conversion downstream. */
function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/**
 * One ASS document labelling the finished sheet, rather than one per tile.
 *
 * Labels cannot go through `drawtext`: this backend's ffmpeg-static build has
 * no libfreetype, so `drawtext` is absent (checked — `ass` and `subtitles`
 * are present, which is how `caption` burns). libass is therefore the only
 * text renderer available, and one document with an absolute `\pos` per tile
 * is both cheaper and simpler than burning text into every tile separately.
 *
 * `PlayResX/Y` are the real sheet dimensions so every coordinate below is in
 * actual pixels — the same reason `caption/ass.ts` declares them.
 */
function labelDocument(
  labels: string[],
  columns: number,
  tileWidth: number,
  tileHeight: number,
  sheetWidth: number,
  sheetHeight: number,
): string {
  const fontSize = Math.round(tileWidth * MEDIA_EFFECTS.PREVIEW.LABEL_FONT_RATIO);
  const inset = Math.round(tileWidth * MEDIA_EFFECTS.PREVIEW.LABEL_INSET_RATIO);
  const events = labels.map((label, i) => {
    const x = (i % columns) * tileWidth + inset;
    const y = Math.floor(i / columns) * tileHeight + inset;
    // \an7 anchors the text box to its top-left, so \pos lands the corner of
    // the label exactly `inset` inside its own tile whatever the text length.
    return `Dialogue: 0,0:00:00.00,9:59:59.99,Default,,0,0,0,,{\\an7\\pos(${x},${y})}${label.toUpperCase()}`;
  });
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${sheetWidth}`,
    `PlayResY: ${sheetHeight}`,
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    `Style: Default,Anton,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,${Math.max(
      2,
      Math.round(fontSize / 8),
    )},0,7,0,0,0,1`,
    "",
    "[Events]",
    "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ...events,
  ].join("\n");
}

/**
 * Build one labelled contact sheet: the untreated frame first, then the same
 * frame through every built-in preset, tiled.
 *
 * Deliberately a still, not a video. A grade is a per-pixel decision and
 * comparing six of them side by side on one frame is the only way to see the
 * difference; six short clips played one after another compares each look
 * against memory instead of against the others.
 *
 * Three passes rather than one giant `split`-per-preset filtergraph: the frame
 * is decoded once, each tile is an independent render whose failure names its
 * own preset, and `xstack` joins them. On a single frame the extra process
 * spawns cost milliseconds, and a filtergraph with a dozen labelled branches
 * is the kind of string that is only ever debugged once.
 */
export async function buildPresetSheet(
  sourcePath: string,
  atSeconds: number,
  sourceWidth: number,
  sourceHeight: number,
  workDir: string,
  outputPath: string,
): Promise<void> {
  const failure = MEDIA_ERROR_MESSAGES.EFFECTS_PREVIEW_FAILED;
  await mkdir(workDir, { recursive: true });

  const tileWidth = even(MEDIA_EFFECTS.PREVIEW.TILE_WIDTH);
  const tileHeight = even((tileWidth * sourceHeight) / sourceWidth);

  // One decode, seeking before -i so ffmpeg jumps rather than decoding up to `at`.
  const framePath = join(workDir, "frame.png");
  await runFfmpeg(
    [
      "-y",
      "-ss", atSeconds.toFixed(3),
      "-i", sourcePath,
      "-frames:v", "1",
      "-vf", `scale=${tileWidth}:${tileHeight}`,
      "-pix_fmt", "rgb24",
      framePath,
    ],
    failure,
  );

  const presets = everyPresetChain();
  const labels = [MEDIA_EFFECTS.PREVIEW.ORIGINAL_LABEL, ...presets.map((p) => p.name)];

  const tilePaths: string[] = [];
  for (const [index, label] of labels.entries()) {
    const tilePath = join(workDir, `tile-${index}.png`);
    const chain = index === 0 ? null : presets[index - 1].filters.join(",");
    await runFfmpeg(
      [
        "-y",
        "-i", framePath,
        ...(chain ? ["-vf", chain] : []),
        "-pix_fmt", "rgb24",
        tilePath,
      ],
      `${failure} (${label})`,
    );
    tilePaths.push(tilePath);
  }

  // xstack needs every slot filled, so a partial last row is padded with black
  // tiles. They carry no label, which is what makes them read as padding.
  const columns = Math.min(MEDIA_EFFECTS.PREVIEW.COLUMNS, tilePaths.length);
  const rows = Math.ceil(tilePaths.length / columns);
  const slots = columns * rows;
  if (slots > tilePaths.length) {
    const padPath = join(workDir, "pad.png");
    await runFfmpeg(
      [
        "-y",
        "-f", "lavfi",
        "-i", `color=c=black:s=${tileWidth}x${tileHeight}`,
        "-frames:v", "1",
        "-pix_fmt", "rgb24",
        padPath,
      ],
      failure,
    );
    while (tilePaths.length < slots) tilePaths.push(padPath);
  }

  const sheetWidth = tileWidth * columns;
  const sheetHeight = tileHeight * rows;
  const assPath = join(workDir, "labels.ass");
  await writeFile(
    assPath,
    labelDocument(labels, columns, tileWidth, tileHeight, sheetWidth, sheetHeight),
    "utf8",
  );

  // Uniform tiles, so the layout is just each tile's top-left corner in pixels.
  const layout = tilePaths
    .map((_, i) => `${(i % columns) * tileWidth}_${Math.floor(i / columns) * tileHeight}`)
    .join("|");

  await runFfmpeg(
    [
      "-y",
      ...tilePaths.flatMap((path) => ["-i", path]),
      "-filter_complex",
      `xstack=inputs=${tilePaths.length}:layout=${layout}[sheet];` +
        `[sheet]ass='${escapeFilterPath(assPath)}':fontsdir='${escapeFilterPath(MEDIA_CAPTION.FONTS_DIR)}'`,
      "-frames:v", "1",
      outputPath,
    ],
    failure,
  );
}
