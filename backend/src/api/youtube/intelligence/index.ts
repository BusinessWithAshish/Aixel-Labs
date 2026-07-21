import type { IRouter } from "express";
import { YOUTUBE_INTELLIGENCE_ROUTES } from "./constants";
import { youtubeSearchIntelligenceHandler } from "./search/handler";
import { youtubeVideoIntelligenceHandler } from "./video/handler";
import { youtubeVideoSuggestedIntelligenceHandler } from "./video/suggested/handler";
import { youtubeTranscriptIntelligenceHandler } from "./transcript/handler";
import { youtubeChannelIntelligenceHandler } from "./channel/handler";
import { youtubeHandleIntelligenceHandler } from "./handle/handler";
import { youtubeSuggestIntelligenceHandler } from "./suggest/handler";

export function registerYoutubeIntelligenceRoutes(router: IRouter) {
  router.post(
    YOUTUBE_INTELLIGENCE_ROUTES.SEARCH,
    youtubeSearchIntelligenceHandler,
  );
  router.post(
    YOUTUBE_INTELLIGENCE_ROUTES.VIDEO,
    youtubeVideoIntelligenceHandler,
  );
  router.post(
    YOUTUBE_INTELLIGENCE_ROUTES.VIDEO_SUGGESTED,
    youtubeVideoSuggestedIntelligenceHandler,
  );
  router.post(
    YOUTUBE_INTELLIGENCE_ROUTES.VIDEO_TRANSCRIPT,
    youtubeTranscriptIntelligenceHandler,
  );
  router.post(
    YOUTUBE_INTELLIGENCE_ROUTES.CHANNEL,
    youtubeChannelIntelligenceHandler,
  );
  router.post(
    YOUTUBE_INTELLIGENCE_ROUTES.HANDLE,
    youtubeHandleIntelligenceHandler,
  );
  router.post(
    YOUTUBE_INTELLIGENCE_ROUTES.SUGGEST,
    youtubeSuggestIntelligenceHandler,
  );
}
