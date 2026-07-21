import {
  YOUTUBE_BASE_URL,
  YOUTUBE_INNERTUBE_API_KEY,
  YOUTUBE_INNERTUBE_IOS_CLIENT,
  YOUTUBE_INNERTUBE_PLAYER_URL,
  YOUTUBE_VIDEO_URL,
} from "../constants";
import type { UrlFetchSession } from "../../../utils/node-tls-client-session-handler";
import {
  YOUTUBE_PLAYER_PLAYABILITY_OK_STATUSES,
  YOUTUBE_TIMEDTEXT_FORMAT,
  YOUTUBE_TRANSCRIPT_DEFAULT_HL,
} from "./constants";
import {
  parseJson3Events,
  stripFmtParam,
} from "./compute";
import type {
  INNERTUBE_CAPTION_TRACK,
  INNERTUBE_PLAYER_RESPONSE,
  JSON3_RESPONSE,
  YOUTUBE_TRANSCRIPT_LINE,
} from "./types";

/** Builds the InnerTube `/player` URL with the public API key. */
function playerUrl(): string {
  return `${YOUTUBE_INNERTUBE_PLAYER_URL}?key=${YOUTUBE_INNERTUBE_API_KEY}&prettyPrint=false`;
}

/** iOS client headers for InnerTube + timedtext requests. */
function iosRequestHeaders(
  videoId?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": YOUTUBE_INNERTUBE_IOS_CLIENT.userAgent,
  };
  if (videoId) {
    headers.Referer = YOUTUBE_VIDEO_URL(videoId);
    headers.Origin = YOUTUBE_BASE_URL;
  }
  return headers;
}

/** POSTs `/youtubei/v1/player` with the iOS client and returns caption tracks. */
export async function fetchPlayerCaptionTracks(
  session: UrlFetchSession,
  videoId: string,
  gl: string,
): Promise<INNERTUBE_CAPTION_TRACK[]> {
  const body = {
    context: {
      client: {
        ...YOUTUBE_INNERTUBE_IOS_CLIENT,
        hl: YOUTUBE_TRANSCRIPT_DEFAULT_HL,
        gl,
      },
    },
    videoId,
  };

  const response = await session.post(playerUrl(), {
    headers: {
      "Content-Type": "application/json",
      ...iosRequestHeaders(),
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `InnerTube /player failed (${response.status}): ${text.slice(0, 500)}`,
    );
  }

  let parsed: INNERTUBE_PLAYER_RESPONSE;
  try {
    parsed = JSON.parse(text) as INNERTUBE_PLAYER_RESPONSE;
  } catch {
    throw new Error("InnerTube /player returned non-JSON response");
  }

  const status = parsed.playabilityStatus?.status;
  if (
    status &&
    !YOUTUBE_PLAYER_PLAYABILITY_OK_STATUSES.includes(
      status as (typeof YOUTUBE_PLAYER_PLAYABILITY_OK_STATUSES)[number],
    )
  ) {
    const reason = parsed.playabilityStatus?.reason ?? status;
    throw new Error(`Video not playable (${status}): ${reason}`);
  }

  const tracks =
    parsed.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks?.length) {
    throw new Error("No caption tracks available for this video");
  }

  return tracks;
}

/** GETs `baseUrl + &fmt=json3` and parses the timedtext JSON3 payload. */
export async function fetchTimedTextJson3(
  session: UrlFetchSession,
  track: INNERTUBE_CAPTION_TRACK,
  videoId: string,
): Promise<YOUTUBE_TRANSCRIPT_LINE[]> {
  const transcriptUrl = `${stripFmtParam(track.baseUrl)}&fmt=${YOUTUBE_TIMEDTEXT_FORMAT}`;

  const response = await session.get(transcriptUrl, {
    headers: iosRequestHeaders(videoId),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `timedtext fetch failed (${response.status}): ${text.slice(0, 500)}`,
    );
  }

  if (!text.trim()) {
    throw new Error("timedtext returned empty body");
  }

  let parsed: JSON3_RESPONSE;
  try {
    parsed = JSON.parse(text) as JSON3_RESPONSE;
  } catch {
    throw new Error("timedtext returned non-JSON response");
  }

  return parseJson3Events(parsed);
}
