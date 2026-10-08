import type { Request, Response } from "express";
import type { ALApiResponse } from "../types";
import { BLUFF_ERRORS } from "./constants";
import { BluffRoomError, summarizeRoom } from "./room-store";
import { BLUFF_ROOM_REQUEST_SCHEMA } from "./schemas";
import type { BluffRoomSummary } from "./types";

/** Resolves an invite code so a client can tell "wrong code" from "full" before opening a socket. */
export const bluffRoomHandler = (req: Request, res: Response) => {
  const parsed = BLUFF_ROOM_REQUEST_SCHEMA.safeParse(req.params.code);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: BLUFF_ERRORS.INVALID_PARAMS } satisfies ALApiResponse<never>);
    return;
  }
  try {
    res.json({ success: true, data: summarizeRoom(parsed.data) } satisfies ALApiResponse<BluffRoomSummary>);
  } catch (err) {
    const message = err instanceof BluffRoomError ? err.message : BLUFF_ERRORS.ROOM_NOT_FOUND;
    res.status(404).json({ success: false, error: message } satisfies ALApiResponse<never>);
  }
};
