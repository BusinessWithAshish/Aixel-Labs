import type { Request, Response } from "express";
import { statusCodeFromError } from "../../../config";
import { ALApiResponse } from "../../types";
import { downloadInstagramMedia } from "./client";
import { IG_DOWNLOAD_ERROR_MESSAGES } from "./constants";
import { IG_DOWNLOAD_REQUEST_SCHEMA } from "./schemas";
import type { IG_DOWNLOAD_RESPONSE } from "./types";

/** POST /instagram/download */
export async function instagramDownloadHandler(req: Request, res: Response) {
  const parsed = IG_DOWNLOAD_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    const response: ALApiResponse<never> = {
      success: false,
      error: IG_DOWNLOAD_ERROR_MESSAGES.INVALID_PARAMS,
    };
    res.status(400).json(response);
    return;
  }

  try {
    const data = await downloadInstagramMedia(parsed.data);
    const response: ALApiResponse<IG_DOWNLOAD_RESPONSE> = { success: true, data };
    res.status(200).json(response);
  } catch (err) {
    const response: ALApiResponse<never> = {
      success: false,
      error: err instanceof Error ? err.message : IG_DOWNLOAD_ERROR_MESSAGES.GENERIC,
    };
    res.status(statusCodeFromError(err, 500)).json(response);
  }
}
