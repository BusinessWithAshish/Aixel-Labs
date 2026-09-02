import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { diarizeFromSource } from "../../api/viral-clipper/diarize";
import { scoreViralMoments } from "../../api/viral-clipper/viral-moments";
import { runViralClipperPipeline } from "../../api/viral-clipper/pipeline";
import { cutClipsFromVideo } from "../../api/viral-clipper/cut";
import { fetchYoutubeChapters } from "../../api/viral-clipper/youtube-chapters";
import { fetchYoutubeCommentHighlights } from "../../api/viral-clipper/youtube-comments";
import {
  VIRAL_CLIPPER_CUT_REQUEST_SCHEMA,
  VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA,
  VIRAL_CLIPPER_PIPELINE_REQUEST_SCHEMA,
  VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_SCHEMA,
  VIRAL_CLIPPER_YOUTUBE_CHAPTERS_REQUEST_SCHEMA,
  VIRAL_CLIPPER_YOUTUBE_COMMENTS_REQUEST_SCHEMA,
} from "../../api/viral-clipper/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const VIRAL_CLIPPER_OPS: Record<string, DomainOp> = {
  diarize: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA,
      run: (input) => diarizeFromSource(input.audioSource, input.model),
    },
  },
  moments: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_SCHEMA,
      run: (input) =>
        scoreViralMoments({
          diarized: input.diarized,
          model: input.model,
          minCandidates: input.minCandidates,
          maxCandidates: input.maxCandidates,
          minClipSeconds: input.minClipSeconds,
          maxClipSeconds: input.maxClipSeconds,
          channelContext: input.channelContext,
          audienceSignals: input.audienceSignals,
        }),
    },
  },
  pipeline: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: VIRAL_CLIPPER_PIPELINE_REQUEST_SCHEMA,
      run: (input) =>
        runViralClipperPipeline({
          audioSource: input.audioSource,
          model: input.model,
          minCandidates: input.minCandidates,
          maxCandidates: input.maxCandidates,
          minClipSeconds: input.minClipSeconds,
          maxClipSeconds: input.maxClipSeconds,
          channelContext: input.channelContext,
          audienceSignals: input.audienceSignals,
        }),
    },
  },
  cut: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: VIRAL_CLIPPER_CUT_REQUEST_SCHEMA,
      run: (input) =>
        cutClipsFromVideo(
          input.videoSource,
          input.clips,
          input.diarized,
          input.aspectRatio,
        ),
    },
  },
  comment_highlights: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: VIRAL_CLIPPER_YOUTUBE_COMMENTS_REQUEST_SCHEMA,
      run: (input) =>
        fetchYoutubeCommentHighlights(input.videoUrl, input.maxComments),
    },
  },
  chapters: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: VIRAL_CLIPPER_YOUTUBE_CHAPTERS_REQUEST_SCHEMA,
      run: (input) => fetchYoutubeChapters(input.videoUrl),
    },
  },
};

const VIRAL_CLIPPER_DESCRIPTION = `Podcast/video clip pipeline (Gemini diarize + viral moments + ffmpeg cut). Comments/chapters use InnerTube. Raw only.

Call with { op, layer?, input }. layer must be omitted or raw. Needs ffmpeg on the host. YouTube URL sources are downloaded via the in-house InnerTube client (no external binary).

Ops:
- diarize (raw) — audioSource → speaker-labelled transcript. input: audioSource, model?
- moments (raw) — diarized transcript → ranked clip candidates. input: diarized, model?, minCandidates?, maxCandidates?, minClipSeconds?, maxClipSeconds?, channelContext?, audienceSignals?
- pipeline (raw) — diarize + moments in one call. input: audioSource, model?, minCandidates?, maxCandidates?, minClipSeconds?, maxClipSeconds?, channelContext?, audienceSignals?
- cut (raw) — videoSource + {start,end} ranges → local clip files. input: videoSource, clips[], diarized?, aspectRatio?
- comment_highlights (raw) — InnerTube timestamp clusters from top comments for clip priors. NOT the raw youtube comments list. input: videoUrl, maxComments?
- chapters (raw) — creator chapter markers via InnerTube get_watch. Empty chapters[] is valid. input: videoUrl

Typical flow: comment_highlights/chapters → audienceSignals on pipeline or moments → cut.`;

export function registerViralClipperTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "viral_clipper",
    description: VIRAL_CLIPPER_DESCRIPTION,
    ops: VIRAL_CLIPPER_OPS,
  });
}
