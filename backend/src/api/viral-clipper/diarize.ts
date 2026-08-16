import { rm } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

import { parseTimestampToSeconds } from "./boundary-snap";
import {
  VIRAL_CLIPPER,
  VIRAL_CLIPPER_DIARIZATION_CONTINUATION_PROMPT_HEADER,
  VIRAL_CLIPPER_DIARIZATION_PROMPT,
} from "./constants";
import { downloadBlobToTempFile } from "./download";
import { cutAudioSegment, getMediaDurationSeconds } from "./ffmpeg-cut";
import {
  generateStructuredContent,
  uploadFileToGemini,
  waitForGeminiFileActive,
  withGeminiKeyPoolRetry,
} from "./gemini-client";
import { DIARIZED_TRANSCRIPT_SCHEMA, GEMINI_DIARIZATION_RESPONSE_SCHEMA } from "./schemas";
import type {
  VIRAL_CLIPPER_DIARIZE_RESPONSE,
  DIARIZED_SEGMENT,
  DIARIZED_SPEAKER,
  DIARIZED_TRANSCRIPT,
  GEMINI_USAGE_METADATA,
} from "./types";
import { formatSecondsAsTimestamp } from "./youtube-metadata";

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
};

function guessAudioMimeType(path: string): string {
  return AUDIO_MIME_BY_EXT[extname(path).toLowerCase()] ?? "audio/mpeg";
}

async function uploadAndWaitActive(filePath: string, apiKey: string) {
  const uploaded = await uploadFileToGemini(filePath, guessAudioMimeType(filePath), apiKey);
  return waitForGeminiFileActive(uploaded.name, apiKey);
}

function emptyUsage(): GEMINI_USAGE_METADATA {
  return {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    thoughtsTokenCount: 0,
    totalTokenCount: 0,
  };
}

function addUsage(a: GEMINI_USAGE_METADATA, b: GEMINI_USAGE_METADATA): GEMINI_USAGE_METADATA {
  return {
    promptTokenCount: (a.promptTokenCount ?? 0) + (b.promptTokenCount ?? 0),
    candidatesTokenCount: (a.candidatesTokenCount ?? 0) + (b.candidatesTokenCount ?? 0),
    thoughtsTokenCount: (a.thoughtsTokenCount ?? 0) + (b.thoughtsTokenCount ?? 0),
    totalTokenCount: (a.totalTokenCount ?? 0) + (b.totalTokenCount ?? 0),
  };
}

/** Numeric suffix of an id like "speaker_3" -> 3, or 0 if it doesn't parse. */
function speakerIndexOf(id: string): number {
  const match = /speaker_(\d+)/.exec(id);
  return match ? Number(match[1]) : 0;
}

/** Highest numeric suffix among a set of speaker ids — 0 if none parse. */
function maxSpeakerIndex(speakers: { id: string }[]): number {
  return speakers.reduce((max, s) => Math.max(max, speakerIndexOf(s.id)), 0);
}

/** A single Gemini diarization call's raw result — chunk-relative timestamps, not yet offset. */
type ChunkDiarizeResult = {
  segments: DIARIZED_SEGMENT[];
  speakers: DIARIZED_SPEAKER[];
  usage: GEMINI_USAGE_METADATA;
};

async function diarizeChunkFirst(
  chunkPath: string,
  model: string,
  chunkLabel: string,
): Promise<ChunkDiarizeResult> {
  return withGeminiKeyPoolRetry(async (apiKey) => {
    const active = await uploadAndWaitActive(chunkPath, apiKey);
    const { data, usage } = await generateStructuredContent<DIARIZED_TRANSCRIPT>({
      model,
      parts: [
        { file_data: { mime_type: active.mimeType, file_uri: active.uri } },
        { text: VIRAL_CLIPPER_DIARIZATION_PROMPT },
      ],
      responseSchema: GEMINI_DIARIZATION_RESPONSE_SCHEMA,
      thinkingLevel: "minimal",
      apiKey,
      zodValidator: DIARIZED_TRANSCRIPT_SCHEMA,
    });
    return { segments: data.segments, speakers: data.speakers, usage };
  }, chunkLabel);
}

type ReferenceClip = { path: string; guessedIdentity?: string };

