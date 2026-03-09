import { Router, type IRouter } from "express";
import { registerInternalRoutes } from "./internal/index";
import { registerScrapeRoutes } from "./scrape/index";

const gmapsRoutes: IRouter = Router();

// POST /gmaps/internal (path is relative to mount point ENDPOINTS.GMAPS = "/gmaps")
registerInternalRoutes(gmapsRoutes);
registerScrapeRoutes(gmapsRoutes);

export default gmapsRoutes;
