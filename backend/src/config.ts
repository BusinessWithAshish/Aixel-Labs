import { YOUTUBE_API_ROUTES } from "./api/youtube/constants";
import { YOUTUBE_INTELLIGENCE_ROUTES } from "./api/youtube/intelligence/constants";
import { GOOGLE_TRENDS_API_ROUTES } from "./api/google-trends/constants";
import { IG_ADVANCED_ROUTES } from "./api/instagram/advanced/constants";
import { INSTAGRAM_INTELLIGENCE_ROUTES } from "./api/instagram/intelligence/constants";
import { GMAPS_DETAILS_ROUTES } from "./api/gmaps/details/constants";
import { GMAPS_ADVANCED_ROUTES } from "./api/gmaps/advanced/constants";

export enum ENDPOINTS {
  HOME = "/",
  GMAPS = "/gmaps",
  INSTAGRAM = "/instagram",
  FACEBOOK = "/facebook",
  LINKEDIN = "/linkedin",
  YOUTUBE = "/youtube",
  GSEARCH = "/gsearch",
  GOOGLE_TRENDS = "/google-trends",
  TRANSCRIPTION = "/transcription",
  VIRAL_CLIPPER = "/viral-clipper",
  MCP = "/mcp",
  SAMPLE = "/sample",
}

/**
 * Endpoints that must NOT be mounted when running on Vercel (`routes.ts`
 * skips `app.use` for these when `IS_VERCEL_RUNTIME` is true) — long-running
 * jobs that would exceed Vercel's serverless function time limit (10s-15min
 * depending on plan; nowhere near enough for a 20+ minute chunked Gemini
 * pipeline), and/or that shell out to system binaries (yt-dlp, ffmpeg) not
 * guaranteed present on Vercel's build image. These are meant to run on a
 * persistent process instead (this project's Ubuntu VPS) — see each
 * module's README for why it's listed here before adding more.
 */
export const VPS_ONLY_ENDPOINTS: ENDPOINTS[] = [ENDPOINTS.VIRAL_CLIPPER];

/**
 * Vercel sets `VERCEL=1` automatically on every deployment (already relied
 * on in `server.ts` to skip `app.listen`) — reused here as the single
 * signal for "am I running as a Vercel serverless function" vs. a normal
 * persistent process (VPS, local dev). No separate env var to configure.
 */
export const IS_VERCEL_RUNTIME = !!process.env.VERCEL;

/** `routes.ts` (and `mcp/server.ts` for tool registration) guard mounts with this instead of repeating the IS_VERCEL_RUNTIME + VPS_ONLY_ENDPOINTS check inline. */
export function isEndpointAllowedOnCurrentRuntime(endpoint: ENDPOINTS): boolean {
  return !IS_VERCEL_RUNTIME || !VPS_ONLY_ENDPOINTS.includes(endpoint);
}

export const ALLOWED_ORIGINS_DEV_REGEX = [
  /^http:\/\/.*\.localhost:3003$/,
  /^https:\/\/.*\.aixellabs\.com$/,
];

export const ALLOWED_ORIGINS_PROD_REGEX = [/^https:\/\/.*\.aixellabs\.com$/];

/**
 * Single config per endpoint: `route` for backend Express, `full` for frontend API calls.
 */
