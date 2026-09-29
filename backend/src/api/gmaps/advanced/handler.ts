import type { Request, Response } from "express";
import { ALApiResponse } from "../../types";
import type { GMAPS_DETAILS_RESPONSE } from "../details/types";
import { resolveGmapsAdvancedPlaces } from "./client";
import { GMAPS_ADVANCED_ERROR_MESSAGES } from "./constants";
import { GMAPS_ADVANCED_REQUEST_SCHEMA } from "./schemas";

/** POST /gmaps/advanced — batch Maps URLs → place details leads. */
export async function gmapsAdvancedHandler(req: Request, res: Response) {
  const parsed = GMAPS_ADVANCED_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    const response: ALApiResponse<never> = {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        GMAPS_ADVANCED_ERROR_MESSAGES.INVALID_PARAMS,
    };
    res.status(400).json(response);
    return;
  }

  try {
    const results = await resolveGmapsAdvancedPlaces(parsed.data);
    const response: ALApiResponse<GMAPS_DETAILS_RESPONSE[]> = {
      success: true,
      data: results,
    };
    res.status(200).json(response);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : GMAPS_ADVANCED_ERROR_MESSAGES.GENERIC;
    const status = msg === GMAPS_ADVANCED_ERROR_MESSAGES.NO_RESULTS ? 404 : 500;
    const response: ALApiResponse<never> = {
      success: false,
      error: msg,
    };
    res.status(status).json(response);
  }
}
