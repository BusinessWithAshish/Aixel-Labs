import { YOUTUBE_DEFAULT_COUNTRY } from "../../youtube/constants";
import { parseYoutubeVideoId } from "../../youtube/helpers";
import { YOUTUBE_TRANSCRIPT_DEFAULT_HL } from "../../youtube/transcript/constants";
import { fetchYoutubeVideoTranscript } from "../../youtube/transcript/helpers";
import type { YOUTUBE_TRANSCRIPT_LINE } from "../../youtube/transcript/types";
import { formatSecondsAsTimestamp } from "../../../utils/timestamp";
import {
  VIRAL_CLIPPER,
  VIRAL_CLIPPER_ERROR_MESSAGES,
  VIRAL_CLIPPER_GEMINI_MODEL,
} from "../constants";
import { VIRAL_CLIPPER_CAPTION_SPEAKER_LABEL_PROMPT } from "./constants";
import {
  generateStructuredContent,
  withGeminiKeyPoolRetry,
} from "../gemini-client";
import {
  GEMINI_CAPTION_SPEAKER_LABEL_SCHEMA,
  GEMINI_CAPTION_SPEAKER_LABEL_VALIDATOR,
} from "./schemas";
import type {
  DIARIZED_SEGMENT,
  DIARIZED_SPEAKER,
  DIARIZED_TRANSCRIPT,
  GEMINI_USAGE_METADATA,
  VIRAL_CLIPPER_DIARIZE_RESPONSE,
} from "../types";

/** YouTube ASR inserts `>>` at speaker-turn boundaries. The watch-page UI strips them. */
const SPEAKER_CHANGE_MARK = />>+/g;

/**
 * Manual caption style: `Raj Shamani: hello` / `Speaker 1: hello`.
 * One-word sentence starters ("Okay:", "So:") are ignored via NAME_STOP.
 */
const NAMED_SPEAKER_PREFIX =
  /^((?:Speaker\s*\d+)|(?:[A-Z][a-zA-Z.'-]{1,30}(?:\s+[A-Z][a-zA-Z.'-]{1,30}){0,3})):\s+([\s\S]*)$/;

const NAME_STOP = new Set([
  "Okay",
  "Alright",
  "Wait",
  "Yeah",
  "Yes",
  "No",
  "So",
  "And",
  "But",
  "Well",
  "Oh",
  "Um",
  "Uh",
  "Right",
  "Now",
  "Look",
  "Hey",
  "Hi",
  "Hello",
]);

type CaptionUtterance = {
  speakerId: string;
  guessedIdentity?: string;
  startMs: number;
  endMs: number;
  text: string;
};

type CaptionTurn = {
  startMs: number;
  endMs: number;
  text: string;
};

type CaptionSpeakerLabel = {
  speaker_count: number;
  speakers: Array<{ id: string; guessed_identity?: string }>;
  assignments: Array<{ i: number; speaker: string }>;
};

function stripChangeMarks(text: string): string {
  return text.replace(SPEAKER_CHANGE_MARK, " ").replace(/\s+/g, " ").trim();
}

function namedPrefix(text: string): { name: string; rest: string } | null {
  const match = NAMED_SPEAKER_PREFIX.exec(text);
  if (!match) return null;
  const name = match[1].trim();
  if (NAME_STOP.has(name)) return null;
  return { name, rest: match[2].trim() };
}

/** True when captions look like an authored speaker-labelled transcript, not ASR `>>` turns. */
function useNamedSpeakers(lines: YOUTUBE_TRANSCRIPT_LINE[]): boolean {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const named = namedPrefix(stripChangeMarks(line.text));
    if (!named) continue;
    counts.set(named.name, (counts.get(named.name) ?? 0) + 1);
  }
  let frequent = 0;
  for (const count of counts.values()) {
    if (count >= 3) frequent += 1;
  }
  return frequent >= 2;
}

function lineEndMs(line: YOUTUBE_TRANSCRIPT_LINE): number {
  return line.startMs + (line.durationMs ?? 0);
}

