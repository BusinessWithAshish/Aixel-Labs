import type { Request, Response } from "express";

import { ALApiResponse } from "../types";
import { scrapeCrawl } from "./client";
import { CRAWL_ERROR_MESSAGES } from "./constants";
import { CRAWL_REQUEST_SCHEMA } from "./schemas";
import type { CRAWL_RESPONSE } from "./types";

/** POST /crawl */
export async function crawlApiHandler(req: Request, res: Response) {
  const parsed = CRAWL_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: CRAWL_ERROR_MESSAGES.INVALID_PARAMS,
    } satisfies ALApiResponse<never>);
    return;
  }

  try {
    const data = await scrapeCrawl(parsed.data);
    const response: ALApiResponse<CRAWL_RESPONSE[]> = {
      success: true,
      data,
    };
    res.status(200).json(response);
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : CRAWL_ERROR_MESSAGES.GENERIC;
    const response: ALApiResponse<never> = {
      success: false,
      error: msg,
    };
    res.status(500).json(response);
  }
}
