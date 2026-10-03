import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import { businessRoomHandler } from "./handler";

const businessRoutes: IRouter = Router();

businessRoutes.get(API_ENDPOINTS.BUSINESS.ROOM.route, businessRoomHandler);

export default businessRoutes;

export { attachBusinessSocket } from "./socket";
export { BUSINESS_CLIENT_MESSAGE_SCHEMA, BUSINESS_COMMAND_SCHEMA, BUSINESS_OFFER_TERMS_SCHEMA } from "./schemas";
export * from "./constants";
export type * from "./types";
