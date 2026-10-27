import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import {
  contentLabBreakdownHandler,
  contentLabCheckHandler,
  contentLabCreatorHandler,
  contentLabExploreHandler,
} from "./handler";

const contentLabRoutes: IRouter = Router();

contentLabRoutes.post(API_ENDPOINTS.CONTENT_LAB.EXPLORE.route, contentLabExploreHandler);
contentLabRoutes.post(API_ENDPOINTS.CONTENT_LAB.BREAKDOWN.route, contentLabBreakdownHandler);
contentLabRoutes.post(API_ENDPOINTS.CONTENT_LAB.CHECK.route, contentLabCheckHandler);
contentLabRoutes.post(API_ENDPOINTS.CONTENT_LAB.CREATOR.route, contentLabCreatorHandler);

export default contentLabRoutes;

// Services: the same functions back HTTP and (later) an MCP op.
export { contentLabExploreService } from "./explore";
export { contentLabBreakdownService } from "./breakdown";
export { contentLabCheckService } from "./check";
export { contentLabCreatorService } from "./creator";
