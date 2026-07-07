import type { Request, Response } from "express";

import { evomiConfigured } from "../../utils/fetch-session-common";
import type { ALApiResponse } from "../types";
import { GSEARCH_LABEL } from "./constants";
import { fetchGsearch } from "./client";
import { GSEARCH_REQUEST_SCHEMA } from "./schemas";
import type { GsearchResponse } from "./types";

/** POST /gsearch — browserless google.com web results (always proxied). */
export async function gsearchHandler(req: Request, res: Response): Promise<void> {
  if (!evomiConfigured()) {
    res.status(403).json({
      success: false,
      error: `[${GSEARCH_LABEL}] : Missing proxy credentials`,
    });
    return;
  }

  const parsed = GSEARCH_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: `[${GSEARCH_LABEL}] : Invalid request parameters`,
    });
    return;
  }

  try {
    const data = await fetchGsearch(parsed.data);
    const response: ALApiResponse<GsearchResponse> = { success: true, data };
    res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${GSEARCH_LABEL}]`, message);
    // A 429 from Google means the proxy IP is rate-limited — surface as 502.
    const status = /HTTP 429|\(429\)/.test(message) ? 429 : 502;
    res.status(status).json({
      success: false,
      error: `[${GSEARCH_LABEL}] : ${message}`,
    });
  }
}
