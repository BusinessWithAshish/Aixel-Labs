import type { Request, Response } from "express";

import { evomiConfigured } from "../../utils/fetch-session-common";
import type { ALApiResponse } from "../types";
import { fetchGsearch } from "./client";
import {
  GSEARCH_HANDLER_LABELS,
  GSEARCH_RATE_LIMIT_PATTERN,
} from "./constants";
import { GSEARCH_REQUEST_SCHEMA } from "./schemas";
import type { GSEARCH_RESPONSE } from "./types";

/** POST /gsearch — browserless google.com web results (always proxied). */
export async function gsearchApiHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const label = GSEARCH_HANDLER_LABELS.SEARCH;

  if (!evomiConfigured()) {
    res.status(403).json({
      success: false,
      error: `[${label}] : Missing proxy credentials`,
    });
    return;
  }

  const parsed = GSEARCH_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: `[${label}] : Invalid request parameters`,
    });
    return;
  }

  try {
    const { results } = await fetchGsearch(parsed.data);
    const response: ALApiResponse<GSEARCH_RESPONSE[]> = {
      success: true,
      data: results,
    };
    res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${label}]`, message);
    const status = GSEARCH_RATE_LIMIT_PATTERN.test(message) ? 429 : 502;
    res.status(status).json({
      success: false,
      error: `[${label}] : ${message}`,
    });
  }
}
