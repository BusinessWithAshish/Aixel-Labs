import { fetchYoutubeVideoTranscript } from "../../transcript/helpers";
import {
  classifyHook,
  computeOverallWpm,
  computeTitleAlignmentScore,
  computeTotalDurationSeconds,
  detectCtas,
  divideIntoZones,
  estimateIntroLengthSeconds,
  extractTopKeywords,
} from "./compute";
import type {
  YOUTUBE_TRANSCRIPT_INTELLIGENCE_FIELDS,
  YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST,
  YOUTUBE_TRANSCRIPT_INTELLIGENCE_RESPONSE,
  YOUTUBE_TRANSCRIPT_ZONE_TEXT,
} from "./types";
import { YOUTUBE_TRANSCRIPT_ZONE } from "../constants";

/**
 * Fetches the raw transcript and computes the intelligence layer on top:
 * zone division, pacing (WPM overall + per zone), hook classification,
 * CTA detection, keyword frequency, title alignment score, and intro length
 * estimate.
 *
 * The `title` field from the request is optional — when omitted, the
 * `titleAlignmentScore` intelligence field is `null`.
 */
export async function enrichTranscriptIntelligence(
  request: YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST,
): Promise<YOUTUBE_TRANSCRIPT_INTELLIGENCE_RESPONSE> {
  const raw = await fetchYoutubeVideoTranscript({
    videoId: request.videoId,
    language: request.language,
    country: request.country,
    region: request.region,
  });

  const totalDurationSeconds = computeTotalDurationSeconds(raw.lines);
  const zones = divideIntoZones(raw.lines, totalDurationSeconds);

  const fullText = raw.fullText;
  const introZone = zones.find(
    (z) => z.zone === YOUTUBE_TRANSCRIPT_ZONE.INTRO,
  ) as YOUTUBE_TRANSCRIPT_ZONE_TEXT | undefined;
  const introText = introZone?.text ?? "";

  const totalWordCount = zones.reduce((sum, z) => sum + z.wordCount, 0);
  const wordsPerMinute = computeOverallWpm(totalWordCount, totalDurationSeconds);
  const introWordsPerMinute = introZone?.wordsPerMinute ?? null;

  const hookType = classifyHook(introText);
  const ctas = detectCtas(raw.lines, totalDurationSeconds);
  const keywords = extractTopKeywords(raw.lines);
  const titleAlignmentScore = computeTitleAlignmentScore(
    request.title,
    fullText,
    introText,
  );
  const introLengthSeconds = estimateIntroLengthSeconds(raw.lines);

  const intelligence: YOUTUBE_TRANSCRIPT_INTELLIGENCE_FIELDS = {
    totalWordCount,
    totalDurationSeconds,
    wordsPerMinute,
    introWordsPerMinute,
    zones,
    hookType,
    ctas,
    keywords,
    titleAlignmentScore,
    introLengthSeconds,
  };

  return {
    videoId: raw.videoId,
    language: raw.language,
    title: request.title ?? null,
    zones,
    intelligence,
  };
}
