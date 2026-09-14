import { existsSync } from "node:fs";

import { YOUTUBE_API_ROUTES } from "./api/youtube/constants";
import { YOUTUBE_INTELLIGENCE_ROUTES } from "./api/youtube/intelligence/constants";
import { GOOGLE_TRENDS_API_ROUTES } from "./api/google-trends/constants";
import { IG_ADVANCED_ROUTES } from "./api/instagram/advanced/constants";
import { INSTAGRAM_INTELLIGENCE_ROUTES } from "./api/instagram/intelligence/constants";
import { IG_DOWNLOAD_ROUTES } from "./api/instagram/download/constants";
import { GMAPS_DETAILS_ROUTES } from "./api/gmaps/details/constants";
import { GMAPS_ADVANCED_ROUTES } from "./api/gmaps/advanced/constants";
import { TWITTER_API_ROUTES } from "./api/twitter/constants";

export enum ENDPOINTS {
  HOME = "/",
  GMAPS = "/gmaps",
  INSTAGRAM = "/instagram",
  FACEBOOK = "/facebook",
  LINKEDIN = "/linkedin",
  YOUTUBE = "/youtube",
  TWITTER = "/twitter",
  GSEARCH = "/gsearch",
  GOOGLE_TRENDS = "/google-trends",
  MEDIA = "/media",
  SEGMENT = "/segment",
  CRAWL = "/crawl",
  CHATGPT = "/chatgpt",
  CLAUDE = "/claude",
  GEMINI = "/gemini",
  MCP = "/mcp",
  SAMPLE = "/sample",
}

/**
 * Vercel sets `VERCEL=1` automatically on every deployment. Used in
 * `server.ts` to skip `app.listen` (export the app instead). Product HTTP
 * mounts and MCP tools always register — this backend is intended to run
 * as a persistent process (VPS / local). Also gates every op that writes
 * to local disk expecting it to persist (media's local-path inputs, its cut
 * and condense output, youtube-download) — Vercel's filesystem
 * is per-invocation and ephemeral, so those ops are refused there even if
 * a storage-path env var happens to be set.
 */
export const IS_VERCEL_RUNTIME = !!process.env.VERCEL;

/**
 * Whether this host can drive a real headful browser (the chatgpt / gemini
 * modules' Chrome/CDP session). **Detected, not configured** — this replaces
 * the old hand-set `AIXEL_VPS=1` flag. A headful browser needs an X display to
 * render into; the VPS's `aixel-xvfb` unit provides one (default `:99`) whose
 * socket lives at `/tmp/.X11-unix/X<n>`. Vercel (ephemeral, no browser) and
 * any host without an X server simply have no such socket and refuse browser
 * ops on their own, so nothing needs to be set anywhere.
 *
 * Pass the display the caller will actually spawn Chrome on (each module has
 * its own DISPLAY default); omit to check `$DISPLAY`, falling back to `:99`.
 * Each module still runs its own binary/profile/login preflight on top of
 * this, so a present-but-unusable display degrades to a clear module error.
 *
 * The claude module is deliberately NOT gated by this: `claude -p` is a CLI,
 * not browser infrastructure, so it runs wherever it's installed and
 * authenticated, and fails with a plain error otherwise.
 */
export function isBrowserRuntime(display?: string): boolean {
  if (IS_VERCEL_RUNTIME) return false;
  const d = display || process.env.DISPLAY || ":99";
  const n = d.match(/:(\d+)/)?.[1];
  return !!n && existsSync(`/tmp/.X11-unix/X${n}`);
}

function withStatusCode(message: string, statusCode: number): Error {
  const err = new Error(message);
  (err as Error & { statusCode?: number }).statusCode = statusCode;
  return err;
}

/** Throws (501) unless {@link isBrowserRuntime} — i.e. no headful-browser X display on this host. */
export function assertBrowserRuntime(message: string, display?: string): void {
  if (!isBrowserRuntime(display)) throw withStatusCode(message, 501);
}

/** Throws (501) on Vercel only — see {@link IS_VERCEL_RUNTIME}. */
export function assertPersistentDisk(message: string): void {
  if (IS_VERCEL_RUNTIME) throw withStatusCode(message, 501);
}

/** Reads `err.statusCode` (set by {@link assertBrowserRuntime} / {@link assertPersistentDisk} / a busy-lock, etc.); falls back to 502. */
export function statusCodeFromError(err: unknown, fallback = 502): number {
  const code = (err as { statusCode?: number })?.statusCode;
  return typeof code === "number" ? code : fallback;
}

export const ALLOWED_ORIGINS_DEV_REGEX = [
  /^http:\/\/.*\.localhost:3003$/,
  /^https:\/\/.*\.aixellabs\.com$/,
  /^https:\/\/.*\.aixellabs\.in$/,
];

