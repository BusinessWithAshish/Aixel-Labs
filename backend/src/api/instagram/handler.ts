import { INSTAGRAM_REQUEST_SCHEMA } from "./schemas";
import { INSTAGRAM_RESPONSE } from "./types";
import { Request, Response } from "express";
import {
  fetchFromQuery,
  fetchFromEntities,
  hasEntities,
  hasQuery,
} from "./helpers";
import { ALApiResponse } from "../types";

// ─── Handler: POST /instagram ───────────────────────────
export async function instagramApiHandler(req: Request, res: Response) {
  const parsed = INSTAGRAM_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Invalid query parameters" });
    return;
  }

  try {
    const { entities, query } = parsed.data;

    // NO ENTITIES AND NO QUERY
    if (!hasEntities(entities) && !hasQuery(query)) {
      res.status(400).json({
        success: false,
        error: "Provide an instagram query or usernames/URL(s)",
      });
      return;
    }

    // QUERY ONLY
    if (hasQuery(query) && !hasEntities(entities)) {
      const data = await fetchFromQuery(parsed.data);
      const response: ALApiResponse<INSTAGRAM_RESPONSE[]> = {
        success: true,
        data,
      };
      res.status(200).json(response);
      return;
    }

    // ENTITIES ONLY
    if (hasEntities(entities) && !hasQuery(query)) {
      const data = await fetchFromEntities(entities!);
      const response: ALApiResponse<INSTAGRAM_RESPONSE[]> = {
        success: true,
        data,
      };
      res.status(200).json(response);
      return;
    }

    // BOTH ENTITIES AND QUERY
    const entitiesData = await fetchFromEntities(entities!);
    const queryData = await fetchFromQuery(parsed.data);
    const data = [...entitiesData, ...queryData];
    const response: ALApiResponse<INSTAGRAM_RESPONSE[]> = {
      success: true,
      data,
    };
    res.status(200).json(response);
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Instagram API error";
    const response: ALApiResponse<never> = {
      success: false,
      error: msg,
    }
    res
      .status(500)
      .json(response);
    return;
  }
}
