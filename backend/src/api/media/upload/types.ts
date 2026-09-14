import { z } from "zod";
import type { MEDIA_UPLOAD_INIT_REQUEST_SCHEMA } from "./schemas";

export type MEDIA_UPLOAD_INIT_REQUEST = z.infer<typeof MEDIA_UPLOAD_INIT_REQUEST_SCHEMA>;

export type MEDIA_UPLOAD_INIT_RESPONSE = {
  uploadId: string;
  token: string;
  chunkSize: number;
};

export type MEDIA_UPLOAD_CHUNK_RESPONSE = {
  bytesReceived: number;
};

export type MEDIA_UPLOAD_STATUS_RESPONSE = {
  bytesReceived: number;
  size: number;
  complete: boolean;
};

export type MEDIA_UPLOAD_COMPLETE_RESPONSE = {
  path: string;
  filename: string;
  size: number;
};

/** Sidecar metadata persisted at `{AIXEL_MEDIA.UPLOADS}/.tmp/{uploadId}.json`. */
export type UPLOAD_SESSION_METADATA = {
  filename: string;
  size: number;
  mimeType?: string;
  createdAt: string;
};
