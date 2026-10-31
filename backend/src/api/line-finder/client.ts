import { z } from "zod";

import { EvomiBudgetExceededError } from "../../utils/evomi-budget";
import { closeUrlFetchSession, type UrlFetchSession } from "../../utils/node-tls-client-session-handler";
import { MEDIA_GROQ_TEXT_MODEL } from "../media/constants";
import { generateJsonWithGroq } from "../media/groq-chat";
import { YT_CHANNEL_CONTENT_TYPE } from "../youtube/channel/constants";
import { fetchYoutubeChannel } from "../youtube/channel/helpers";
import type { YOUTUBE_CHANNEL_VIDEO_ITEM } from "../youtube/channel/types";
import { YT_SEARCH_FILTER } from "../youtube/constants";
import { resolveYoutubeHandleToChannelId } from "../youtube/handle/helpers";
import { createYoutubeFetchSession, withDirectFirst } from "../youtube/helpers";
import { fetchYoutubeSearch } from "../youtube/search/helpers";
import { pickTrack } from "../youtube/transcript/compute";
import { YOUTUBE_TRANSCRIPT_TRACK_KIND } from "../youtube/transcript/constants";
import { fetchPlayerCaptionTracks, fetchTimedTextJson3Raw } from "../youtube/transcript/fetch";
import type { INNERTUBE_CAPTION_TRACK } from "../youtube/transcript/types";
import { parseCaptionLines } from "./compute/captions";
import { namesPerson } from "./compute/relevance";
import {
  LINE_FINDER_CAPTION_LANGUAGES,
  LINE_FINDER_CAPTIONS_OUTCOME,
  LINE_FINDER_COUNTRY,
  LINE_FINDER_DISCOVERY_SUFFIXES,
  LINE_FINDER_LIMITS,
} from "./constants";
import type {
  LINE_FINDER_CAPTIONS_REQUEST,
  LINE_FINDER_CAPTIONS_RESPONSE,
  LINE_FINDER_CHECK_SPEAKER_REQUEST,
  LINE_FINDER_CHECK_SPEAKER_RESPONSE,
  LINE_FINDER_DISCOVERED_VIDEO,
  LINE_FINDER_DISCOVER_REQUEST,
  LINE_FINDER_DISCOVER_RESPONSE,
} from "./types";

/** `fetchPlayerCaptionTracks` reports a video with no captions as this error, not an empty list. */
const NO_CAPTIONS_ERROR = "No caption tracks available";

function handleFromChannelUrl(url: string | null): string | null {
  return url?.match(/@[^/?]+/)?.[0] ?? null;
}

/** Searches YouTube for the person, keeping only videos that name them (spec §2). */
async function discoverFromSearch(spellings: string[]): Promise<LINE_FINDER_DISCOVERED_VIDEO[]> {
  const found = new Map<string, LINE_FINDER_DISCOVERED_VIDEO>();

  for (const spelling of spellings) {
    for (const suffix of LINE_FINDER_DISCOVERY_SUFFIXES) {
      const response = await fetchYoutubeSearch({
        query: `${spelling} ${suffix}`.trim(),
        filter: YT_SEARCH_FILTER.VIDEO,
        limit: LINE_FINDER_LIMITS.DISCOVERY_RESULTS_PER_QUERY,
        country: LINE_FINDER_COUNTRY,
      });
      for (const item of response.items) {
        if (!("videoId" in item) || !item.videoId || found.has(item.videoId)) continue;
        if (!namesPerson(`${item.title ?? ""} ${item.description ?? ""}`, spellings)) continue;
        found.set(item.videoId, {
          videoId: item.videoId,
          title: item.title,
          channelId: item.channelId,
          channelName: handleFromChannelUrl(item.channelUrl),
          channelUrl: item.channelUrl,
          durationSeconds: item.duration,
          views: item.viewCount,
        });
      }
    }
  }

  return [...found.values()];
}

/** The person's own channel: everything on it counts, named or not. */
async function discoverFromOwnChannel(handle: string, name: string): Promise<LINE_FINDER_DISCOVERED_VIDEO[]> {
  const channelId = await resolveYoutubeHandleToChannelId(handle, { country: LINE_FINDER_COUNTRY });
  const channel = await fetchYoutubeChannel({
    channelId,
    contentType: YT_CHANNEL_CONTENT_TYPE.VIDEOS,
    limit: LINE_FINDER_LIMITS.VIDEOS_PER_PERSON,
    country: LINE_FINDER_COUNTRY,
  });
  return (channel.items as YOUTUBE_CHANNEL_VIDEO_ITEM[]).map((item) => ({
    videoId: item.videoId,
    title: item.title,
    channelId,
    channelName: channel.channelInfo?.title ?? name,
    channelUrl: channel.channelInfo?.channelUrl ?? null,
    durationSeconds: null,
    views: item.views,
  }));
}

