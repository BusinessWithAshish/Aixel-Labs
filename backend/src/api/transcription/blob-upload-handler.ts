import type { Request, Response } from "express";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import {
  TRANSCRIPTION,
  TRANSCRIPTION_ALLOWED_CONTENT_TYPES,
} from "./constants";

/**
 * Issues short-lived Vercel Blob client-upload tokens so the browser can upload
 * a video/audio file directly to Blob storage — bypassing this function's
 * 4.5MB Vercel request-body cap entirely. Blob enforces content-type/size
 * itself; this function never sees the file bytes.
 */
export async function transcriptionBlobUploadHandler(
  req: Request,
  res: Response,
) {
  try {
    const jsonResponse = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...TRANSCRIPTION_ALLOWED_CONTENT_TYPES],
        maximumSizeInBytes: TRANSCRIPTION.MAX_UPLOAD_SIZE_BYTES,
        addRandomSuffix: true,
        validUntil: Date.now() + TRANSCRIPTION.BLOB_TOKEN_TTL_MS,
      }),
    });
    res.status(200).json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
}
