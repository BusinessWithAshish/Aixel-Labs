import type { Request, Response } from "express";
import type { z } from "zod";

import { statusCodeFromError } from "../../config";
import type { ALApiResponse } from "../types";
import { lineFinderCaptionsService, lineFinderCheckSpeakerService, lineFinderDiscoverService } from "./client";
import { LINE_FINDER_ERROR_MESSAGES, LINE_FINDER_HANDLER_LABEL } from "./constants";
import {
  LINE_FINDER_CAPTIONS_REQUEST_SCHEMA,
  LINE_FINDER_CHECK_SPEAKER_REQUEST_SCHEMA,
  LINE_FINDER_DISCOVER_REQUEST_SCHEMA,
} from "./schemas";

/** parse → service → ALApiResponse; a service error's `statusCode` is kept. */
function createLineFinderHandler<TSchema extends z.ZodTypeAny, TData>(
  schema: TSchema,
  run: (input: z.output<TSchema>) => Promise<TData>,
) {
  return async function lineFinderHandler(req: Request, res: Response) {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: LINE_FINDER_ERROR_MESSAGES.INVALID_PARAMS,
      } satisfies ALApiResponse<never>);
      return;
    }
    try {
      const data = await run(parsed.data);
      res.status(200).json({ success: true, data } satisfies ALApiResponse<TData>);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error(`${LINE_FINDER_HANDLER_LABEL} ${message}`);
      res.status(statusCodeFromError(err, 500)).json({ success: false, error: message } satisfies ALApiResponse<never>);
    }
  };
}

export const lineFinderDiscoverHandler = createLineFinderHandler(
  LINE_FINDER_DISCOVER_REQUEST_SCHEMA,
  lineFinderDiscoverService,
);

export const lineFinderCaptionsHandler = createLineFinderHandler(
  LINE_FINDER_CAPTIONS_REQUEST_SCHEMA,
  lineFinderCaptionsService,
);

export const lineFinderCheckSpeakerHandler = createLineFinderHandler(
  LINE_FINDER_CHECK_SPEAKER_REQUEST_SCHEMA,
  lineFinderCheckSpeakerService,
);