function splitOnSpeakerChange(text: string): Array<{ change: boolean; text: string }> {
  const trimmed = text.trim();
  const parts = trimmed.split(SPEAKER_CHANGE_MARK);
  const leadingChange = /^>>+/.test(trimmed);
  const out: Array<{ change: boolean; text: string }> = [];
  for (let i = 0; i < parts.length; i++) {
    const piece = parts[i].replace(/\s+/g, " ").trim();
    if (!piece) continue;
    out.push({ change: i > 0 || (i === 0 && leadingChange), text: piece });
  }
  return out;
}

function mergeConsecutive(utterances: CaptionUtterance[]): CaptionUtterance[] {
  const merged: CaptionUtterance[] = [];
  for (const u of utterances) {
    const last = merged[merged.length - 1];
    if (last && last.speakerId === u.speakerId) {
      last.endMs = Math.max(last.endMs, u.endMs);
      last.text = `${last.text} ${u.text}`.trim();
      continue;
    }
    merged.push({ ...u });
  }
  return merged;
}

function toDiarizedTranscript(utterances: CaptionUtterance[]): DIARIZED_TRANSCRIPT {
  const talkMs = new Map<string, number>();
  const identity = new Map<string, string | undefined>();
  const order: string[] = [];

  for (const u of utterances) {
    if (!talkMs.has(u.speakerId)) {
      order.push(u.speakerId);
      identity.set(u.speakerId, u.guessedIdentity);
    } else if (!identity.get(u.speakerId) && u.guessedIdentity) {
      identity.set(u.speakerId, u.guessedIdentity);
    }
    talkMs.set(u.speakerId, (talkMs.get(u.speakerId) ?? 0) + Math.max(0, u.endMs - u.startMs));
  }

  const speakers: DIARIZED_SPEAKER[] = order.map((id) => ({
    id,
    guessed_identity: identity.get(id),
    talk_time_seconds_estimate: Math.round((talkMs.get(id) ?? 0) / 1000),
  }));

  const segments: DIARIZED_SEGMENT[] = utterances.map((u) => ({
    speaker: u.speakerId,
    start: formatSecondsAsTimestamp(u.startMs / 1000),
    end: formatSecondsAsTimestamp(u.endMs / 1000),
    text: u.text,
  }));

  return { speaker_count: speakers.length, speakers, segments };
}

function fromNamedCaptions(lines: YOUTUBE_TRANSCRIPT_LINE[]): CaptionUtterance[] {
  const idByName = new Map<string, string>();
  const utterances: CaptionUtterance[] = [];
  let currentId: string | undefined;
  let currentName: string | undefined;

  for (const line of lines) {
    const stripped = stripChangeMarks(line.text);
    if (!stripped) continue;
    const named = namedPrefix(stripped);
    const text = named?.rest || stripped;
    if (!text) continue;

    if (named) {
      let id = idByName.get(named.name);
      if (!id) {
        id = `speaker_${idByName.size + 1}`;
        idByName.set(named.name, id);
      }
      currentId = id;
      currentName = named.name;
    } else if (!currentId) {
      currentId = "speaker_1";
    }

    utterances.push({
      speakerId: currentId,
      guessedIdentity: currentName,
      startMs: line.startMs,
      endMs: lineEndMs(line),
      text,
    });
  }

  return utterances;
}

/** Splits ASR captions on `>>` into unlabeled turns. Identity is not in YouTube data. */
export function extractAsrTurns(lines: YOUTUBE_TRANSCRIPT_LINE[]): CaptionTurn[] {
  const turns: CaptionTurn[] = [];
  for (const line of lines) {
    const pieces = splitOnSpeakerChange(line.text);
    for (const piece of pieces) {
      const last = turns[turns.length - 1];
      if (!last || piece.change) {
        turns.push({
          startMs: line.startMs,
          endMs: lineEndMs(line),
          text: piece.text,
        });
        continue;
      }
      last.endMs = Math.max(last.endMs, lineEndMs(line));
      last.text = `${last.text} ${piece.text}`.trim();
    }
  }
  return turns;
}

function formatTurnsForPrompt(turns: CaptionTurn[]): string {
  return turns
    .map((turn, i) => {
      const start = formatSecondsAsTimestamp(turn.startMs / 1000);
      const end = formatSecondsAsTimestamp(turn.endMs / 1000);
      return `[${i}] ${start}-${end} ${turn.text}`;
    })
    .join("\n");
}

