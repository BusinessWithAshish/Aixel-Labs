import type { Request, Response } from "express";
import type { ALApiResponse } from "../types";
import { BUSINESS_ERRORS } from "./constants";
import { BusinessRoomError, summarizeRoom } from "./room-store";
import { BUSINESS_ROOM_REQUEST_SCHEMA } from "./schemas";
import type { BusinessRoomSummary } from "./types";

/** Resolves an invite code so a client can tell "wrong code" from "full" before opening a socket. */
export const businessRoomHandler = (req: Request, res: Response) => {
  const parsed = BUSINESS_ROOM_REQUEST_SCHEMA.safeParse(req.params.code);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: BUSINESS_ERRORS.INVALID_PARAMS } satisfies ALApiResponse<never>);
    return;
  }
  try {
    res.json({ success: true, data: summarizeRoom(parsed.data) } satisfies ALApiResponse<BusinessRoomSummary>);
  } catch (err) {
    const message = err instanceof BusinessRoomError ? err.message : BUSINESS_ERRORS.ROOM_NOT_FOUND;
    res.status(404).json({ success: false, error: message } satisfies ALApiResponse<never>);
  }
};
