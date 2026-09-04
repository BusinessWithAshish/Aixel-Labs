import { createViralClipperHandler } from "../create-handler";
import { VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_SCHEMA } from "./schemas";
import { scoreViralMoments } from "./score";

/** POST /viral-clipper/viral-moments — diarized transcript in, ranked clip candidates out. */
export const viralClipperViralMomentsHandler = createViralClipperHandler({
  label: "VIRAL_CLIPPER/VIRAL_MOMENTS",
  schema: VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_SCHEMA,
  fetch: (input) =>
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
});