function applyTurnLabels(
  turns: CaptionTurn[],
  labeled: CaptionSpeakerLabel,
): CaptionUtterance[] {
  const byIndex = new Map(labeled.assignments.map((a) => [a.i, a.speaker]));
  const identity = new Map(
    labeled.speakers.map((s) => [s.id, s.guessed_identity] as const),
  );
  let previous = labeled.speakers[0]?.id ?? "speaker_1";
  return turns.map((turn, i) => {
    const speakerId = byIndex.get(i) ?? previous;
    previous = speakerId;
    return {
      speakerId,
      guessedIdentity: identity.get(speakerId),
      startMs: turn.startMs,
      endMs: turn.endMs,
      text: turn.text,
    };
  });
}

async function labelAsrTurns(
  turns: CaptionTurn[],
  model: string,
  speakerCount?: number,
): Promise<{ labeled: CaptionSpeakerLabel; usage: GEMINI_USAGE_METADATA }> {
  const hint = speakerCount
    ? `- There are ${speakerCount} distinct speakers. Use speaker_1 through speaker_${speakerCount}. Do not add extras.\n`
    : "";
  const prompt = VIRAL_CLIPPER_CAPTION_SPEAKER_LABEL_PROMPT.replace(
    "{{MAX_SPEAKERS}}",
    String(VIRAL_CLIPPER.MAX_CAPTION_SPEAKERS),
  )
    .replace("{{SPEAKER_COUNT_HINT}}", hint)
    .replace("{{TURNS}}", formatTurnsForPrompt(turns));

  return withGeminiKeyPoolRetry(async (apiKey) => {
    const { data, usage } = await generateStructuredContent<CaptionSpeakerLabel>({
      model,
      parts: [{ text: prompt }],
      responseSchema: GEMINI_CAPTION_SPEAKER_LABEL_SCHEMA,
      thinkingLevel: "minimal",
      apiKey,
      zodValidator: GEMINI_CAPTION_SPEAKER_LABEL_VALIDATOR,
    });
    return { labeled: data, usage };
  }, "caption speaker label");
}

function emptyUsage(): GEMINI_USAGE_METADATA {
  return {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    thoughtsTokenCount: 0,
    totalTokenCount: 0,
  };
}

function singleSpeakerFromTurns(turns: CaptionTurn[]): CaptionUtterance[] {
  return turns.map((turn) => ({
    speakerId: "speaker_1",
    startMs: turn.startMs,
    endMs: turn.endMs,
    text: turn.text,
  }));
}

/** Maps YouTube caption lines into the viral-clipper DIARIZED_TRANSCRIPT shape.
 * Named `Name:` tracks keep N speakers. ASR without a Gemini pass is unlabeled turns
 * collapsed to speaker_1 — live `/diarize` uses `diarizeFromYoutubeCaptions` instead.
 */
export function youtubeCaptionsToDiarizedTranscript(
  lines: YOUTUBE_TRANSCRIPT_LINE[],
): DIARIZED_TRANSCRIPT {
  if (lines.length === 0) {
    throw new Error(`${VIRAL_CLIPPER_ERROR_MESSAGES.CAPTIONS_EMPTY}: no caption lines`);
  }

  const utterances = mergeConsecutive(
    useNamedSpeakers(lines)
      ? fromNamedCaptions(lines)
      : singleSpeakerFromTurns(extractAsrTurns(lines)),
  );
  if (utterances.length === 0) {
    throw new Error(`${VIRAL_CLIPPER_ERROR_MESSAGES.CAPTIONS_EMPTY}: no speech in captions`);
  }

  return toDiarizedTranscript(utterances);
}

/**
 * InnerTube captions → speaker-labelled transcript.
 * Named `Name:` tracks map 1:1 to N speakers with no model call.
 * ASR `>>` tracks get a Gemini *text* pass to assign speaker_1..N (no audio).
 */
