import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { AIXEL_MEDIA } from "../../../media";
import { detectSilences } from "../condense/silence";
import { GeminiApiError, parseGeminiErrorBody, withGeminiKeyPoolRetry } from "../gemini-client";
import { transcribeWithGroq } from "../transcribe/groq-client";
import { remuxWav, round3, runFfmpeg, wavSeconds } from "./audio";
import { MEDIA_NARRATE_ERRORS, MEDIA_NARRATE_GEMINI } from "./constants";
import { buildPhrases, collapseSpaces, escapeRegExp, MARKUP, normaliseSource } from "./markup";
import { timeScriptWords } from "./timing";
import type { MEDIA_NARRATE_REQUEST, MEDIA_NARRATE_RESPONSE, NARRATE_RESPELLING, NARRATE_SENTENCE, NARRATE_WORD } from "./types";

/** Gemini's own inline tags (`<short pause>`, `<sigh>`): spoken as sounds, never shown. */
const TAG = /<[^<>]{1,40}>/g;
const SENTENCE_END = /[.?!]["'”’)]*$/;

/**
 * The caller's text as Gemini should hear it, and as captions should show it.
 * No built-in Hindi respelling: those rules fix Kokoro's phonemiser, and
 * Gemini reads Devanagari correctly as written.
 */
function prepare(text: string, pronunciations: Record<string, string> | undefined) {
  const source = normaliseSource(text);

  let engine = source.replace(MARKUP, (_, kind: string, value: string) =>
    kind.toLowerCase() === "pause"
      ? Number(value) >= MEDIA_NARRATE_GEMINI.LONG_PAUSE_SECONDS
        ? " <long pause> "
        : " <short pause> "
      : " ",
  );
  const respelled: NARRATE_RESPELLING[] = [];
  for (const [word, respelling] of Object.entries(pronunciations ?? {})) {
    if (!word) continue;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])${escapeRegExp(word)}(?![\\p{L}\\p{N}\\p{M}])`, "gu");
    if (pattern.test(engine)) {
      engine = engine.replace(pattern, respelling);
      respelled.push({ from: word, to: respelling, source: "channel" });
    }
  }

  const shown = collapseSpaces(source.replace(MARKUP, " ").replace(TAG, " "));
  return { engineInput: collapseSpaces(engine), spokenText: shown, tokens: shown.split(" ").filter(Boolean), respelled };
}

/** The pool helper only moves to the next key when a failure says why; give it Google's reasons. */
function geminiError(status: number, bodyText: string): GeminiApiError {
  let error: { message?: string } | undefined;
  try {
    error = (JSON.parse(bodyText) as { error?: typeof error }).error;
  } catch {
    // not JSON — keep the raw text in the message
  }
  const info = parseGeminiErrorBody(error);
  return new GeminiApiError(
    `${MEDIA_NARRATE_ERRORS.GEMINI_FAILED}: HTTP ${status} ${(error?.message ?? bodyText).slice(0, 300)}`,
    { ...info, code: info.code ?? status },
  );
}

type INTERACTION = { steps?: { content?: { type?: string; data?: string; mime_type?: string }[] }[] };

async function synthesise(engineInput: string, voice: string, direction: string | undefined): Promise<Buffer> {
  const content: Record<string, unknown> = { type: "text", text: engineInput };
  if (direction) content.annotations = [{ type: "speech_metadata", style: direction }];
  const body = JSON.stringify({
    model: MEDIA_NARRATE_GEMINI.MODEL,
    input: [{ type: "user_input", content: [content] }],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice }] },
  });

  return withGeminiKeyPoolRetry(async (apiKey) => {
    const response = await fetch(`${MEDIA_NARRATE_GEMINI.URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(MEDIA_NARRATE_GEMINI.REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw geminiError(response.status, await response.text().catch(() => ""));
    const result = (await response.json()) as INTERACTION;
    const audio = result.steps?.flatMap((step) => step.content ?? []).find((part) => part.type === "audio" && part.data);
    if (!audio?.data) throw new Error(MEDIA_NARRATE_ERRORS.GEMINI_EMPTY);
    return Buffer.from(audio.data, "base64");
  }, "media.narrate gemini");
}

/** Midpoints of the pauses in a file. */
async function pauseMidpoints(audioPath: string): Promise<number[]> {
  const { silences } = await detectSilences(
    audioPath,
    MEDIA_NARRATE_GEMINI.PAUSE_NOISE_DB,
    MEDIA_NARRATE_GEMINI.PAUSE_MIN_SECONDS,
  );
  return silences.map(({ start, end }) => (start + end) / 2);
}

/**
 * Whisper drops whole stretches of words from audio much longer than its 30 s
 * window (measured: 124 of 190 words heard on a 70 s narration), so it hears
 * the narration in pieces of at most `HEARING_CHUNK_SECONDS`, cut in pauses.
 */
