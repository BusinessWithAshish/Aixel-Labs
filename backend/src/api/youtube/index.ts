import { type IRouter, Router } from "express";
import { registerYoutubeSearchRoutes } from "./search";
import { registerYoutubeVideoRoutes } from "./video";
import { registerYoutubeChannelRoutes } from "./channel";
import { registerYoutubeHandleRoutes } from "./handle";

const youtubeRoutes: IRouter = Router();

registerYoutubeSearchRoutes(youtubeRoutes);
registerYoutubeVideoRoutes(youtubeRoutes);
registerYoutubeHandleRoutes(youtubeRoutes);
registerYoutubeChannelRoutes(youtubeRoutes);

export default youtubeRoutes;
