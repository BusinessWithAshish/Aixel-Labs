import type { Request, Response } from "express";
import type { z } from "zod";
import { statusCodeFromError } from "../../config";
import type { ALApiResponse } from "../types";
import { contentLabBreakdownService } from "./breakdown";
import { contentLabCheckService } from "./check";
import { CONTENT_LAB_ERROR_MESSAGES, CONTENT_LAB_HANDLER_LABELS } from "./constants";
import { contentLabCreatorService } from "./creator";
import { contentLabExploreService } from "./explore";
import {
  CONTENT_LAB_BREAKDOWN_REQUEST_SCHEMA,
  CONTENT_LAB_CHECK_REQUEST_SCHEMA,
  CONTENT_LAB_CREATOR_REQUEST_SCHEMA,
  CONTENT_LAB_EXPLORE_REQUEST_SCHEMA,
  CONTENT_LAB_SUGGEST_REQUEST_SCHEMA,
} from "./schemas";
import { contentLabSuggestService } from "./suggest";

/** parse → service → ALApiResponse; a service error's `statusCode` (400/404/502) is kept. */
function createContentLabHandler<TSchema extends z.ZodTypeAny, TData>(
  label: string,
  schema: TSchema,
  run: (input: z.output<TSchema>) => Promise<TData>,
) {
  return async function contentLabHandler(req: Request, res: Response) {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: CONTENT_LAB_ERROR_MESSAGES.INVALID_PARAMS,
      } satisfies ALApiResponse<never>);
      return;
    }
    try {
      const data = await run(parsed.data);
      res.status(200).json({ success: true, data } satisfies ALApiResponse<TData>);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error(`[${label}]`, message);
      res.status(statusCodeFromError(err, err instanceof Error ? 502 : 500)).json({
        success: false,
        error: message,
      } satisfies ALApiResponse<never>);
    }
  };
}

export const contentLabExploreHandler = createContentLabHandler(
  CONTENT_LAB_HANDLER_LABELS.EXPLORE,
  CONTENT_LAB_EXPLORE_REQUEST_SCHEMA,
  contentLabExploreService,
);

export const contentLabBreakdownHandler = createContentLabHandler(
  CONTENT_LAB_HANDLER_LABELS.BREAKDOWN,
  CONTENT_LAB_BREAKDOWN_REQUEST_SCHEMA,
  contentLabBreakdownService,
);

export const contentLabCheckHandler = createContentLabHandler(
  CONTENT_LAB_HANDLER_LABELS.CHECK,
  CONTENT_LAB_CHECK_REQUEST_SCHEMA,
  contentLabCheckService,
);

export const contentLabCreatorHandler = createContentLabHandler(
  CONTENT_LAB_HANDLER_LABELS.CREATOR,
  CONTENT_LAB_CREATOR_REQUEST_SCHEMA,
  contentLabCreatorService,
);

export const contentLabSuggestHandler = createContentLabHandler(
  CONTENT_LAB_HANDLER_LABELS.SUGGEST,
  CONTENT_LAB_SUGGEST_REQUEST_SCHEMA,
  contentLabSuggestService,
);
