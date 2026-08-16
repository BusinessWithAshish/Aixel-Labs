import type { Request, Response } from "express";

import { ALApiResponse } from "../types";
import { VIRAL_CLIPPER_ERROR_MESSAGES } from "./constants";
import { cutClipsFromVideo } from "./cut";
import { diarizeFromBlobUrl } from "./diarize";
import { runViralClipperPipeline } from "./pipeline";
import {
  VIRAL_CLIPPER_CUT_REQUEST_SCHEMA,
  VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA,
  VIRAL_CLIPPER_PIPELINE_REQUEST_SCHEMA,
  VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_SCHEMA,
  VIRAL_CLIPPER_YOUTUBE_CHAPTERS_REQUEST_SCHEMA,
  VIRAL_CLIPPER_YOUTUBE_COMMENTS_REQUEST_SCHEMA,
} from "./schemas";
import type {
  VIRAL_CLIPPER_CUT_RESPONSE,
  VIRAL_CLIPPER_DIARIZE_RESPONSE,
  VIRAL_CLIPPER_PIPELINE_RESPONSE,
  VIRAL_CLIPPER_VIRAL_MOMENTS_RESPONSE,
  VIRAL_CLIPPER_YOUTUBE_CHAPTERS_RESPONSE,
  VIRAL_CLIPPER_YOUTUBE_COMMENTS_RESPONSE,
} from "./types";
import { scoreViralMoments } from "./viral-moments";
import { fetchYoutubeChapters } from "./youtube-chapters";
import { fetchYoutubeCommentHighlights } from "./youtube-comments";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : VIRAL_CLIPPER_ERROR_MESSAGES.GENERIC;
}

/** POST /viral-clipper/diarize */
export async function viralClipperDiarizeHandler(req: Request, res: Response) {
  const parsed = VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: VIRAL_CLIPPER_ERROR_MESSAGES.INVALID_PARAMS,
    } satisfies ALApiResponse<never>);
    return;
  }

  try {
    const data = await diarizeFromBlobUrl(parsed.data.blobUrl, parsed.data.model);
    res
      .status(200)
      .json({ success: true, data } satisfies ALApiResponse<VIRAL_CLIPPER_DIARIZE_RESPONSE>);
  } catch (err) {
    res
      .status(502)
      .json({ success: false, error: errorMessage(err) } satisfies ALApiResponse<never>);
  }
}

/** POST /viral-clipper/viral-moments */
export async function viralClipperViralMomentsHandler(req: Request, res: Response) {
  const parsed = VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: VIRAL_CLIPPER_ERROR_MESSAGES.INVALID_PARAMS,
    } satisfies ALApiResponse<never>);
    return;
  }

  try {
    const data = await scoreViralMoments({
      diarized: parsed.data.diarized,
      model: parsed.data.model,
      minCandidates: parsed.data.minCandidates,
      maxCandidates: parsed.data.maxCandidates,
      minClipSeconds: parsed.data.minClipSeconds,
      maxClipSeconds: parsed.data.maxClipSeconds,
      channelContext: parsed.data.channelContext,
      audienceSignals: parsed.data.audienceSignals,
    });
    res.status(200).json({
      success: true,
      data,
    } satisfies ALApiResponse<VIRAL_CLIPPER_VIRAL_MOMENTS_RESPONSE>);
  } catch (err) {
    res
      .status(502)
      .json({ success: false, error: errorMessage(err) } satisfies ALApiResponse<never>);
  }
}

/** POST /viral-clipper/cut — video URL + time ranges in, uploaded clip URLs out. */
export async function viralClipperCutHandler(req: Request, res: Response) {
  const parsed = VIRAL_CLIPPER_CUT_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: VIRAL_CLIPPER_ERROR_MESSAGES.INVALID_PARAMS,
    } satisfies ALApiResponse<never>);
    return;
  }

  try {
    const data = await cutClipsFromVideo(
      parsed.data.videoBlobUrl,
      parsed.data.clips,
      parsed.data.diarized,
      parsed.data.aspectRatio,
    );
    res
      .status(200)
      .json({ success: true, data } satisfies ALApiResponse<VIRAL_CLIPPER_CUT_RESPONSE>);
  } catch (err) {
    res
      .status(502)
      .json({ success: false, error: errorMessage(err) } satisfies ALApiResponse<never>);
  }
}

/** POST /viral-clipper/youtube-comments — video URL in, audience-flagged timestamp highlights out. */
export async function viralClipperYoutubeCommentsHandler(req: Request, res: Response) {
  const parsed = VIRAL_CLIPPER_YOUTUBE_COMMENTS_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: VIRAL_CLIPPER_ERROR_MESSAGES.INVALID_PARAMS,
    } satisfies ALApiResponse<never>);
    return;
  }

  try {
    const data = await fetchYoutubeCommentHighlights(
      parsed.data.videoUrl,
      parsed.data.maxComments,
    );
    res.status(200).json({
      success: true,
      data,
    } satisfies ALApiResponse<VIRAL_CLIPPER_YOUTUBE_COMMENTS_RESPONSE>);
  } catch (err) {
    res
      .status(502)
      .json({ success: false, error: errorMessage(err) } satisfies ALApiResponse<never>);
  }
}

/** POST /viral-clipper/youtube-chapters — video URL in, creator chapter markers out. */
export async function viralClipperYoutubeChaptersHandler(req: Request, res: Response) {
  const parsed = VIRAL_CLIPPER_YOUTUBE_CHAPTERS_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: VIRAL_CLIPPER_ERROR_MESSAGES.INVALID_PARAMS,
    } satisfies ALApiResponse<never>);
    return;
  }

  try {
    const data = await fetchYoutubeChapters(parsed.data.videoUrl);
    res.status(200).json({
      success: true,
      data,
    } satisfies ALApiResponse<VIRAL_CLIPPER_YOUTUBE_CHAPTERS_RESPONSE>);
  } catch (err) {
    res
      .status(502)
      .json({ success: false, error: errorMessage(err) } satisfies ALApiResponse<never>);
  }
}

/** POST /viral-clipper/pipeline — audio URL in, ranked clip candidates out. */
export async function viralClipperPipelineHandler(req: Request, res: Response) {
  const parsed = VIRAL_CLIPPER_PIPELINE_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: VIRAL_CLIPPER_ERROR_MESSAGES.INVALID_PARAMS,
    } satisfies ALApiResponse<never>);
    return;
  }

  try {
    const data = await runViralClipperPipeline({
      blobUrl: parsed.data.blobUrl,
      model: parsed.data.model,
      minCandidates: parsed.data.minCandidates,
      maxCandidates: parsed.data.maxCandidates,
      minClipSeconds: parsed.data.minClipSeconds,
      maxClipSeconds: parsed.data.maxClipSeconds,
      channelContext: parsed.data.channelContext,
      audienceSignals: parsed.data.audienceSignals,
    });
    res
      .status(200)
      .json({ success: true, data } satisfies ALApiResponse<VIRAL_CLIPPER_PIPELINE_RESPONSE>);
  } catch (err) {
    res
      .status(502)
      .json({ success: false, error: errorMessage(err) } satisfies ALApiResponse<never>);
  }
}
