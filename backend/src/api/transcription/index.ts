import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import { transcriptionBlobUploadHandler } from "./blob-upload-handler";
import { transcriptionApiHandler } from "./handler";

const transcriptionRoutes: IRouter = Router();

transcriptionRoutes.post(
  API_ENDPOINTS.TRANSCRIPTION.BLOB_UPLOAD.route,
  transcriptionBlobUploadHandler,
);

transcriptionRoutes.post(
  API_ENDPOINTS.TRANSCRIPTION.TRANSCRIBE.route,
  transcriptionApiHandler,
);

export default transcriptionRoutes;

export { transcribe } from "./client";
export { TRANSCRIPTION_REQUEST_SCHEMA } from "./schemas";
export {
  TRANSCRIPTION,
  TRANSCRIPTION_FORMAT,
  TRANSCRIPTION_MODEL,
  TRANSCRIPTION_ERROR_MESSAGES,
} from "./constants";
export type {
  TRANSCRIPTION_REQUEST,
  TRANSCRIPTION_REQUEST_PARSED,
  TRANSCRIPTION_RESPONSE,
  TRANSCRIPTION_FORMAT_VALUE,
  TRANSCRIPTION_MODEL_VALUE,
} from "./types";
