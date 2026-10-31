import type { z } from "zod";

import type { CaptionLine } from "./compute/captions";
import type {
  LINE_FINDER_CAPTIONS_OUTCOME,
  LINE_FINDER_MATCH_KIND,
  LINE_FINDER_PERSON_STATUS,
  LINE_FINDER_SEARCH_STATE,
  LINE_FINDER_SPEAKER,
  LINE_FINDER_VIDEO_STATUS,
} from "./constants";
import type {
  LINE_FINDER_ADD_PERSON_REQUEST_SCHEMA,
  LINE_FINDER_CAPTIONS_REQUEST_SCHEMA,
  LINE_FINDER_CHECK_SPEAKER_REQUEST_SCHEMA,
  LINE_FINDER_DISCOVER_REQUEST_SCHEMA,
  LINE_FINDER_MARK_REQUEST_SCHEMA,
  LINE_FINDER_SEARCH_REQUEST_SCHEMA,
} from "./schemas";

export type LINE_FINDER_DISCOVER_REQUEST = z.output<typeof LINE_FINDER_DISCOVER_REQUEST_SCHEMA>;
export type LINE_FINDER_CAPTIONS_REQUEST = z.output<typeof LINE_FINDER_CAPTIONS_REQUEST_SCHEMA>;
export type LINE_FINDER_CHECK_SPEAKER_REQUEST = z.output<typeof LINE_FINDER_CHECK_SPEAKER_REQUEST_SCHEMA>;
export type LINE_FINDER_SEARCH_REQUEST = z.output<typeof LINE_FINDER_SEARCH_REQUEST_SCHEMA>;
export type LINE_FINDER_ADD_PERSON_REQUEST = z.input<typeof LINE_FINDER_ADD_PERSON_REQUEST_SCHEMA>;
export type LINE_FINDER_MARK_REQUEST = z.output<typeof LINE_FINDER_MARK_REQUEST_SCHEMA>;

export type LINE_FINDER_MATCH_KIND_VALUE = (typeof LINE_FINDER_MATCH_KIND)[keyof typeof LINE_FINDER_MATCH_KIND];
export type LINE_FINDER_SPEAKER_VALUE = (typeof LINE_FINDER_SPEAKER)[keyof typeof LINE_FINDER_SPEAKER];
export type LINE_FINDER_SEARCH_STATE_VALUE = (typeof LINE_FINDER_SEARCH_STATE)[keyof typeof LINE_FINDER_SEARCH_STATE];
export type LINE_FINDER_PERSON_STATUS_VALUE = (typeof LINE_FINDER_PERSON_STATUS)[keyof typeof LINE_FINDER_PERSON_STATUS];
export type LINE_FINDER_VIDEO_STATUS_VALUE = (typeof LINE_FINDER_VIDEO_STATUS)[keyof typeof LINE_FINDER_VIDEO_STATUS];

export type LINE_FINDER_DISCOVERED_VIDEO = {
  videoId: string;
  title: string | null;
  channelId: string | null;
  channelName: string | null;
  channelUrl: string | null;
  durationSeconds: number | null;
  views: number | null;
};

export type LINE_FINDER_DISCOVER_RESPONSE = { videos: LINE_FINDER_DISCOVERED_VIDEO[] };

export type LINE_FINDER_CAPTIONS_RESPONSE =
  | { outcome: typeof LINE_FINDER_CAPTIONS_OUTCOME.OK; language: string; isAuto: boolean; lines: CaptionLine[] }
  | { outcome: typeof LINE_FINDER_CAPTIONS_OUTCOME.NO_CAPTIONS }
  | { outcome: typeof LINE_FINDER_CAPTIONS_OUTCOME.BUDGET }
  | { outcome: typeof LINE_FINDER_CAPTIONS_OUTCOME.FAILED; error: string };

export type LINE_FINDER_CHECK_SPEAKER_RESPONSE = { speaker: "likely" | "someone_else" | "unsure" };

// ─── What the pages draw ─────────────────────────────────────────────────────

export type LINE_FINDER_PERSON = {
  id: string;
  name: string;
  spellings: string[];
  handle: string | null;
  status: LINE_FINDER_PERSON_STATUS_VALUE;
  stopReason: string | null;
  videos: {
    /** Every video collected for this person, whatever became of it. */
    total: number;
    searched: number;
    noCaptions: number;
    failed: number;
    pending: number;
  };
};

export type LINE_FINDER_RESULT = {
  videoId: string;
  title: string | null;
  channelName: string | null;
  channelUrl: string | null;
  views: number | null;
  /** The moment to play. `endSeconds` counts from the start of the video. */
  startSeconds: number;
  endSeconds: number;
  /** Where in the video the matched line starts; identifies this moment when marking it. */
  startMs: number;
  matchKind: LINE_FINDER_MATCH_KIND_VALUE;
  score: number;
  saysNo: boolean;
  speaker: LINE_FINDER_SPEAKER_VALUE;
  before: string | null;
  text: string;
  after: string | null;
};

export type LINE_FINDER_SEARCH_RESPONSE = {
  state: LINE_FINDER_SEARCH_STATE_VALUE;
  person: Pick<LINE_FINDER_PERSON, "id" | "name" | "status" | "videos">;
  results: LINE_FINDER_RESULT[];
};
