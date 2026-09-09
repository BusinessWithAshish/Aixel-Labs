import { rm } from "node:fs/promises";

import {
  MEDIA_TRANSCRIBE,
  MEDIA_TRANSCRIBE_ERROR_MESSAGES,
  MEDIA_TRANSCRIBE_FORMAT,
} from "./constants";
import { cleanupResolvedMediaSource, resolveMediaSource } from "../source";
import { normalizeToFlac } from "./ffmpeg";
import { toJson, toSrt, toText, toVtt } from "./formatters";
import { transcribeWithGroq } from "./groq-client";
import type {
  GROQ_VERBOSE_JSON_RESPONSE,
  MEDIA_TRANSCRIBE_FORMAT_VALUE,
  MEDIA_TRANSCRIBE_REQUEST_PARSED,
  MEDIA_TRANSCRIBE_RESPONSE,
} from "./types";

function formatResponse(
  groqResponse: GROQ_VERBOSE_JSON_RESPONSE,
  format: MEDIA_TRANSCRIBE_FORMAT_VALUE,
): string {
  switch (format) {
    case MEDIA_TRANSCRIBE_FORMAT.JSON:
      return toJson(groqResponse);
    case MEDIA_TRANSCRIBE_FORMAT.SRT:
      return toSrt(groqResponse.segments);
    case MEDIA_TRANSCRIBE_FORMAT.VTT:
      return toVtt(groqResponse.segments);
    case MEDIA_TRANSCRIBE_FORMAT.TXT:
    default:
      return toText(groqResponse);
  }
}

/** Resolve source -> ffmpeg-normalize -> Groq transcribe -> format -> cleanup. */
export async function transcribe(
  request: MEDIA_TRANSCRIBE_REQUEST_PARSED,
): Promise<MEDIA_TRANSCRIBE_RESPONSE> {
  const { mediaSource, format, language, model } = request;

  const resolved = await resolveMediaSource(mediaSource);

  try {
    const normalized = await normalizeToFlac(resolved.path);
    /** Only ever the downloaded copy — a caller-supplied local path is never deleted, see `ownsSource`. */
    if (resolved.ownsSource) {
      await rm(resolved.path, { force: true });
    }

    if (normalized.sizeBytes > MEDIA_TRANSCRIBE.GROQ_MAX_FILE_SIZE_BYTES) {
      throw new Error(MEDIA_TRANSCRIBE_ERROR_MESSAGES.TOO_LARGE_AFTER_NORMALIZE);
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
