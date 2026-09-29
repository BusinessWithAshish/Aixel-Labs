import { FACEBOOK_REQUEST_SCHEMA } from "./schemas";
import type { FACEBOOK_RESPONSE } from "./types";
import { Request, Response } from "express";
import { searchFacebookPages } from "./client";
import { ALApiResponse } from "../types";
import { FACEBOOK_ERROR_MESSAGES } from "./constants";

/** POST /facebook */
export async function facebookApiHandler(req: Request, res: Response) {
  const parsed = FACEBOOK_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: FACEBOOK_ERROR_MESSAGES.INVALID_PARAMS,
    });
    return;
  }

  try {
    const data = await searchFacebookPages(parsed.data);
    const response: ALApiResponse<FACEBOOK_RESPONSE[]> = {
      success: true,
      data,
    };
    res.status(200).json(response);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : FACEBOOK_ERROR_MESSAGES.GENERIC;
    const status = msg === FACEBOOK_ERROR_MESSAGES.MISSING_QUERY_OR_ENTITIES ? 400 : 500;
    const response: ALApiResponse<never> = {
      success: false,
      error: msg,
    };
    res.status(status).json(response);
  }
}
