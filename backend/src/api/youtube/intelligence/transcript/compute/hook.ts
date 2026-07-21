import {
  YOUTUBE_TRANSCRIPT_HOOK_INTRO_CHARS,
  YOUTUBE_TRANSCRIPT_HOOK_TYPE,
} from "../../constants";
import type { YOUTUBE_TRANSCRIPT_HOOK_TYPE_VALUE } from "../types";

const HOOK_PATTERNS: Array<{
  type: YOUTUBE_TRANSCRIPT_HOOK_TYPE_VALUE;
  patterns: RegExp[];
}> = [
  {
    type: YOUTUBE_TRANSCRIPT_HOOK_TYPE.QUESTION,
    patterns: [
      /^(what|why|how|when|who|which|where|do|does|did|can|could|would|should|is|are|have|has|want to know|ever wonder)\b/i,
      /\?\s/,
    ],
  },
  {
    type: YOUTUBE_TRANSCRIPT_HOOK_TYPE.BOLD_CLAIM,
    patterns: [
      /^(this is the (best|worst|only|ultimate)|you (need to|have to|must)|the truth is|never (do|use|buy)|always (do|use)|everything you know is (wrong|a lie)|the (biggest|most) (mistake|important))\b/i,
      /^(stop (doing|using|buying)|don't (do|use|buy|ever))\b/i,
    ],
  },
  {
    type: YOUTUBE_TRANSCRIPT_HOOK_TYPE.STORY,
    patterns: [
      /^(so i|so we|a few (years|months|weeks|days) ago|last (week|month|year|night)|yesterday|when i was|years ago|i remember|back in (the day|college|school)|once (upon a time|when))\b/i,
    ],
  },
  {
    type: YOUTUBE_TRANSCRIPT_HOOK_TYPE.DIRECT_ADDRESS,
    patterns: [
      /^(you|your|you're|you are|you have|you need|you want|if you|let me ask you)\b/i,
    ],
  },
  {
    type: YOUTUBE_TRANSCRIPT_HOOK_TYPE.SHOCK_STAT,
    patterns: [
      /^(\d{1,3}(\.\d+)?%|\$\d|9 out of 10|did you know|here's a (number|stat|fact)|a (recent|new) (study|survey|report) found|according to)\b/i,
      /^\d+\s*(percent|million|billion|thousand|people|hours|minutes|days|years)\b/i,
    ],
  },
  {
    type: YOUTUBE_TRANSCRIPT_HOOK_TYPE.DEMONSTRATION,
    patterns: [
      /^(let me show|watch this|here's how|look at this|check this out|let's (do|try|build|make)|in this video (i'm|we're|we will))\b/i,
    ],
  },
];

/** Classifies the hook type from the intro zone text. */
export function classifyHook(introText: string): YOUTUBE_TRANSCRIPT_HOOK_TYPE_VALUE {
  const trimmed = introText.trim();
  if (!trimmed) return YOUTUBE_TRANSCRIPT_HOOK_TYPE.STANDARD;
  const firstChunk = trimmed.slice(0, YOUTUBE_TRANSCRIPT_HOOK_INTRO_CHARS);
  for (const { type, patterns } of HOOK_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(firstChunk)) {
        return type;
      }
    }
  }
  return YOUTUBE_TRANSCRIPT_HOOK_TYPE.STANDARD;
}
