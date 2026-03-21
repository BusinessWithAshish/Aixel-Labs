import { Router, type IRouter } from "express";
import { API_ENDPOINTS } from "../../config";
import { gsearchApiHandler } from "./handler";

const gsearchRoutes: IRouter = Router();

gsearchRoutes.post(API_ENDPOINTS.GSEARCH.API.route, gsearchApiHandler);

export default gsearchRoutes;
