import { diarizeFromYoutubeCaptions } from "./diarize/captions";
import { diarizeFromSource } from "./diarize/audio";
import type { VIRAL_CLIPPER_PIPELINE_RESPONSE } from "./types";
import { scoreViralMoments } from "./moments/score";

export type RunViralClipperPipelineOptions = {
  audioSource?: string;
  videoUrl?: string;
  language?: string;
  model: string;
  speakerCount?: number;
  minCandidates: number;
  maxCandidates: number;
  minClipSeconds: number;
  maxClipSeconds: number;
  channelContext?: string;
  audienceSignals?: string[];
};

/** Full viral-clipper pipeline: audio or YouTube captions -> diarized transcript -> ranked clip candidates. */
export async function runViralClipperPipeline(
  options: RunViralClipperPipelineOptions,
): Promise<VIRAL_CLIPPER_PIPELINE_RESPONSE> {
  const {
    audioSource,
    videoUrl,
    language,
    model,
    speakerCount,
    minCandidates,
    maxCandidates,
    minClipSeconds,
    maxClipSeconds,
    channelContext,
    audienceSignals,
  } = options;

  const diarized = videoUrl
    ? await diarizeFromYoutubeCaptions(videoUrl, language, model, speakerCount)
    : await diarizeFromSource(audioSource!, model);
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
