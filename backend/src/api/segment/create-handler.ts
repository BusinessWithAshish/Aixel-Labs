import type { Request, Response } from "express";
import type { z } from "zod";

import { statusCodeFromError } from "../../config";
import { ALApiResponse } from "../types";
import { SEGMENT_ERROR_MESSAGES } from "./constants";

/** Thin handler factory — same shape as video/create-handler.ts: parse -> service -> envelope. */
export function createSegmentHandler<TResponse, TSchema extends z.ZodTypeAny>(options: {
  label: string;
  schema: TSchema;
  fetch: (input: z.infer<TSchema>) => Promise<TResponse>;
}) {
  const { label, schema, fetch } = options;

  return async function segmentHandler(req: Request, res: Response) {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: SEGMENT_ERROR_MESSAGES.INVALID_PARAMS,
      } satisfies ALApiResponse<never>);
      return;
    }

    try {
      const data = await fetch(parsed.data);
      res.status(200).json({ success: true, data } satisfies ALApiResponse<TResponse>);
    } catch (err) {
      const message = err instanceof Error ? err.message : SEGMENT_ERROR_MESSAGES.GENERIC;
      console.error(`[${label}]`, message);
      res
        .status(statusCodeFromError(err))
        .json({ success: false, error: message } satisfies ALApiResponse<never>);
    }
  };
}
