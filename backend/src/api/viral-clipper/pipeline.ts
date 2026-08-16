import { diarizeFromBlobUrl } from "./diarize";
import type { VIRAL_CLIPPER_PIPELINE_RESPONSE } from "./types";
import { scoreViralMoments } from "./viral-moments";

export type RunViralClipperPipelineOptions = {
  blobUrl: string;
  model: string;
  minCandidates: number;
  maxCandidates: number;
  minClipSeconds: number;
  maxClipSeconds: number;
  channelContext?: string;
  audienceSignals?: string[];
};

/** Full viral-clipper pipeline: audio URL -> diarized transcript -> ranked clip candidates. */
export async function runViralClipperPipeline(
  options: RunViralClipperPipelineOptions,
): Promise<VIRAL_CLIPPER_PIPELINE_RESPONSE> {
  const {
    blobUrl,
    model,
    minCandidates,
    maxCandidates,
    minClipSeconds,
    maxClipSeconds,
    channelContext,
    audienceSignals,
  } = options;

  const diarized = await diarizeFromBlobUrl(blobUrl, model);
  const viral = await scoreViralMoments({
    diarized: diarized.transcript,
    model,
    minCandidates,
    maxCandidates,
    minClipSeconds,
    maxClipSeconds,
    channelContext,
    audienceSignals,
  });

  return {
    transcript: diarized.transcript,
    candidates: viral.candidates,
    podcast_tone: viral.podcast_tone,
    podcast_tone_note: viral.podcast_tone_note,
    usage: {
      diarize: diarized.usage,
      viralMoments: viral.usage,
    },
  };
}
