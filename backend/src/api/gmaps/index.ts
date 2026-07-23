import { Router, type IRouter } from "express";
import { registerInternalRoutes } from "./internal/index";
import { registerDetailsRoutes } from "./details/index";
import { registerAdvancedRoutes } from "./advanced/index";

const gmapsRoutes: IRouter = Router();

registerInternalRoutes(gmapsRoutes);
registerDetailsRoutes(gmapsRoutes);
registerAdvancedRoutes(gmapsRoutes);

export default gmapsRoutes;
