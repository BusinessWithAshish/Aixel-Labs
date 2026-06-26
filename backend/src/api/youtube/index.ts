import { Router, type IRouter } from "express";
import { registerYoutubeSearchRoutes } from "./search/index";
import { registerYoutubeVideoRoutes } from "./video/index";
import { registerYoutubePlaylistRoutes } from "./playlist/index";

const youtubeRoutes: IRouter = Router();

registerYoutubeSearchRoutes(youtubeRoutes);
registerYoutubeVideoRoutes(youtubeRoutes);
registerYoutubePlaylistRoutes(youtubeRoutes);

export default youtubeRoutes;
