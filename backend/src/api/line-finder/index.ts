import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import { lineFinderCaptionsHandler, lineFinderCheckSpeakerHandler, lineFinderDiscoverHandler } from "./handler";

const lineFinderRoutes: IRouter = Router();

lineFinderRoutes.post(API_ENDPOINTS.LINE_FINDER.DISCOVER.route, lineFinderDiscoverHandler);
lineFinderRoutes.post(API_ENDPOINTS.LINE_FINDER.CAPTIONS.route, lineFinderCaptionsHandler);
lineFinderRoutes.post(API_ENDPOINTS.LINE_FINDER.CHECK_SPEAKER.route, lineFinderCheckSpeakerHandler);

export default lineFinderRoutes;
