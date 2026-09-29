// ─────────────────────────────────────────────────────────────
//  GMAPS SCRAPER — HANDLER
//  POST /gmaps/internal
//
//  Thin: parse → call service (client.ts) → ALApiResponse.
//  See client.ts for the session/city/page strategy.
// ─────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import { GmapsInternalValidationError, searchGmapsInternal } from "./client";
import type { GMAPS_INTERNAL_RESPONSE } from "./types";
import { ALApiResponse } from "../../types";
import { GMAPS_REQUEST_SCHEMA } from "../schemas";

export const gmapsInternalHandler = async (req: Request, res: Response) => {
  const parsed = GMAPS_REQUEST_SCHEMA.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Invalid request body" });
    return;
  }

  try {
    const limited = await searchGmapsInternal(parsed.data);
    const response: ALApiResponse<GMAPS_INTERNAL_RESPONSE[]> = {
      success: true,
      data: limited,
    };
    res.status(200).json(response);
  } catch (err) {
    if (err instanceof GmapsInternalValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : "Failed to search Google Maps";
    res.status(500).json({ success: false, error: msg } satisfies ALApiResponse<never>);
  }
};
