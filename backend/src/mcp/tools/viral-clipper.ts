import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { diarizeFromSource } from "../../api/viral-clipper/diarize/audio";
import { diarizeFromYoutubeCaptions } from "../../api/viral-clipper/diarize/captions";
import { scoreViralMoments } from "../../api/viral-clipper/moments/score";
import { runViralClipperPipeline } from "../../api/viral-clipper/pipeline";
import { cutClipsFromVideo } from "../../api/viral-clipper/cut/cut";
import {
  VIRAL_CLIPPER_PIPELINE_REQUEST_SCHEMA,
} from "../../api/viral-clipper/schemas";
import { VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA } from "../../api/viral-clipper/diarize/schemas";
import { VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_SCHEMA } from "../../api/viral-clipper/moments/schemas";
import { VIRAL_CLIPPER_CUT_REQUEST_SCHEMA } from "../../api/viral-clipper/cut/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const VIRAL_CLIPPER_OPS: Record<string, DomainOp> = {
  diarize: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA,
      run: (input) =>
        input.videoUrl
          ? diarizeFromYoutubeCaptions(
              input.videoUrl,
              input.language,
              input.model,
              input.speakerCount,
            )
          : diarizeFromSource(input.audioSource!, input.model),
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
          videoUrl: input.videoUrl,
          language: input.language,
          model: input.model,
          speakerCount: input.speakerCount,
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
};

const VIRAL_CLIPPER_DESCRIPTION = `Podcast/video clip pipeline: speaker labels (YouTube captions or Gemini audio) → viral moments → ffmpeg cut. Raw only.

Call with { op, layer?, input }. layer must be omitted or raw. Needs ffmpeg on the host. YouTube URL media sources are downloaded via the in-house InnerTube client (no external binary). Fetch captions/comments/chapters via the youtube tool, not here.

Ops:
- diarize (raw) — speaker-labelled transcript. Exactly one of: videoUrl (YouTube captions; ASR turns labeled with a Gemini text pass, no audio) or audioSource (Gemini audio). input: videoUrl?, audioSource?, language?, model?, speakerCount?
- moments (raw) — diarized transcript → ranked clip candidates. input: diarized, model?, minCandidates?, maxCandidates?, minClipSeconds?, maxClipSeconds?, channelContext?, audienceSignals?
- pipeline (raw) — diarize + moments in one call. Same source fields as diarize plus minCandidates?, maxCandidates?, minClipSeconds?, maxClipSeconds?, channelContext?, audienceSignals?
- cut (raw) — videoSource + {start,end} ranges → local clip files. input: videoSource, clips[], diarized?, aspectRatio?

Typical flow: videoUrl on diarize/pipeline (captions) OR audioSource (Gemini) → moments → cut. youtube comments intel / chapters → audienceSignals.`;

export function registerViralClipperTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "viral_clipper",
    description: VIRAL_CLIPPER_DESCRIPTION,
    ops: VIRAL_CLIPPER_OPS,
  });
}
