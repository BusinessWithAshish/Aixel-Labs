import { IRouter, Router } from "express";
import { IG_DOWNLOAD_ROUTES } from "./constants";
import { instagramDownloadHandler } from "./handler";

export type {
  IG_DOWNLOAD_ITEM,
  IG_DOWNLOAD_POST,
  IG_DOWNLOAD_REQUEST,
  IG_DOWNLOAD_RESPONSE,
} from "./types";
export { IG_DOWNLOAD_REQUEST_SCHEMA } from "./schemas";
export { IG_DOWNLOAD_ROUTES } from "./constants";
export { downloadInstagramMedia } from "./client";

const downloadRoutes: IRouter = Router();

downloadRoutes.post(IG_DOWNLOAD_ROUTES.DOWNLOAD, instagramDownloadHandler);

export default downloadRoutes;