export async function lineFinderDiscoverService(
  request: LINE_FINDER_DISCOVER_REQUEST,
): Promise<LINE_FINDER_DISCOVER_RESPONSE> {
  const [fromChannel, fromSearch] = await Promise.all([
    request.handle ? discoverFromOwnChannel(request.handle, request.name) : [],
    discoverFromSearch([request.name, ...request.spellings]),
  ]);
  const byId = new Map([...fromSearch, ...fromChannel].map((video) => [video.videoId, video]));
  return { videos: [...byId.values()] };
}

/**
 * The caption file is most of a video's bytes, and its link isn't tied to the IP that asked for it (`ip=0.0.0.0`,
 * checked 2026-10-31), so it comes from this host's own IP. The proxy is only used if that's refused.
 */
async function fetchCaptionFile(proxied: UrlFetchSession, track: INNERTUBE_CAPTION_TRACK, videoId: string) {
  return withDirectFirst("line-finder-captions", async (direct) => {
    if (!direct) return fetchTimedTextJson3Raw(proxied, track, videoId);
    const session = await createYoutubeFetchSession({ country: LINE_FINDER_COUNTRY }, { direct: true });
    try {
      return await fetchTimedTextJson3Raw(session, track, videoId);
    } finally {
      await closeUrlFetchSession(session);
    }
  });
}

/** One video's captions. Outcomes aren't errors: most videos without captions are just that. */
export async function lineFinderCaptionsService({
  videoId,
}: LINE_FINDER_CAPTIONS_REQUEST): Promise<LINE_FINDER_CAPTIONS_RESPONSE> {
  let session: UrlFetchSession | null = null;
  try {
    session = await createYoutubeFetchSession({ country: LINE_FINDER_COUNTRY });
    const tracks = await fetchPlayerCaptionTracks(session, videoId, LINE_FINDER_COUNTRY);
    const language = LINE_FINDER_CAPTION_LANGUAGES.find((code) => tracks.some((t) => t.languageCode?.startsWith(code)));
    const track = pickTrack(tracks, language ?? LINE_FINDER_CAPTION_LANGUAGES[0]);
    if (!track) return { outcome: LINE_FINDER_CAPTIONS_OUTCOME.NO_CAPTIONS };

    const lines = parseCaptionLines(await fetchCaptionFile(session, track, videoId));
    if (lines.length === 0) return { outcome: LINE_FINDER_CAPTIONS_OUTCOME.NO_CAPTIONS };
    return {
      outcome: LINE_FINDER_CAPTIONS_OUTCOME.OK,
      language: track.languageCode ?? "",
      isAuto: track.kind === YOUTUBE_TRANSCRIPT_TRACK_KIND.ASR,
      lines,
    };
  } catch (err) {
    if (err instanceof EvomiBudgetExceededError) return { outcome: LINE_FINDER_CAPTIONS_OUTCOME.BUDGET };
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes(NO_CAPTIONS_ERROR)) return { outcome: LINE_FINDER_CAPTIONS_OUTCOME.NO_CAPTIONS };
    return { outcome: LINE_FINDER_CAPTIONS_OUTCOME.FAILED, error: message.slice(0, 300) };
  } finally {
    if (session) await closeUrlFetchSession(session);
  }
}

const SPEAKER_CHECK_VALIDATOR = z.object({
  speaker: z.enum(["likely", "someone_else", "unsure"]),
});

export async function lineFinderCheckSpeakerService(
  request: LINE_FINDER_CHECK_SPEAKER_REQUEST,
): Promise<LINE_FINDER_CHECK_SPEAKER_RESPONSE> {
  const prompt = `Machine-made captions from a YouTube video. They don't say who is speaking, and they may have mistakes.

Video title: ${request.title ?? "unknown"}
Channel: ${request.channelName ?? "unknown"}

Captions around the line, in order. The line is marked >>>:
${request.context}

Is ${request.person} the one saying the marked line, as themself?
- "likely": it reads as ${request.person} speaking in the first person, for example answering a question in an interview about their own life or work.
- "someone_else": it reads as a host, narrator or other person, including someone asking ${request.person} a question or talking about them.
- "unsure": the captions don't settle it. A title that names ${request.person} isn't enough on its own.

Reply as JSON only: {"speaker": "likely" | "someone_else" | "unsure"}`;

  const { data } = await generateJsonWithGroq({
    model: MEDIA_GROQ_TEXT_MODEL.DEFAULT,
    prompt,
    zodValidator: SPEAKER_CHECK_VALIDATOR,
  });
  return data;
}
