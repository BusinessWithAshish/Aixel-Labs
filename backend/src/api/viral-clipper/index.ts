import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import {
  viralClipperCutHandler,
  viralClipperDiarizeHandler,
  viralClipperPipelineHandler,
  viralClipperViralMomentsHandler,
  viralClipperYoutubeChaptersHandler,
  viralClipperYoutubeCommentsHandler,
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

viralClipperRoutes.post(
  API_ENDPOINTS.VIRAL_CLIPPER.YOUTUBE_COMMENTS.route,
  viralClipperYoutubeCommentsHandler,
);

viralClipperRoutes.post(
  API_ENDPOINTS.VIRAL_CLIPPER.YOUTUBE_CHAPTERS.route,
  viralClipperYoutubeChaptersHandler,
);

export default viralClipperRoutes;

export { diarizeFromSource } from "./diarize";
export { cutClipsFromVideo } from "./cut";
export { runViralClipperPipeline } from "./pipeline";
export { scoreViralMoments } from "./viral-moments";
export { fetchYoutubeChapters, formatChaptersAsAudienceSignals } from "./youtube-chapters";
export {
  fetchYoutubeCommentHighlights,
  formatCommentHighlightsAsAudienceSignals,
} from "./youtube-comments";
export {
  VIRAL_CLIPPER_CUT_REQUEST_SCHEMA,
  VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA,
  VIRAL_CLIPPER_PIPELINE_REQUEST_SCHEMA,
  VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_SCHEMA,
  VIRAL_CLIPPER_YOUTUBE_CHAPTERS_REQUEST_SCHEMA,
  VIRAL_CLIPPER_YOUTUBE_COMMENTS_REQUEST_SCHEMA,
} from "./schemas";
export {
  VIRAL_CLIPPER,
  VIRAL_CLIPPER_ASPECT_RATIO_DIMENSIONS,
  VIRAL_CLIPPER_ASPECT_RATIOS,
  VIRAL_CLIPPER_ERROR_MESSAGES,
  VIRAL_CLIPPER_GEMINI_MODEL,
} from "./constants";
export { VIRAL_CLIPPER_PODCAST_TONES } from "./types";
export type {
  CHAPTER_SIGNAL,
  CLIP_RANGE,
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
  VIRAL_CLIPPER_YOUTUBE_CHAPTERS_REQUEST,
  VIRAL_CLIPPER_YOUTUBE_CHAPTERS_REQUEST_PARSED,
  VIRAL_CLIPPER_YOUTUBE_CHAPTERS_RESPONSE,
  VIRAL_CLIPPER_YOUTUBE_COMMENTS_REQUEST,
  VIRAL_CLIPPER_YOUTUBE_COMMENTS_REQUEST_PARSED,
  VIRAL_CLIPPER_YOUTUBE_COMMENTS_RESPONSE,
  CUT_CLIP_RESULT,
  DIARIZED_TRANSCRIPT,
  TIMESTAMP_MENTION_CLUSTER,
  VIRAL_MOMENT_CANDIDATE,
} from "./types";