export async function diarizeFromYoutubeCaptions(
  videoUrl: string,
  language: string = YOUTUBE_TRANSCRIPT_DEFAULT_HL,
  model: string = VIRAL_CLIPPER_GEMINI_MODEL.DEFAULT,
  speakerCount?: number,
): Promise<VIRAL_CLIPPER_DIARIZE_RESPONSE> {
  const videoId = parseYoutubeVideoId(videoUrl);
  if (!videoId) {
    throw new Error(
      `${VIRAL_CLIPPER_ERROR_MESSAGES.YOUTUBE_METADATA_FETCH_FAILED}: invalid YouTube URL`,
    );
  }

  const captions = await fetchYoutubeVideoTranscript({
    videoId,
    language,
    country: YOUTUBE_DEFAULT_COUNTRY,
  });

  if (captions.lines.length === 0) {
    throw new Error(`${VIRAL_CLIPPER_ERROR_MESSAGES.CAPTIONS_EMPTY}: no caption lines`);
  }

  if (useNamedSpeakers(captions.lines)) {
    const utterances = mergeConsecutive(fromNamedCaptions(captions.lines));
    if (utterances.length === 0) {
      throw new Error(`${VIRAL_CLIPPER_ERROR_MESSAGES.CAPTIONS_EMPTY}: no speech in captions`);
    }
    return {
      transcript: toDiarizedTranscript(utterances),
      usage: emptyUsage(),
      source: "youtube_captions",
    };
  }

  const turns = extractAsrTurns(captions.lines);
  if (turns.length === 0) {
    throw new Error(`${VIRAL_CLIPPER_ERROR_MESSAGES.CAPTIONS_EMPTY}: no speech in captions`);
  }

  if (turns.length === 1) {
    return {
      transcript: toDiarizedTranscript(singleSpeakerFromTurns(turns)),
      usage: emptyUsage(),
      source: "youtube_captions",
    };
  }

  const { labeled, usage } = await labelAsrTurns(turns, model, speakerCount);
  const utterances = mergeConsecutive(applyTurnLabels(turns, labeled));
  return {
    transcript: toDiarizedTranscript(utterances),
    usage,
    source: "youtube_captions",
  };
}

function selfCheck(): void {
  const turns = extractAsrTurns([
    { startMs: 0, durationMs: 2000, text: "hello from the host" },
    { startMs: 2000, durationMs: 1000, text: ">> thanks for having me" },
    { startMs: 3000, durationMs: 1000, text: "and another thought" },
    { startMs: 4000, durationMs: 1000, text: ">> wait what" },
  ]);
  if (turns.length !== 3) throw new Error(`expected 3 ASR turns, got ${turns.length}`);
  if (!turns[1].text.includes("another thought")) {
    throw new Error("continuation line should stay on the current turn");
  }

  const labeled = applyTurnLabels(turns, {
    speaker_count: 3,
    speakers: [
      { id: "speaker_1", guessed_identity: "host" },
      { id: "speaker_2", guessed_identity: "guest A" },
      { id: "speaker_3", guessed_identity: "guest B" },
    ],
    assignments: [
      { i: 0, speaker: "speaker_1" },
      { i: 1, speaker: "speaker_2" },
      { i: 2, speaker: "speaker_3" },
    ],
  });
  const three = toDiarizedTranscript(labeled);
  if (three.speaker_count !== 3) throw new Error(`expected 3 speakers, got ${three.speaker_count}`);
  if (three.segments[2].speaker !== "speaker_3") {
    throw new Error("third turn must keep speaker_3, not toggle back to speaker_1");
  }

  const named = youtubeCaptionsToDiarizedTranscript([
    { startMs: 0, durationMs: 1000, text: "Raj Shamani: intro one" },
    { startMs: 1000, durationMs: 1000, text: "Andrew Huberman: answer one" },
    { startMs: 2000, durationMs: 1000, text: "Guest Three: aside one" },
    { startMs: 3000, durationMs: 1000, text: "Raj Shamani: intro two" },
    { startMs: 4000, durationMs: 1000, text: "Andrew Huberman: answer two" },
    { startMs: 5000, durationMs: 1000, text: "Guest Three: aside two" },
    { startMs: 6000, durationMs: 1000, text: "Raj Shamani: intro three" },
    { startMs: 7000, durationMs: 1000, text: "Andrew Huberman: answer three" },
    { startMs: 8000, durationMs: 1000, text: "Guest Three: aside three" },
  ]);
  if (named.speaker_count !== 3) {
    throw new Error(`named 3-person captions should yield 3 speakers, got ${named.speaker_count}`);
  }
  if (named.speakers[2]?.guessed_identity !== "Guest Three") {
    throw new Error("named captions should keep guessed_identity for speaker_3");
  }
}

if (require.main === module) {
  selfCheck();
  console.log("captions-diarize self-check ok");
}
