import { Router, type IRouter } from "express";
import { registerInternalRoutes } from "./internal/index";

const gmapsRoutes: IRouter = Router();

registerInternalRoutes(gmapsRoutes);

export default gmapsRoutes;