async function hearWords(audioPath: string, durationSeconds: number, language: string) {
  const pauses = await pauseMidpoints(audioPath).catch(() => []);
  const cuts = [0];
  while (durationSeconds - cuts[cuts.length - 1] > MEDIA_NARRATE_GEMINI.HEARING_CHUNK_SECONDS) {
    const from = cuts[cuts.length - 1];
    const limit = from + MEDIA_NARRATE_GEMINI.HEARING_CHUNK_SECONDS;
    const inPause = pauses.filter((p) => p > from + MEDIA_NARRATE_GEMINI.HEARING_CHUNK_SECONDS / 2 && p <= limit);
    cuts.push(inPause.length ? inPause[inPause.length - 1] : limit);
  }
  cuts.push(durationSeconds);

  const heard: { word: string; start: number; end: number }[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const piecePath = audioPath.replace(/\.wav$/, `-hear${i}.wav`);
    try {
      await runFfmpeg(
        ["-i", audioPath, "-ss", cuts[i].toFixed(3), "-to", cuts[i + 1].toFixed(3), "-c:a", "pcm_s16le", piecePath],
        MEDIA_NARRATE_ERRORS.SPLIT_FAILED,
      );
      const piece = await transcribeWithGroq(piecePath, {
        model: MEDIA_NARRATE_GEMINI.TIMING_MODEL,
        language,
        wordTimestamps: true,
      });
      for (const w of piece.words ?? []) {
        heard.push({ word: w.word, start: w.start + cuts[i], end: w.end + cuts[i] });
      }
    } finally {
      await rm(piecePath, { force: true });
    }
  }
  return heard;
}

/**
 * Cuts the whole narration at sentence ends — halfway through each pause, so
 * every sentence file keeps its natural breath on both sides and the files
 * played back to back are the original audio.
 */
async function splitSentences(
  audioPath: string,
  words: NARRATE_WORD[],
  durationSeconds: number,
): Promise<NARRATE_SENTENCE[]> {
  const groups: number[][] = [];
  let current: number[] = [];
  words.forEach((word, index) => {
    current.push(index);
    if (SENTENCE_END.test(word.word)) {
      groups.push(current);
      current = [];
    }
  });
  if (current.length > 0) groups.push(current);

  const cuts = groups.map((group, index) => {
    if (index === 0) return 0;
    const before = words[groups[index - 1][groups[index - 1].length - 1]].end;
    const after = words[group[0]].start;
    return Math.max(0, (before + Math.max(before, after)) / 2);
  });
  cuts.push(durationSeconds);

  const sentences: NARRATE_SENTENCE[] = [];
  for (let n = 0; n < groups.length; n++) {
    const from = cuts[n];
    const to = Math.max(from, cuts[n + 1]);
    const sentencePath = audioPath.replace(/\.wav$/, `-s${String(n + 1).padStart(2, "0")}.wav`);
    await runFfmpeg(
      ["-i", audioPath, "-ss", from.toFixed(3), "-to", to.toFixed(3), "-c:a", "pcm_s16le", sentencePath],
      MEDIA_NARRATE_ERRORS.SPLIT_FAILED,
    );
    const sentenceWords = groups[n].map((i) => ({
      word: words[i].word,
      start: round3(Math.max(0, words[i].start - from)),
      end: round3(Math.max(0, words[i].end - from)),
    }));
    const text = sentenceWords.map((w) => w.word).join(" ");
    const seconds = round3(to - from);
    sentences.push({
      n: n + 1,
      text,
      audioPath: sentencePath,
      durationSeconds: seconds,
      words: sentenceWords,
      phrases: buildPhrases(sentenceWords, text, seconds),
    });
  }
  return sentences;
}

/**
 * provider "gemini": the whole script in ONE request (the free tier allows 10
 * a day), then word times from Whisper and one audio file per sentence, so
 * `assemble` takes it exactly as it takes Kokoro's one-call-per-sentence output.
 */
export async function narrateWithGemini(input: MEDIA_NARRATE_REQUEST): Promise<MEDIA_NARRATE_RESPONSE> {
  const prepared = prepare(input.text, input.pronunciations);
  if (prepared.tokens.length === 0) throw new Error(MEDIA_NARRATE_ERRORS.EMPTY_TEXT);
  const voice = input.voice ?? MEDIA_NARRATE_GEMINI.DEFAULT_VOICE;

  const audio = await synthesise(prepared.engineInput, voice, input.direction);
  await mkdir(AIXEL_MEDIA.MEDIA_NARRATION, { recursive: true });
  const audioPath = join(AIXEL_MEDIA.MEDIA_NARRATION, `narration-${randomUUID()}.wav`);
  await remuxWav(audio, audioPath);
  const durationSeconds = round3(await wavSeconds(audioPath));

  let timing: "aligned" | "estimated" = "aligned";
  let timingFallbackReason: string | undefined;
  let heard: { word: string; start: number; end: number }[] = [];
  try {
    heard = await hearWords(audioPath, durationSeconds, input.language);
  } catch (err) {
    timing = "estimated";
    timingFallbackReason = err instanceof Error ? err.message : String(err);
  }
  if (timing === "aligned" && heard.length === 0) {
    timing = "estimated";
    timingFallbackReason = "Whisper returned no words";
  }
  const { words, matchedShare } = timeScriptWords(prepared.tokens, heard, durationSeconds);

  return {
    audioPath,
    durationSeconds,
    provider: "gemini",
    voice,
    speed: 1,
    spokenText: prepared.spokenText,
    respelled: prepared.respelled,
    words,
    phrases: buildPhrases(words, prepared.spokenText, durationSeconds),
    timing,
    timingMatchedShare: matchedShare,
    ...(timingFallbackReason ? { timingFallbackReason } : {}),
    sentences: await splitSentences(audioPath, words, durationSeconds),
  };
}
