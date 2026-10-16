import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import { assertPersistentDisk } from "../../../config";
import { AIXEL_MEDIA } from "../../../media";
import { MEDIA, MEDIA_ASPECT_RATIO_DIMENSIONS, MEDIA_ERROR_MESSAGES } from "../constants";
import { cuesToSrt, type CAPTION_CUE } from "../caption/cues";
import { probeAudioSeconds, probeMediaStreams } from "../cut/ffmpeg-cut";
import { round3 } from "../narrate/audio";
import { MEDIA_ASSEMBLE, MEDIA_ASSEMBLE_ERRORS } from "./constants";
import type { ASSEMBLED_SENTENCE, MEDIA_ASSEMBLE_REQUEST, MEDIA_ASSEMBLE_RESPONSE } from "./types";

const execFileAsync = promisify(execFile);

type SLOT = {
  sentence: number;
  videoPath: string;
  videoStart: number;
  seconds: number;
  /** Seconds this slot's clip falls short of, to be filled by holding its last frame. */
  shortBy: number;
};

const f3 = (value: number) => value.toFixed(3);

async function checkedPath(path: string, root: string): Promise<string> {
  let resolved: string;
  try {
    resolved = await realpath(path);
  } catch {
    throw new Error(`${MEDIA_ASSEMBLE_ERRORS.NOT_FOUND}: ${path}`);
  }
  if (!resolved.startsWith(root + sep)) throw new Error(`${MEDIA_ASSEMBLE_ERRORS.OUTSIDE_ROOT} (${root}/): ${path}`);
  if (!(await stat(resolved)).isFile()) throw new Error(`${MEDIA_ASSEMBLE_ERRORS.NOT_FOUND}: ${path}`);
  return resolved;
}

/**
 * Many phrase clips and one narration per sentence in, ONE finished recap out.
 *
 * Picture and sound are built from the same numbers, so they cannot drift:
 * every sentence is exactly its audio's length plus the pause, the pause is
 * silence on the audio and a held last frame on the picture, and a clip that
 * turns out shorter than its slot holds its last frame rather than pulling the
 * rest of the edit early. The source footage's own sound is dropped — the
 * narration is the only track.
 */
