import crypto from "node:crypto";
import type { Request, Response } from "express";

import { assertPersistentDisk, statusCodeFromError } from "../../../config";
import type { ALApiResponse } from "../../types";
import { MEDIA_UPLOAD, MEDIA_UPLOAD_ERROR_MESSAGES } from "./constants";
import { MEDIA_UPLOAD_INIT_REQUEST_SCHEMA } from "./schemas";
import { createUploadToken, verifyUploadToken } from "./token";
import {
  createUploadSession,
  finalizeUpload,
  getPartFileSize,
  readUploadMetadata,
  writeChunk,
} from "./store";
import type {
  MEDIA_UPLOAD_CHUNK_RESPONSE,
  MEDIA_UPLOAD_COMPLETE_RESPONSE,
  MEDIA_UPLOAD_INIT_RESPONSE,
  MEDIA_UPLOAD_STATUS_RESPONSE,
} from "./types";

function fail(res: Response, err: unknown, label: string) {
  const message = err instanceof Error ? err.message : MEDIA_UPLOAD_ERROR_MESSAGES.GENERIC;
  console.error(`[${label}]`, message);
  res
    .status(statusCodeFromError(err, 500))
    .json({ success: false, error: message } satisfies ALApiResponse<never>);
}

/** Express 5's `ParamsDictionary` types a named `:param` as `string | string[]` (array only ever occurs for `*` wildcard segments, never a plain named param) — normalize before use. */
function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/** POST /media/upload/init — mints an upload session (uploadId + token) and stages the sidecar files. */
export async function mediaUploadInitHandler(req: Request, res: Response) {
  try {
    assertPersistentDisk(MEDIA_UPLOAD_ERROR_MESSAGES.VERCEL);

    const parsed = MEDIA_UPLOAD_INIT_REQUEST_SCHEMA.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: MEDIA_UPLOAD_ERROR_MESSAGES.INVALID_PARAMS,
      } satisfies ALApiResponse<never>);
      return;
    }

    const { filename, size, mimeType } = parsed.data;
    const uploadId = crypto.randomUUID();
    const { token } = createUploadToken(uploadId);

    await createUploadSession(uploadId, {
      filename,
      size,
      mimeType,
      createdAt: new Date().toISOString(),
    });

    res.status(200).json({
      success: true,
      data: { uploadId, token, chunkSize: MEDIA_UPLOAD.CHUNK_SIZE },
    } satisfies ALApiResponse<MEDIA_UPLOAD_INIT_RESPONSE>);
  } catch (err) {
    fail(res, err, "MEDIA/UPLOAD/INIT");
  }
}

/** PUT /media/upload/:uploadId/chunk — positional write of a raw byte range into the `.part` file. */
export async function mediaUploadChunkHandler(req: Request, res: Response) {
  try {
    assertPersistentDisk(MEDIA_UPLOAD_ERROR_MESSAGES.VERCEL);

    const uploadId = paramString(req.params.uploadId);
    verifyUploadToken(req.headers.authorization, uploadId);

    const offsetHeader = req.headers["x-chunk-offset"];
    const offsetValue = Array.isArray(offsetHeader) ? offsetHeader[0] : offsetHeader;
    const offset = Number(offsetValue);
    if (!offsetValue || !Number.isFinite(offset) || offset < 0) {
      res.status(400).json({
        success: false,
        error: MEDIA_UPLOAD_ERROR_MESSAGES.MISSING_CHUNK_OFFSET,
      } satisfies ALApiResponse<never>);
      return;
    }

    const meta = await readUploadMetadata(uploadId);
    if (!meta) {
      res.status(404).json({
        success: false,
        error: MEDIA_UPLOAD_ERROR_MESSAGES.UPLOAD_NOT_FOUND,
      } satisfies ALApiResponse<never>);
      return;
    }

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    const bytesReceived = await writeChunk(uploadId, offset, buffer);

    res.status(200).json({
      success: true,
      data: { bytesReceived },
    } satisfies ALApiResponse<MEDIA_UPLOAD_CHUNK_RESPONSE>);
  } catch (err) {
    fail(res, err, "MEDIA/UPLOAD/CHUNK");
  }
}

/** GET /media/upload/:uploadId/status — bytes received so far vs the expected total. */
export async function mediaUploadStatusHandler(req: Request, res: Response) {
  try {
    assertPersistentDisk(MEDIA_UPLOAD_ERROR_MESSAGES.VERCEL);

    const uploadId = paramString(req.params.uploadId);
    verifyUploadToken(req.headers.authorization, uploadId);

    const meta = await readUploadMetadata(uploadId);
    const bytesReceived = await getPartFileSize(uploadId);
    if (!meta || bytesReceived === null) {
      res.status(404).json({
        success: false,
        error: MEDIA_UPLOAD_ERROR_MESSAGES.UPLOAD_NOT_FOUND,
      } satisfies ALApiResponse<never>);
      return;
    }

    res.status(200).json({
      success: true,
      data: { bytesReceived, size: meta.size, complete: bytesReceived >= meta.size },
    } satisfies ALApiResponse<MEDIA_UPLOAD_STATUS_RESPONSE>);
  } catch (err) {
    fail(res, err, "MEDIA/UPLOAD/STATUS");
  }
}

/** POST /media/upload/:uploadId/complete — verifies full size, moves `.part` to its final path, cleans up. */
export async function mediaUploadCompleteHandler(req: Request, res: Response) {
  try {
    assertPersistentDisk(MEDIA_UPLOAD_ERROR_MESSAGES.VERCEL);

    const uploadId = paramString(req.params.uploadId);
    verifyUploadToken(req.headers.authorization, uploadId);

    const meta = await readUploadMetadata(uploadId);
    const bytesReceived = await getPartFileSize(uploadId);
    if (!meta || bytesReceived === null) {
      res.status(404).json({
        success: false,
        error: MEDIA_UPLOAD_ERROR_MESSAGES.UPLOAD_NOT_FOUND,
      } satisfies ALApiResponse<never>);
      return;
    }

    if (bytesReceived !== meta.size) {
      res.status(400).json({
        success: false,
        error: MEDIA_UPLOAD_ERROR_MESSAGES.SIZE_MISMATCH,
      } satisfies ALApiResponse<never>);
      return;
    }

    const result = await finalizeUpload(uploadId, meta);

    res.status(200).json({
      success: true,
      data: result,
    } satisfies ALApiResponse<MEDIA_UPLOAD_COMPLETE_RESPONSE>);
  } catch (err) {
    fail(res, err, "MEDIA/UPLOAD/COMPLETE");
  }
}
