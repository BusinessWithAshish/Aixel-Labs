import { createViralClipperHandler } from "./create-handler";
import { runViralClipperPipeline } from "./pipeline";
import { VIRAL_CLIPPER_PIPELINE_REQUEST_SCHEMA } from "./schemas";

export { viralClipperDiarizeHandler } from "./diarize/handler";
export { viralClipperViralMomentsHandler } from "./moments/handler";
export { viralClipperCutHandler } from "./cut/handler";

/** POST /viral-clipper/pipeline — diarize + viral moments in one call. */
export const viralClipperPipelineHandler = createViralClipperHandler({
  label: "VIRAL_CLIPPER/PIPELINE",
  schema: VIRAL_CLIPPER_PIPELINE_REQUEST_SCHEMA,
  fetch: (input) =>
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
});
