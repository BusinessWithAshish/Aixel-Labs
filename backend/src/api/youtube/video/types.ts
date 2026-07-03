import type {
  YT_LOCKUP_METADATA_VIEW_MODEL,
  YT_LOCKUP_THUMBNAIL_IMAGE,
  YT_THUMBNAIL,
} from "../types";

export type YOUTUBE_VIDEO_LOCKUP = {
  contentId?: string;
  contentType?: string;
  contentImage?: YT_LOCKUP_THUMBNAIL_IMAGE;
  metadata?: {
    lockupMetadataViewModel?: YT_LOCKUP_METADATA_VIEW_MODEL;
  };
};

export type YOUTUBE_VIDEO_WATCH_NEXT_ITEM =
  | { lockupViewModel: YOUTUBE_VIDEO_LOCKUP }
  | {
      continuationItemRenderer: {
        continuationEndpoint: {
          continuationCommand: { token: string };
        };
      };
    };

export type YOUTUBE_VIDEO_DETAILS = {
  videoId?: string;
  title?: string;
  lengthSeconds?: string;
  channelId?: string;
  shortDescription?: string;
  isLiveContent?: boolean;
  thumbnail?: { thumbnails?: YT_THUMBNAIL[] };
  viewCount?: string;
  author?: string;
  keywords?: string[];
};

export type YOUTUBE_VIDEO_WATCH_NEXT_RESULTS = {
  twoColumnWatchNextResults?: {
    secondaryResults?: {
      secondaryResults?: {
        results?: Array<
          | YOUTUBE_VIDEO_WATCH_NEXT_ITEM
          | {
              itemSectionRenderer?: {
                contents?: YOUTUBE_VIDEO_WATCH_NEXT_ITEM[];
                sectionIdentifier?: string;
                targetId?: string;
              };
            }
        >;
      };
    };
  };
};

export type YOUTUBE_VIDEO_GET_WATCH_RESPONSE = [
  {
    playerResponse?: {
      videoDetails?: YOUTUBE_VIDEO_DETAILS;
      playabilityStatus?: {
        status?: string;
        reason?: string;
      };
    };
  },
  {
    watchNextResponse?: {
      contents?: YOUTUBE_VIDEO_WATCH_NEXT_RESULTS;
    };
  },
];

export type YOUTUBE_VIDEO_NEXT_CONTINUATION_RESPONSE = {
  onResponseReceivedEndpoints?: Array<{
    appendContinuationItemsAction?: {
      continuationItems?: YOUTUBE_VIDEO_WATCH_NEXT_ITEM[];
    };
  }>;
  onResponseReceivedCommands?: Array<{
    appendContinuationItemsAction?: {
      continuationItems?: YOUTUBE_VIDEO_WATCH_NEXT_ITEM[];
    };
  }>;
};

export type YOUTUBE_VIDEO_SUGGESTION_ITEM = {
  videoId: string;
  title: string | null;
  thumbnail: YT_THUMBNAIL[] | null;
  channelTitle: string | null;
  channelId: string | null;
  viewsText: string | null;
  views: number | null;
  publishedText: string | null;
  durationText: string | null;
  duration: number | null;
};

export type YOUTUBE_VIDEO_DETAILS_RESPONSE = {
  id: string;
  title: string | null;
  thumbnail: YT_THUMBNAIL[] | null;
  isLive: boolean;
  channel: string | null;
  channelId: string | null;
  description: string | null;
  viewCount: number | null;
  viewCountText: string | null;
  lengthSeconds: number | null;
  keywords: string[];
};

export type YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE = {
  videoId: string;
  items: YOUTUBE_VIDEO_SUGGESTION_ITEM[];
  totalResults: number;
};