async function diarizeChunkContinuation(
  chunkPath: string,
  model: string,
  referenceClips: Map<string, ReferenceClip>,
  nextSpeakerIndex: number,
  chunkLabel: string,
): Promise<ChunkDiarizeResult> {
  const knownIds = [...referenceClips.keys()].slice(0, VIRAL_CLIPPER.MAX_REFERENCE_SPEAKERS);

  const referenceList = knownIds
    .map((id, i) => {
      const identity = referenceClips.get(id)?.guessedIdentity;
      return `Reference clip ${i + 1} = ${id}${identity ? ` (guessed identity: ${identity})` : ""}`;
    })
    .join("\n");

  const nextSpeakerId = `speaker_${nextSpeakerIndex}`;
  const prompt = VIRAL_CLIPPER_DIARIZATION_CONTINUATION_PROMPT_HEADER.replace(
    "{{REFERENCE_LIST}}",
    referenceList,
  ).replace(/{{NEXT_SPEAKER_ID}}/g, nextSpeakerId);

  return withGeminiKeyPoolRetry(async (apiKey) => {
    // All uploads for one attempt MUST share the same apiKey — a file
    // uploaded with key A can't be referenced with key B (different Google
    // Cloud projects) — so this whole block runs inside the retry callback,
    // not just the final generateContent call.
    const [refActives, mainActive] = await Promise.all([
      Promise.all(
        knownIds.map((id) => uploadAndWaitActive(referenceClips.get(id)!.path, apiKey)),
      ),
      uploadAndWaitActive(chunkPath, apiKey),
    ]);

    const { data, usage } = await generateStructuredContent<DIARIZED_TRANSCRIPT>({
      model,
      parts: [
        ...refActives.map((active) => ({
          file_data: { mime_type: active.mimeType, file_uri: active.uri },
        })),
        { file_data: { mime_type: mainActive.mimeType, file_uri: mainActive.uri } },
        { text: prompt },
      ],
      responseSchema: GEMINI_DIARIZATION_RESPONSE_SCHEMA,
      thinkingLevel: "minimal",
      apiKey,
      zodValidator: DIARIZED_TRANSCRIPT_SCHEMA,
    });
    return { segments: data.segments, speakers: data.speakers, usage };
  }, chunkLabel);
}

/**
 * Extracts a short reference clip (VIRAL_CLIPPER.REFERENCE_CLIP_SECONDS) for each
 * speaker in `speakers` that doesn't already have one, from that speaker's
 * longest segment in `segments` (chunk-relative timestamps) — a longer
 * segment carries a cleaner voice fingerprint than a short one. Caps at
 * VIRAL_CLIPPER.MAX_REFERENCE_SPEAKERS total across the whole episode.
 */
async function ensureReferenceClips(
  chunkPath: string,
  tempDir: string,
  segments: DIARIZED_SEGMENT[],
  speakers: DIARIZED_SPEAKER[],
  referenceClips: Map<string, ReferenceClip>,
): Promise<void> {
  for (const speaker of speakers) {
    if (referenceClips.has(speaker.id)) continue;
    if (referenceClips.size >= VIRAL_CLIPPER.MAX_REFERENCE_SPEAKERS) continue;

    const theirSegments = segments.filter((s) => s.speaker === speaker.id);
    if (theirSegments.length === 0) continue;

    const longest = theirSegments.reduce((best, s) => {
      const bestDur = parseTimestampToSeconds(best.end) - parseTimestampToSeconds(best.start);
      const sDur = parseTimestampToSeconds(s.end) - parseTimestampToSeconds(s.start);
      return sDur > bestDur ? s : best;
    });

    const segStart = parseTimestampToSeconds(longest.start);
    const segDur = parseTimestampToSeconds(longest.end) - segStart;
    const clipDur = Math.min(VIRAL_CLIPPER.REFERENCE_CLIP_SECONDS, segDur);
    if (clipDur <= 0) continue;
    const clipStart = segStart + Math.max(0, (segDur - clipDur) / 2);

    const refPath = join(tempDir, `ref-${speaker.id}.m4a`);
    await cutAudioSegment(chunkPath, clipStart, clipDur, refPath);
    referenceClips.set(speaker.id, { path: refPath, guessedIdentity: speaker.guessed_identity });
  }
}

/**
 * Splits `sourcePath` into sequential VIRAL_CLIPPER.CHUNK_DURATION_SECONDS audio
 * chunks and diarizes each with its own Gemini call — required because a
 * single call has a hard ~65536-token ceiling (thinking + output combined,
 * confirmed not tunable away, see VIRAL_CLIPPER.CHUNK_DURATION_SECONDS in
 * constants.ts) that a long episode's transcript exceeds. Speaker identity
 * is kept consistent across chunks by feeding each chunk (after the first)
 * a short reference-voice clip per already-known speaker and having Gemini
 * voice-match against them, rather than assuming any fixed speaking order.
 * This is best-effort, not guaranteed — see viral-clipper/README.md.
 */
