import { rm } from "node:fs/promises";
import { dirname } from "node:path";

import { del } from "@vercel/blob";

import {
  TRANSCRIPTION,
  TRANSCRIPTION_ERROR_MESSAGES,
  TRANSCRIPTION_FORMAT,
} from "./constants";
import { downloadToTempFile } from "./download";
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

/** Download blob -> ffmpeg-normalize -> Groq transcribe -> format -> cleanup. */
export async function transcribe(
  request: TRANSCRIPTION_REQUEST_PARSED,
): Promise<TRANSCRIPTION_RESPONSE> {
  const { blobUrl, format, language, model } = request;

  const sourcePath = await downloadToTempFile(blobUrl);
  const tempDir = dirname(sourcePath);

  try {
    const normalized = await normalizeToFlac(sourcePath);
    await rm(sourcePath, { force: true });

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
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await del(blobUrl).catch(() => {});
  }
}
