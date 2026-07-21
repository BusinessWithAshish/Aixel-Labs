import type { Request, Response } from "express";
import type { z } from "zod";
import type { ALApiResponse } from "../types";

export type GoogleTrendsErrorMapping = {
  statusCode: number;
  message: string;
};

export type CreateGoogleTrendsHandlerOptions<
  TResponse,
  TSchema extends z.ZodTypeAny,
> = {
  label: string;
  schema: TSchema;
  fetch: (input: z.infer<TSchema>) => Promise<TResponse>;
  mapError?: (err: unknown) => GoogleTrendsErrorMapping | null;
};

export function createGoogleTrendsHandler<
  TResponse,
  TSchema extends z.ZodTypeAny,
>(options: CreateGoogleTrendsHandlerOptions<TResponse, TSchema>) {
  const { label, schema, fetch, mapError } = options;

  return async function googleTrendsHandler(req: Request, res: Response) {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: `[${label}] : Invalid request parameters`,
      });
      return;
    }

    try {
      const data = await fetch(parsed.data);

      const response: ALApiResponse<typeof data> = {
        success: true,
        data,
      };

      res.status(200).json(response);
    } catch (err) {
      const mapped = mapError?.(err);
      if (mapped) {
        console.error(`[${label}]`, mapped.message);
        res.status(mapped.statusCode).json({
          success: false,
          error: `[${label}] : ${mapped.message}`,
        });
        return;
      }

      if (err instanceof Error) {
        console.error(`[${label}]`, err.message);
        res.status(502).json({
          success: false,
          error: `[${label}] : ${err.message}`,
        });
        return;
      }

      console.error(`[${label}] Unexpected error:`, err);
      res.status(500).json({
        success: false,
        error: `[${label}] : Internal server error`,
      });
    }
  };
}