async function diarizeChunked(
  sourcePath: string,
  tempDir: string,
  totalDurationSeconds: number,
  model: string,
): Promise<VIRAL_CLIPPER_DIARIZE_RESPONSE> {
  const chunkStarts: number[] = [];
  for (let t = 0; t < totalDurationSeconds; t += VIRAL_CLIPPER.CHUNK_DURATION_SECONDS) {
    chunkStarts.push(t);
  }

  const allSegments: DIARIZED_SEGMENT[] = [];
  const speakerTalkTime = new Map<string, number>();
  const speakerIdentity = new Map<string, string | undefined>();
  const referenceClips = new Map<string, ReferenceClip>();
  let usage = emptyUsage();
  let nextSpeakerIndex = 1;

  for (let i = 0; i < chunkStarts.length; i++) {
    const startSec = chunkStarts[i];
    const durationSec = Math.min(
      VIRAL_CLIPPER.CHUNK_DURATION_SECONDS,
      totalDurationSeconds - startSec,
    );
    const chunkPath = join(tempDir, `chunk-${i}.m4a`);
    await cutAudioSegment(sourcePath, startSec, durationSec, chunkPath);

    const chunkLabel = `chunk ${i + 1}/${chunkStarts.length} (${formatSecondsAsTimestamp(startSec)})`;
    const result =
      i === 0
        ? await diarizeChunkFirst(chunkPath, model, chunkLabel)
        : await diarizeChunkContinuation(
            chunkPath,
            model,
            referenceClips,
            nextSpeakerIndex,
            chunkLabel,
          );

    usage = addUsage(usage, result.usage);
    nextSpeakerIndex = Math.max(nextSpeakerIndex, maxSpeakerIndex(result.speakers) + 1);

    // Gemini estimates each segment's timestamp from audio content/pacing
    // cues, not a true frame-accurate clock — observed (2026-08-12) to
    // overshoot a chunk's own known duration by 30%+ on some chunks (e.g. a
    // real 900s chunk internally timestamped up to ~1200s). Since the
    // chunk's true duration is exact (we cut it), rescale proportionally
    // when Gemini overshoots it. Never stretch on undershoot — the chunk
    // simply having less speech near the end (trailing silence) is a valid,
    // different case that a stretch would wrongly "fix". This is a linear
    // heuristic (assumes drift is roughly uniform across the chunk, not
    // concentrated in one spot) — a real improvement, not a guarantee.
    const maxReportedEnd = Math.max(
      0,
      ...result.segments.map((s) => parseTimestampToSeconds(s.end)),
    );
    const scaleFactor = maxReportedEnd > durationSec ? durationSec / maxReportedEnd : 1;

    const scaledSegments: DIARIZED_SEGMENT[] = result.segments.map((seg) => ({
      ...seg,
      start: formatSecondsAsTimestamp(parseTimestampToSeconds(seg.start) * scaleFactor),
      end: formatSecondsAsTimestamp(parseTimestampToSeconds(seg.end) * scaleFactor),
    }));

    for (const seg of scaledSegments) {
      allSegments.push({
        ...seg,
        start: formatSecondsAsTimestamp(parseTimestampToSeconds(seg.start) + startSec),
        end: formatSecondsAsTimestamp(parseTimestampToSeconds(seg.end) + startSec),
      });
    }

    for (const sp of result.speakers) {
      speakerTalkTime.set(
        sp.id,
        (speakerTalkTime.get(sp.id) ?? 0) + (sp.talk_time_seconds_estimate ?? 0),
      );
      if (!speakerIdentity.get(sp.id) && sp.guessed_identity) {
        speakerIdentity.set(sp.id, sp.guessed_identity);
      }
    }

    // Uses the scale-corrected (not raw) timestamps too — a reference clip
    // extracted using a drifted chunk-relative timestamp could seek past
    // the chunk audio's actual end (or land in the wrong spot) and produce
    // a bad reference clip.
    await ensureReferenceClips(
      chunkPath,
      tempDir,
      scaledSegments,
      result.speakers,
      referenceClips,
    );
  }

  const speakers: DIARIZED_SPEAKER[] = [...speakerTalkTime.keys()]
    .sort((a, b) => speakerIndexOf(a) - speakerIndexOf(b))
    .map((id) => ({
      id,
      guessed_identity: speakerIdentity.get(id),
      talk_time_seconds_estimate: speakerTalkTime.get(id),
    }));

  return {
    transcript: {
      speaker_count: speakers.length,
      speakers,
      segments: allSegments,
    },
    usage,
  };
}

/**
 * Download -> (single call, or chunked if long — see VIRAL_CLIPPER.CHUNK_THRESHOLD_SECONDS)
 * -> diarize via Gemini generateContent.
 */
export async function diarizeFromBlobUrl(
  blobUrl: string,
  model: string,
): Promise<VIRAL_CLIPPER_DIARIZE_RESPONSE> {
  const sourcePath = await downloadBlobToTempFile(blobUrl);
  const tempDir = dirname(sourcePath);

  try {
    const durationSeconds = await getMediaDurationSeconds(sourcePath);

    if (durationSeconds <= VIRAL_CLIPPER.CHUNK_THRESHOLD_SECONDS) {
      const result = await diarizeChunkFirst(sourcePath, model, "single-call diarize");
      return {
        transcript: {
          speaker_count: result.speakers.length,
          speakers: result.speakers,
          segments: result.segments,
        },
        usage: result.usage,
      };
    }

    return await diarizeChunked(sourcePath, tempDir, durationSeconds, model);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
