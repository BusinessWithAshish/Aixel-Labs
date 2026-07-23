import type { Request, Response } from "express";
import { ALApiResponse } from "../../../types";
import { fetchInstagramAdvancedSearch } from "./client";
import { IG_ADVANCED_SEARCH_ERROR_MESSAGES } from "./constants";
import { IG_ADVANCED_SEARCH_REQUEST_SCHEMA } from "./schemas";
import type { IG_ADVANCED_SEARCH_RESPONSE } from "./types";

/** POST /instagram/advanced/search */
export async function instagramAdvancedSearchHandler(
  req: Request,
  res: Response,
) {
  const parsed = IG_ADVANCED_SEARCH_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    const response: ALApiResponse<never> = {
      success: false,
      error: IG_ADVANCED_SEARCH_ERROR_MESSAGES.INVALID_PARAMS,
    };
    res.status(400).json(response);
    return;
  }

  try {
    const data = await fetchInstagramAdvancedSearch(parsed.data);
    const response: ALApiResponse<IG_ADVANCED_SEARCH_RESPONSE> = {
      success: true,
      data,
    };
    res.status(200).json(response);
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : IG_ADVANCED_SEARCH_ERROR_MESSAGES.GENERIC;
    const response: ALApiResponse<never> = {
      success: false,
      error: msg,
    };
    res.status(500).json(response);
  }
}