export const ALLOWED_ORIGINS_PROD_REGEX = [
  /^https:\/\/.*\.aixellabs\.com$/,
  /^https:\/\/.*\.aixellabs\.in$/,
];

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
    DOWNLOAD: {
      route: IG_DOWNLOAD_ROUTES.DOWNLOAD,
      full: `${ENDPOINTS.INSTAGRAM}${IG_DOWNLOAD_ROUTES.DOWNLOAD}`,
    },
    INTELLIGENCE: {
      ACCOUNT: {
        route: INSTAGRAM_INTELLIGENCE_ROUTES.ACCOUNT,
        full: `${ENDPOINTS.INSTAGRAM}${INSTAGRAM_INTELLIGENCE_ROUTES.ACCOUNT}`,
      },
    },
  },
  TWITTER: {
    SEARCH: {
      route: TWITTER_API_ROUTES.SEARCH,
      full: `${ENDPOINTS.TWITTER}${TWITTER_API_ROUTES.SEARCH}`,
    },
    USER: {
      route: TWITTER_API_ROUTES.USER,
      full: `${ENDPOINTS.TWITTER}${TWITTER_API_ROUTES.USER}`,
    },
    TWEET: {
      route: TWITTER_API_ROUTES.TWEET,
      full: `${ENDPOINTS.TWITTER}${TWITTER_API_ROUTES.TWEET}`,
    },
    TWEETS: {
      route: TWITTER_API_ROUTES.TWEETS,
      full: `${ENDPOINTS.TWITTER}${TWITTER_API_ROUTES.TWEETS}`,
    },
    TRENDING: {
      route: TWITTER_API_ROUTES.TRENDING,
      full: `${ENDPOINTS.TWITTER}${TWITTER_API_ROUTES.TRENDING}`,
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
    VIDEO_COMMENTS: {
      route: YOUTUBE_API_ROUTES.VIDEO_COMMENTS,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.VIDEO_COMMENTS}`,
    },
    VIDEO_CHAPTERS: {
      route: YOUTUBE_API_ROUTES.VIDEO_CHAPTERS,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.VIDEO_CHAPTERS}`,
    },
    VIDEO_DOWNLOAD: {
      route: YOUTUBE_API_ROUTES.VIDEO_DOWNLOAD,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.VIDEO_DOWNLOAD}`,
    },
    DIARIZE: {
      route: YOUTUBE_API_ROUTES.DIARIZE,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.DIARIZE}`,
    },
    CHANNEL: {
      route: YOUTUBE_API_ROUTES.CHANNEL,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.CHANNEL}`,
    },
    HANDLE: {
      route: YOUTUBE_API_ROUTES.HANDLE,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.HANDLE}`,
    },
    HANDLE_CHECK: {
      route: YOUTUBE_API_ROUTES.HANDLE_CHECK,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.HANDLE_CHECK}`,
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
      VIDEO_COMMENTS: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.VIDEO_COMMENTS,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.VIDEO_COMMENTS}`,
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
  MEDIA: {
    FETCH: { route: "/fetch", full: `${ENDPOINTS.MEDIA}/fetch` },
    TRANSCRIBE: { route: "/transcribe", full: `${ENDPOINTS.MEDIA}/transcribe` },
    DIARIZE: { route: "/diarize", full: `${ENDPOINTS.MEDIA}/diarize` },
    CUT: { route: "/cut", full: `${ENDPOINTS.MEDIA}/cut` },
    CONDENSE: { route: "/condense", full: `${ENDPOINTS.MEDIA}/condense` },
    CAPTION: { route: "/caption", full: `${ENDPOINTS.MEDIA}/caption` },
    SHARE: { route: "/share", full: `${ENDPOINTS.MEDIA}/share` },
    UPLOAD: {
      /** `:uploadId` is a literal Express param placeholder — substitute the real id when calling. */
      INIT: { route: "/upload/init", full: `${ENDPOINTS.MEDIA}/upload/init` },
      CHUNK: {
        route: "/upload/:uploadId/chunk",
        full: `${ENDPOINTS.MEDIA}/upload/:uploadId/chunk`,
      },
      STATUS: {
        route: "/upload/:uploadId/status",
        full: `${ENDPOINTS.MEDIA}/upload/:uploadId/status`,
      },
      COMPLETE: {
        route: "/upload/:uploadId/complete",
        full: `${ENDPOINTS.MEDIA}/upload/:uploadId/complete`,
      },
    },
  },
  SEGMENT: {
    BY_SPEECH: { route: "/by_speech", full: `${ENDPOINTS.SEGMENT}/by_speech` },
  },
  CRAWL: {
    API: { route: "/", full: `${ENDPOINTS.CRAWL}` },
  },
  CHATGPT: {
    GENERATE: {
      route: "/",
      full: `${ENDPOINTS.CHATGPT}`,
    },
    HEALTH: {
      route: "/health",
      full: `${ENDPOINTS.CHATGPT}/health`,
    },
  },
  CLAUDE: {
    ASK: {
      route: "/",
      full: `${ENDPOINTS.CLAUDE}`,
    },
    BUDGET: {
      route: "/budget",
      full: `${ENDPOINTS.CLAUDE}/budget`,
    },
  },
  GEMINI: {
    GENERATE: {
      route: "/",
      full: `${ENDPOINTS.GEMINI}`,
    },
    HEALTH: {
      route: "/health",
      full: `${ENDPOINTS.GEMINI}/health`,
    },
  },
} as const;
