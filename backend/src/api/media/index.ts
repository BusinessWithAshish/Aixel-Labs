import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import {
  mediaCondenseHandler,
  mediaCutHandler,
  mediaDiarizeHandler,
  mediaFetchHandler,
  mediaTranscribeHandler,
} from "./handler";

const mediaRoutes: IRouter = Router();

mediaRoutes.post(API_ENDPOINTS.MEDIA.FETCH.route, mediaFetchHandler);
mediaRoutes.post(API_ENDPOINTS.MEDIA.TRANSCRIBE.route, mediaTranscribeHandler);
mediaRoutes.post(API_ENDPOINTS.MEDIA.DIARIZE.route, mediaDiarizeHandler);
mediaRoutes.post(API_ENDPOINTS.MEDIA.CUT.route, mediaCutHandler);
mediaRoutes.post(API_ENDPOINTS.MEDIA.CONDENSE.route, mediaCondenseHandler);

export default mediaRoutes;

/* Services — the same functions the MCP `media` tool calls (no HTTP loopback). */
export { fetchMedia } from "./fetch/fetch";
export { transcribe } from "./transcribe/client";
export { diarizeFromSource } from "./diarize/audio";
export { cutClipsFromVideo } from "./cut/cut";
export { condenseVideo } from "./condense/client";

/* Source resolution — shared by every op that takes a media source. */
export {
  cleanupResolvedMediaSource,
  isRemoteUrl,
  resolveMediaSource,
  resolveVideoSourceForCut,
} from "./source";

/* Request schemas — reused verbatim as the MCP tool's per-op `input`. */
export { MEDIA_FETCH_REQUEST_SCHEMA } from "./fetch/schemas";
export { MEDIA_TRANSCRIBE_REQUEST_SCHEMA } from "./transcribe/schemas";
export { MEDIA_DIARIZE_REQUEST_SCHEMA } from "./diarize/schemas";
export { MEDIA_CUT_REQUEST_SCHEMA } from "./cut/schemas";
export { MEDIA_CONDENSE_REQUEST_SCHEMA } from "./condense/schemas";

export {
  MEDIA,
  MEDIA_ASPECT_RATIO_DIMENSIONS,
  MEDIA_ASPECT_RATIOS,
  MEDIA_ERROR_MESSAGES,
  MEDIA_GEMINI_MODEL,
} from "./constants";

export type {
  CLIP_RANGE,
  CUT_CLIP_RESULT,
  DIARIZED_SEGMENT,
  DIARIZED_SPEAKER,
  DIARIZED_TRANSCRIPT,
  GEMINI_USAGE_METADATA,
  MEDIA_ASPECT_RATIO_VALUE,
  MEDIA_CUT_REQUEST,
  MEDIA_CUT_REQUEST_PARSED,
  MEDIA_CUT_RESPONSE,
  MEDIA_DIARIZE_REQUEST,
  MEDIA_DIARIZE_REQUEST_PARSED,
  MEDIA_DIARIZE_RESPONSE,
  MEDIA_FETCH_REQUEST,
  MEDIA_FETCH_REQUEST_PARSED,
  MEDIA_FETCH_RESPONSE,
} from "./types";

export type {
  MEDIA_TRANSCRIBE_FORMAT_VALUE,
  MEDIA_TRANSCRIBE_MODEL_VALUE,
  MEDIA_TRANSCRIBE_REQUEST,
  MEDIA_TRANSCRIBE_REQUEST_PARSED,
  MEDIA_TRANSCRIBE_RESPONSE,
} from "./transcribe/types";

export type {
  TIME_RANGE,
  MEDIA_CONDENSE_REQUEST,
  MEDIA_CONDENSE_REQUEST_PARSED,
  MEDIA_CONDENSE_RESPONSE,
} from "./condense/types";
