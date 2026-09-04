import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import {
  viralClipperCutHandler,
  viralClipperDiarizeHandler,
  viralClipperPipelineHandler,
  viralClipperViralMomentsHandler,
} from "./handler";

const viralClipperRoutes: IRouter = Router();

viralClipperRoutes.post(
  API_ENDPOINTS.VIRAL_CLIPPER.DIARIZE.route,
  viralClipperDiarizeHandler,
);

viralClipperRoutes.post(
  API_ENDPOINTS.VIRAL_CLIPPER.VIRAL_MOMENTS.route,
  viralClipperViralMomentsHandler,
);

viralClipperRoutes.post(
  API_ENDPOINTS.VIRAL_CLIPPER.PIPELINE.route,
  viralClipperPipelineHandler,
);

viralClipperRoutes.post(API_ENDPOINTS.VIRAL_CLIPPER.CUT.route, viralClipperCutHandler);

export default viralClipperRoutes;

export { diarizeFromYoutubeCaptions, youtubeCaptionsToDiarizedTranscript } from "./diarize/captions";
export { diarizeFromSource } from "./diarize/audio";
export { cutClipsFromVideo } from "./cut/cut";
export { runViralClipperPipeline } from "./pipeline";
export { scoreViralMoments } from "./moments/score";
export { VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA } from "./diarize/schemas";
export { VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_SCHEMA } from "./moments/schemas";
export { VIRAL_CLIPPER_CUT_REQUEST_SCHEMA } from "./cut/schemas";
export { VIRAL_CLIPPER_PIPELINE_REQUEST_SCHEMA } from "./schemas";
export {
  VIRAL_CLIPPER,
  VIRAL_CLIPPER_ASPECT_RATIO_DIMENSIONS,
  VIRAL_CLIPPER_ASPECT_RATIOS,
  VIRAL_CLIPPER_ERROR_MESSAGES,
  VIRAL_CLIPPER_GEMINI_MODEL,
} from "./constants";
export { VIRAL_CLIPPER_PODCAST_TONES } from "./types";
export type {
  VIRAL_CLIPPER_ASPECT_RATIO_VALUE,
  VIRAL_CLIPPER_CUT_REQUEST,
  VIRAL_CLIPPER_CUT_REQUEST_PARSED,
  VIRAL_CLIPPER_CUT_RESPONSE,
  VIRAL_CLIPPER_DIARIZE_REQUEST,
  VIRAL_CLIPPER_DIARIZE_REQUEST_PARSED,
  VIRAL_CLIPPER_DIARIZE_RESPONSE,
  VIRAL_CLIPPER_PIPELINE_REQUEST,
  VIRAL_CLIPPER_PIPELINE_REQUEST_PARSED,
  VIRAL_CLIPPER_PIPELINE_RESPONSE,
  VIRAL_CLIPPER_PODCAST_TONE,
  VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST,
  VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_PARSED,
  VIRAL_CLIPPER_VIRAL_MOMENTS_RESPONSE,
  CUT_CLIP_RESULT,
  DIARIZED_TRANSCRIPT,
  VIRAL_CLIPPER_DIARIZE_SOURCE,
  VIRAL_MOMENT_CANDIDATE,
} from "./types";
