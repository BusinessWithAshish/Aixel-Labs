import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import { crawlApiHandler } from "./handler";

const crawlRoutes: IRouter = Router();

crawlRoutes.post(
  API_ENDPOINTS.CRAWL.API.route,
  crawlApiHandler,
);

export default crawlRoutes;

export { scrapeCrawl } from "./client";
export { CRAWL_REQUEST_SCHEMA, CRAWL_DOMAIN_OR_URL_SCHEMA } from "./schemas";
export {
  CRAWL,
  CRAWL_ERROR_MESSAGES,
  CRAWL_STATUS,
} from "./constants";
export { domainId, normalizeDomainInput } from "./compute";
export type {
  CRAWL_REQUEST,
  CRAWL_REQUEST_PARSED,
  CRAWL_RESPONSE,
  CRAWL_EMAIL,
  CRAWL_PHONE,
  CRAWL_SOCIALS,
  CRAWL_META,
  CRAWL_STATUS_VALUE,
} from "./types";
