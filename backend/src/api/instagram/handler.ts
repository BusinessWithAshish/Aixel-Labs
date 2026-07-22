import { INSTAGRAM_REQUEST_SCHEMA } from "./schemas";
import type { INSTAGRAM_RESPONSE } from "./types";
import { Request, Response } from "express";
import {
  fetchFromQuery,
  fetchFromEntities,
  hasEntities,
  hasQuery,
} from "./helpers";
import { ALApiResponse } from "../types";
import { INSTAGRAM_ERROR_MESSAGES } from "./constants";

/** POST /instagram */
export async function instagramApiHandler(req: Request, res: Response) {
  const parsed = INSTAGRAM_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: INSTAGRAM_ERROR_MESSAGES.INVALID_PARAMS,
    });
    return;
  }

  try {
    const { entities, query } = parsed.data;

    if (!hasEntities(entities) && !hasQuery(query)) {
      res.status(400).json({
        success: false,
        error: INSTAGRAM_ERROR_MESSAGES.MISSING_QUERY_OR_ENTITIES,
      });
      return;
    }

    if (hasQuery(query) && !hasEntities(entities)) {
      const data = await fetchFromQuery(parsed.data);
      const response: ALApiResponse<INSTAGRAM_RESPONSE[]> = {
        success: true,
        data,
      };
      res.status(200).json(response);
      return;
    }

    if (hasEntities(entities) && !hasQuery(query)) {
      const data = await fetchFromEntities(entities!, parsed.data.country);
      const response: ALApiResponse<INSTAGRAM_RESPONSE[]> = {
        success: true,
        data,
      };
      res.status(200).json(response);
      return;
    }

    const entitiesData = await fetchFromEntities(
      entities!,
      parsed.data.country,
    );
    const queryData = await fetchFromQuery(parsed.data);
    const data = [...entitiesData, ...queryData];
    const response: ALApiResponse<INSTAGRAM_RESPONSE[]> = {
      success: true,
      data,
    };
    res.status(200).json(response);
    return;
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : INSTAGRAM_ERROR_MESSAGES.GENERIC;
    const response: ALApiResponse<never> = {
      success: false,
      error: msg,
    };
    res.status(500).json(response);
    return;
  }
}
