import { rm } from "node:fs/promises";

import {
  TRANSCRIPTION,
  TRANSCRIPTION_ERROR_MESSAGES,
  TRANSCRIPTION_FORMAT,
} from "./constants";
import { cleanupResolvedMediaSource, resolveMediaSource } from "./download";
import { normalizeToFlac } from "./ffmpeg";
import { toJson, toSrt, toText, toVtt } from "./formatters";
import { transcribeWithGroq } from "./groq-client";
import type {
  GROQ_VERBOSE_JSON_RESPONSE,
  TRANSCRIPTION_FORMAT_VALUE,
  TRANSCRIPTION_REQUEST_PARSED,
  TRANSCRIPTION_RESPONSE,
} from "./types";

function formatResponse(
  groqResponse: GROQ_VERBOSE_JSON_RESPONSE,
  format: TRANSCRIPTION_FORMAT_VALUE,
): string {
  switch (format) {
    case TRANSCRIPTION_FORMAT.JSON:
      return toJson(groqResponse);
    case TRANSCRIPTION_FORMAT.SRT:
      return toSrt(groqResponse.segments);
    case TRANSCRIPTION_FORMAT.VTT:
      return toVtt(groqResponse.segments);
    case TRANSCRIPTION_FORMAT.TXT:
    default:
      return toText(groqResponse);
  }
}

/** Resolve source -> ffmpeg-normalize -> Groq transcribe -> format -> cleanup. */
export async function transcribe(
  request: TRANSCRIPTION_REQUEST_PARSED,
): Promise<TRANSCRIPTION_RESPONSE> {
  const { mediaSource, format, language, model } = request;

  const resolved = await resolveMediaSource(mediaSource);

  try {
    const normalized = await normalizeToFlac(resolved.path);
    /** Only ever the downloaded copy — a caller-supplied local path is never deleted, see `ownsSource`. */
    if (resolved.ownsSource) {
      await rm(resolved.path, { force: true });
    }

    if (normalized.sizeBytes > TRANSCRIPTION.GROQ_MAX_FILE_SIZE_BYTES) {
      throw new Error(TRANSCRIPTION_ERROR_MESSAGES.TOO_LARGE_AFTER_NORMALIZE);
    }

    const groqResponse = await transcribeWithGroq(normalized.path, {
      model,
      language,
    });

    return {
      format,
      content: formatResponse(groqResponse, format),
      language: groqResponse.language,
      durationSeconds: groqResponse.duration,
    };
  } finally {
    await cleanupResolvedMediaSource(resolved);
  }
}
