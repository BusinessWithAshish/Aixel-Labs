import { Request, Response } from "express";
import { fetchGSearch } from "./helpers";
import { GSEARCH_REQUEST_SCHEMA } from "./schemas";
import { GSEARCH_RESPONSE } from "./types";
import { ALApiResponse } from "../types";

// ─── Handler: POST /gsearch ───────────────────────────
export async function gsearchApiHandler(req: Request, res: Response) {
  const requestBody = GSEARCH_REQUEST_SCHEMA.safeParse(req.body);

  if (!process.env.EVOMI_PROXY_USERNAME || !process.env.EVOMI_PROXY_PASSWORD) {
    res.status(403).json({
      success: false,
      error: "[GSEARCH] : Missing proxy credentials",
    });
    return;
  }

  if (!requestBody.success) {
    res.status(400).json({
      success: false,
      error: "[GSEARCH] : Invalid request parameters",
    });
    return;
  }

  try {
    const finalResults = await fetchGSearch(requestBody.data);

    const response: ALApiResponse<GSEARCH_RESPONSE[]> = {
      success: true,
      data: finalResults,
    };

    res.status(200).json(response);
    return;
  }
  catch (error) {
    console.error("[GSEARCH] : Error fetching results", error);
    res.status(500).json({
      success: false,
      error: "[GSEARCH] : Internal server error",
    });
    return;
  }

}