export const API_ENDPOINTS = {
  LINKEDIN: {
    API: { route: "/", full: `${ENDPOINTS.LINKEDIN}` },
  },
  FACEBOOK: {
    API: { route: "/", full: `${ENDPOINTS.FACEBOOK}` },
  },
  HOME: {
    API: { route: "/", full: `${ENDPOINTS.HOME}` },
  },
  PING: "/v1/ping",
  GMAPS: {
    INTERNAL: { route: "/internal", full: `${ENDPOINTS.GMAPS}/internal` },
    DETAILS: {
      route: GMAPS_DETAILS_ROUTES.DETAILS,
      full: `${ENDPOINTS.GMAPS}${GMAPS_DETAILS_ROUTES.DETAILS}`,
    },
    ADVANCED: {
      route: GMAPS_ADVANCED_ROUTES.ADVANCED,
      full: `${ENDPOINTS.GMAPS}${GMAPS_ADVANCED_ROUTES.ADVANCED}`,
    },
  },
  INSTAGRAM: {
    API: { route: "/", full: `${ENDPOINTS.INSTAGRAM}` },
    ADVANCED_POSTS: {
      route: IG_ADVANCED_ROUTES.POSTS,
      full: `${ENDPOINTS.INSTAGRAM}${IG_ADVANCED_ROUTES.POSTS}`,
    },
    ADVANCED_SEARCH: {
      route: IG_ADVANCED_ROUTES.SEARCH,
      full: `${ENDPOINTS.INSTAGRAM}${IG_ADVANCED_ROUTES.SEARCH}`,
    },
    ADVANCED_POPULAR: {
      route: IG_ADVANCED_ROUTES.POPULAR,
      full: `${ENDPOINTS.INSTAGRAM}${IG_ADVANCED_ROUTES.POPULAR}`,
    },
    INTELLIGENCE: {
      ACCOUNT: {
        route: INSTAGRAM_INTELLIGENCE_ROUTES.ACCOUNT,
        full: `${ENDPOINTS.INSTAGRAM}${INSTAGRAM_INTELLIGENCE_ROUTES.ACCOUNT}`,
      },
    },
  },
  YOUTUBE: {
    SEARCH: {
      route: YOUTUBE_API_ROUTES.SEARCH,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.SEARCH}`,
    },
    SUGGEST: {
      route: YOUTUBE_API_ROUTES.SUGGEST,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.SUGGEST}`,
    },
    VIDEO: {
      route: YOUTUBE_API_ROUTES.VIDEO,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.VIDEO}`,
    },
    VIDEO_SUGGESTED: {
      route: YOUTUBE_API_ROUTES.VIDEO_SUGGESTED,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.VIDEO_SUGGESTED}`,
    },
    VIDEO_TRANSCRIPT: {
      route: YOUTUBE_API_ROUTES.VIDEO_TRANSCRIPT,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.VIDEO_TRANSCRIPT}`,
    },
    CHANNEL: {
      route: YOUTUBE_API_ROUTES.CHANNEL,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.CHANNEL}`,
    },
    HANDLE: {
      route: YOUTUBE_API_ROUTES.HANDLE,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.HANDLE}`,
    },
    INTELLIGENCE: {
      SEARCH: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.SEARCH,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.SEARCH}`,
      },
      VIDEO: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.VIDEO,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.VIDEO}`,
      },
      VIDEO_SUGGESTED: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.VIDEO_SUGGESTED,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.VIDEO_SUGGESTED}`,
      },
      VIDEO_TRANSCRIPT: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.VIDEO_TRANSCRIPT,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.VIDEO_TRANSCRIPT}`,
      },
      CHANNEL: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.CHANNEL,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.CHANNEL}`,
      },
      HANDLE: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.HANDLE,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.HANDLE}`,
      },
      SUGGEST: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.SUGGEST,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.SUGGEST}`,
      },
    },
  },
  GSEARCH: {
    SEARCH: { route: "/", full: `${ENDPOINTS.GSEARCH}` },
    SEARCH_V2: { route: "/v2", full: `${ENDPOINTS.GSEARCH}/v2` },
  },
  GOOGLE_TRENDS: {
    TRENDING: {
      route: GOOGLE_TRENDS_API_ROUTES.TRENDING,
      full: `${ENDPOINTS.GOOGLE_TRENDS}${GOOGLE_TRENDS_API_ROUTES.TRENDING}`,
    },
    INTEREST: {
      route: GOOGLE_TRENDS_API_ROUTES.INTEREST,
      full: `${ENDPOINTS.GOOGLE_TRENDS}${GOOGLE_TRENDS_API_ROUTES.INTEREST}`,
    },
    INTELLIGENCE_INTEREST: {
      route: GOOGLE_TRENDS_API_ROUTES.INTELLIGENCE_INTEREST,
      full: `${ENDPOINTS.GOOGLE_TRENDS}${GOOGLE_TRENDS_API_ROUTES.INTELLIGENCE_INTEREST}`,
    },
    INTELLIGENCE_COMPARE: {
      route: GOOGLE_TRENDS_API_ROUTES.INTELLIGENCE_COMPARE,
      full: `${ENDPOINTS.GOOGLE_TRENDS}${GOOGLE_TRENDS_API_ROUTES.INTELLIGENCE_COMPARE}`,
    },
  },
  MCP: {
    ROOT: { route: "/", full: `${ENDPOINTS.MCP}` },
    HEALTH: { route: "/health", full: `${ENDPOINTS.MCP}/health` },
  },
  SAMPLE: {
    API: { route: "/api", full: `${ENDPOINTS.SAMPLE}/api` },
  },
  TRANSCRIPTION: {
    BLOB_UPLOAD: {
      route: "/blob-upload",
      full: `${ENDPOINTS.TRANSCRIPTION}/blob-upload`,
    },
    TRANSCRIBE: { route: "/", full: `${ENDPOINTS.TRANSCRIPTION}` },
  },
  VIRAL_CLIPPER: {
    DIARIZE: {
      route: "/diarize",
      full: `${ENDPOINTS.VIRAL_CLIPPER}/diarize`,
    },
    VIRAL_MOMENTS: {
      route: "/viral-moments",
      full: `${ENDPOINTS.VIRAL_CLIPPER}/viral-moments`,
    },
    PIPELINE: {
      route: "/pipeline",
      full: `${ENDPOINTS.VIRAL_CLIPPER}/pipeline`,
    },
    CUT: {
      route: "/cut",
      full: `${ENDPOINTS.VIRAL_CLIPPER}/cut`,
    },
    YOUTUBE_COMMENTS: {
      route: "/youtube-comments",
      full: `${ENDPOINTS.VIRAL_CLIPPER}/youtube-comments`,
    },
    YOUTUBE_CHAPTERS: {
      route: "/youtube-chapters",
      full: `${ENDPOINTS.VIRAL_CLIPPER}/youtube-chapters`,
    },
  },
} as const;
