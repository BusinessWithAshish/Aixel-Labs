import { type IRouter, Router } from "express";

import { GSEARCH_ROUTES } from "./constants";
import { gsearchHandler } from "./handler";

const gsearchRoutes: IRouter = Router();

gsearchRoutes.post(GSEARCH_ROUTES.SEARCH, gsearchHandler);

export default gsearchRoutes;

export { fetchGsearch } from "./client";
export type { GsearchRequest, GsearchResponse, GsearchResult } from "./types";
