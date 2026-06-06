import { IRouter, Router } from "express";
import { API_ENDPOINTS } from "../../config";
import { linkedinApiHandler } from "./handler";

const linkedinRoutes: IRouter = Router();

linkedinRoutes.post(API_ENDPOINTS.LINKEDIN.API.route, linkedinApiHandler);

export default linkedinRoutes;
