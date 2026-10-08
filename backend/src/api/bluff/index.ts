import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import { bluffRoomHandler } from "./handler";

const bluffRoutes: IRouter = Router();

bluffRoutes.get(API_ENDPOINTS.BLUFF.ROOM.route, bluffRoomHandler);

export default bluffRoutes;

export { attachBluffSocket, createBluffGateway } from "./socket";
export { BLUFF_CLIENT_MESSAGE_SCHEMA, BLUFF_COMMAND_SCHEMA } from "./schemas";
export * from "./constants";
export type * from "./types";
