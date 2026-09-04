import type { Request, Response } from "express";
import type { z } from "zod";

import { statusCodeFromError } from "../../config";
import { ALApiResponse } from "../types";
import { VIRAL_CLIPPER_ERROR_MESSAGES } from "./constants";

/**
 * Thin handler factory for the clipper's stage routes — same shape as
 * `youtube/create-handler.ts`, minus resolveInput (no input needs async
 * resolution here). Keeps every stage handler to parse → service → envelope.
 * The error envelope deliberately matches the clipper's historical shape
 * (unprefixed messages) so existing callers see no behavior change.
 */
export function createViralClipperHandler<
  TResponse,
  TSchema extends z.ZodTypeAny,
>(options: {
  label: string;
  schema: TSchema;
  fetch: (input: z.infer<TSchema>) => Promise<TResponse>;
}) {
  const { label, schema, fetch } = options;

  return async function viralClipperHandler(req: Request, res: Response) {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: VIRAL_CLIPPER_ERROR_MESSAGES.INVALID_PARAMS,
      } satisfies ALApiResponse<never>);
      return;
    }

    try {
      const data = await fetch(parsed.data);
      res.status(200).json({ success: true, data } satisfies ALApiResponse<TResponse>);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : VIRAL_CLIPPER_ERROR_MESSAGES.GENERIC;
      console.error(`[${label}]`, message);
      res
        .status(statusCodeFromError(err))
        .json({ success: false, error: message } satisfies ALApiResponse<never>);
    }
  };
}
