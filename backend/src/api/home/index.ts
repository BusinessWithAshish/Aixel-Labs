import { Router, type IRouter } from "express";
import { API_ENDPOINTS } from "../../config";
import { homeHandler } from "./handler";

const homeRoutes: IRouter = Router();

homeRoutes.get(API_ENDPOINTS.HOME.API.route, homeHandler);

export default homeRoutes;
