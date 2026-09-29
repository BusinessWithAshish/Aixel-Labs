import type { Request, Response } from "express";
import { ALApiResponse } from "../../types";
import { fetchGmapsPlaceDetails } from "./client";
import { GMAPS_DETAILS_ERROR_MESSAGES } from "./constants";
import { GMAPS_DETAILS_REQUEST_SCHEMA } from "./schemas";
import type { GMAPS_DETAILS_RESPONSE } from "./types";

/** POST /gmaps/details */
export async function gmapsDetailsHandler(req: Request, res: Response) {
  const parsed = GMAPS_DETAILS_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    const response: ALApiResponse<never> = {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        GMAPS_DETAILS_ERROR_MESSAGES.INVALID_PARAMS,
    };
    res.status(400).json(response);
    return;
  }

  try {
    const place = await fetchGmapsPlaceDetails(parsed.data);
    const response: ALApiResponse<GMAPS_DETAILS_RESPONSE> = {
      success: true,
      data: place,
    };
    res.status(200).json(response);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : GMAPS_DETAILS_ERROR_MESSAGES.GENERIC;
    const status = msg === GMAPS_DETAILS_ERROR_MESSAGES.PLACE_NOT_FOUND ? 404 : 500;
    const response: ALApiResponse<never> = {
      success: false,
      error: msg,
    };
    res.status(status).json(response);
  }
}
