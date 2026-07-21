import { type IRouter, Router } from "express";
import { registerYoutubeSearchRoutes } from "./search";
import { registerYoutubeSuggestRoutes } from "./suggest";
import { registerYoutubeVideoRoutes } from "./video";
import { registerYoutubeVideoMetaRoutes } from "./video-meta";
import { registerYoutubeVideoTranscriptRoutes } from "./transcript";
import { registerYoutubeChannelRoutes } from "./channel";
import { registerYoutubeHandleRoutes } from "./handle";
import { registerYoutubeIntelligenceRoutes } from "./intelligence";

const youtubeRoutes: IRouter = Router();

registerYoutubeSearchRoutes(youtubeRoutes);
registerYoutubeSuggestRoutes(youtubeRoutes);
registerYoutubeVideoRoutes(youtubeRoutes);
registerYoutubeVideoMetaRoutes(youtubeRoutes);
registerYoutubeVideoTranscriptRoutes(youtubeRoutes);
registerYoutubeHandleRoutes(youtubeRoutes);
registerYoutubeChannelRoutes(youtubeRoutes);
registerYoutubeIntelligenceRoutes(youtubeRoutes);

export default youtubeRoutes;
