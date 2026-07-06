import { type IRouter, Router } from "express";
import { registerYoutubeSearchRoutes } from "./search";
import { registerYoutubeVideoRoutes } from "./video";
import { registerYoutubeVideoMetaRoutes } from "./video-meta";
import { registerYoutubeChannelRoutes } from "./channel";
import { registerYoutubeHandleRoutes } from "./handle";
import { registerYoutubeIntelligenceRoutes } from "./intelligence";

const youtubeRoutes: IRouter = Router();

registerYoutubeSearchRoutes(youtubeRoutes);
registerYoutubeVideoRoutes(youtubeRoutes);
registerYoutubeVideoMetaRoutes(youtubeRoutes);
registerYoutubeHandleRoutes(youtubeRoutes);
registerYoutubeChannelRoutes(youtubeRoutes);
registerYoutubeIntelligenceRoutes(youtubeRoutes);

export default youtubeRoutes;