export async function assembleRecap(input: MEDIA_ASSEMBLE_REQUEST): Promise<MEDIA_ASSEMBLE_RESPONSE> {
  assertPersistentDisk(MEDIA_ERROR_MESSAGES.VERCEL);
  if (!ffmpegPath) throw new Error(MEDIA_ASSEMBLE_ERRORS.FFMPEG_FAILED);

  const root = await realpath(AIXEL_MEDIA.ROOT);
  const { outputWidth: width, outputHeight: height } = MEDIA_ASPECT_RATIO_DIMENSIONS[input.aspectRatio];

  const audioPaths: string[] = [];
  const audioSeconds: number[] = [];
  const slots: SLOT[] = [];
  const videoDurations = new Map<string, number>();

  for (let s = 0; s < input.sentences.length; s++) {
    const sentence = input.sentences[s];
    const audioPath = await checkedPath(sentence.audioPath, root);
    const seconds = await probeAudioSeconds(audioPath);
    if (!seconds || seconds <= 0) throw new Error(`${MEDIA_ASSEMBLE_ERRORS.NO_AUDIO}: ${sentence.audioPath}`);
    audioPaths.push(audioPath);
    audioSeconds.push(seconds);

    // Tile [0, audio]: a phrase's footage runs until the next one starts.
    let floor = 0;
    const starts = sentence.phrases.map((phrase, k) => {
      floor = Math.min(seconds, Math.max(floor, k === 0 ? 0 : phrase.startSeconds));
      return floor;
    });
    const sentenceSlots: SLOT[] = [];
    for (let k = 0; k < sentence.phrases.length; k++) {
      const phrase = sentence.phrases[k];
      const videoPath = await checkedPath(phrase.videoPath, root);
      if (!videoDurations.has(videoPath)) {
        videoDurations.set(videoPath, (await probeMediaStreams(videoPath)).durationSeconds);
      }
      const end = k + 1 < sentence.phrases.length ? starts[k + 1] : seconds;
      const slotSeconds = end - starts[k];
      const available = Math.max(0, videoDurations.get(videoPath)! - phrase.videoStartSeconds);
      sentenceSlots.push({
        sentence: s,
        videoPath,
        videoStart: phrase.videoStartSeconds,
        seconds: slotSeconds,
        shortBy: Math.max(0, slotSeconds - available),
      });
    }
    // Fold slots too short to show into the previous (or, first, the next) one.
    for (let k = 0; k < sentenceSlots.length && sentenceSlots.length > 1; k++) {
      if (sentenceSlots[k].seconds >= MEDIA_ASSEMBLE.MIN_SLOT_SECONDS) continue;
      const target = k > 0 ? sentenceSlots[k - 1] : sentenceSlots[k + 1];
      target.seconds += sentenceSlots[k].seconds;
      target.shortBy += sentenceSlots[k].shortBy;
      sentenceSlots.splice(k, 1);
      k = Math.max(-1, k - 2);
    }
    slots.push(...sentenceSlots);
  }

  // Inputs: every distinct video once, then every narration.
  const videoInputs = [...new Set(slots.map((slot) => slot.videoPath))];
  const videoIndex = new Map(videoInputs.map((path, i) => [path, i]));
  const audioBase = videoInputs.length;

  const lines: string[] = [];
  const sentenceVideoLabels: string[] = [];
  const sentenceAudioLabels: string[] = [];
  const sentences: ASSEMBLED_SENTENCE[] = [];
  let cursor = 0;
  const cues: { start: number; end: number; text: string }[] = [];

  for (let s = 0; s < input.sentences.length; s++) {
    const isLast = s === input.sentences.length - 1;
    const pause = isLast ? 0 : input.sentencePauseSeconds;
    const total = audioSeconds[s] + pause;
    const own = slots.filter((slot) => slot.sentence === s);

    const labels: string[] = [];
    own.forEach((slot, k) => {
      const label = `p${s}_${k}`;
      const hold = slot.shortBy > 0.02 ? `,tpad=stop_mode=clone:stop_duration=${f3(slot.shortBy + 0.1)}` : "";
      lines.push(
        `[${videoIndex.get(slot.videoPath)}:v]trim=start=${f3(slot.videoStart)}:duration=${f3(slot.seconds + slot.shortBy)},setpts=PTS-STARTPTS,fps=${MEDIA_ASSEMBLE.FPS}${hold},` +
          `trim=duration=${f3(slot.seconds)},setpts=PTS-STARTPTS,` +
          `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p[${label}]`,
      );
      labels.push(`[${label}]`);
    });
    const joined = `sv${s}`;
    lines.push(
      `${labels.join("")}concat=n=${labels.length}:v=1:a=0,` +
        `tpad=stop_mode=clone:stop_duration=${f3(pause + 0.1)},trim=duration=${f3(total)},setpts=PTS-STARTPTS[${joined}]`,
    );
    sentenceVideoLabels.push(`[${joined}]`);

    const audioLabel = `sa${s}`;
    lines.push(
      `[${audioBase + s}:a]aresample=${MEDIA_ASSEMBLE.AUDIO_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,` +
        `apad=whole_dur=${f3(total)},atrim=duration=${f3(total)},asetpts=PTS-STARTPTS[${audioLabel}]`,
    );
    sentenceAudioLabels.push(`[${audioLabel}]`);

    sentences.push({
      n: s + 1,
      startSeconds: round3(cursor),
      endSeconds: round3(cursor + audioSeconds[s]),
      audioSeconds: round3(audioSeconds[s]),
      heldSeconds: round3(own.reduce((sum, slot) => sum + slot.shortBy, 0)),
    });
    for (const phrase of input.sentences[s].phrases) {
      cues.push({
        start: cursor + phrase.startSeconds,
        end: cursor + Math.min(phrase.endSeconds, audioSeconds[s]),
        text: phrase.text,
      });
    }
    cursor += total;
  }

  lines.push(`${sentenceVideoLabels.join("")}concat=n=${sentenceVideoLabels.length}:v=1:a=0[v]`);
  lines.push(`${sentenceAudioLabels.join("")}concat=n=${sentenceAudioLabels.length}:v=0:a=1[a]`);

  await mkdir(AIXEL_MEDIA.MEDIA_ASSEMBLED, { recursive: true });
  const id = randomUUID();
  const outputPath = join(AIXEL_MEDIA.MEDIA_ASSEMBLED, `recap-${id}.mp4`);
  const scriptPath = join(AIXEL_MEDIA.MEDIA_ASSEMBLED, `.graph-${id}.txt`);
  await writeFile(scriptPath, lines.join(";\n"), "utf8");

  const args = ["-y", "-hide_banner", "-nostats", "-loglevel", "error"];
  for (const path of videoInputs) args.push("-i", path);
  for (const path of audioPaths) args.push("-i", path);
  args.push(
    "-filter_complex_script",
    scriptPath,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    MEDIA.FFMPEG_VIDEO_CODEC,
    "-preset",
    MEDIA.FFMPEG_PRESET,
    "-crf",
    MEDIA.FFMPEG_CRF,
    "-r",
    String(MEDIA_ASSEMBLE.FPS),
    "-c:a",
    MEDIA.FFMPEG_AUDIO_CODEC,
    "-b:a",
    MEDIA_ASSEMBLE.AUDIO_BITRATE,
    "-movflags",
    "+faststart",
    outputPath,
  );
  try {
    await execFileAsync(ffmpegPath, args, { maxBuffer: 64 * 1024 * 1024, timeout: MEDIA_ASSEMBLE.TIMEOUT_MS });
  } catch (err) {
    const { stderr, message } = err as { stderr?: string; message?: string };
    const detail = stderr?.trim().split("\n").slice(-4).join(" | ") ?? message ?? "unknown error";
    throw new Error(`${MEDIA_ASSEMBLE_ERRORS.FFMPEG_FAILED}: ${detail}`);
  } finally {
    await rm(scriptPath, { force: true });
  }

  // One cue per phrase, never overlapping the next.
  const srt = cuesToSrt(
    cues.map((cue, i): CAPTION_CUE => {
      const next = cues[i + 1];
      const end = Math.max(cue.start + 0.05, next ? Math.min(cue.end, next.start) : cue.end);
      return { start: cue.start, end, lines: [cue.text] };
    }),
  );
  const subtitlesPath = join(AIXEL_MEDIA.MEDIA_ASSEMBLED, `recap-${id}.srt`);
  await writeFile(subtitlesPath, srt, "utf8");

  const probe = await probeMediaStreams(outputPath);
  const audioOut = await probeAudioSeconds(outputPath);
  return {
    outputPath,
    durationSeconds: Math.round(probe.durationSeconds * 100) / 100,
    videoSeconds: Math.round(probe.durationSeconds * 100) / 100,
    audioSeconds: Math.round((audioOut ?? 0) * 100) / 100,
    width: probe.width ?? width,
    height: probe.height ?? height,
    sentences,
    subtitlesPath,
    cueCount: cues.length,
  };
}
