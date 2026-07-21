import { z } from "zod";
import type { YT_SEARCH_FILTER } from "../constants";
import type {
  YT_BROWSE_ENDPOINT,
  YT_METADATA_BADGE,
  YT_SIMPLE_TEXT,
  YT_TEXT_RUNS,
  YT_THUMBNAIL,
  YT_THUMBNAIL_LIST,
} from "../types";
import { YOUTUBE_SEARCH_REQUEST_SCHEMA } from "./schemas";

export type YOUTUBE_SEARCH_REQUEST = z.infer<
  typeof YOUTUBE_SEARCH_REQUEST_SCHEMA
>;

export type YOUTUBE_SEARCH_RAW_VIDEO_ITEM = {
  videoId: string;
  viewCountText?: YT_SIMPLE_TEXT;
  thumbnail: YT_THUMBNAIL_LIST;
  channelThumbnailSupportedRenderers?: {
    channelThumbnailWithLinkRenderer: {
      thumbnail: YT_THUMBNAIL_LIST;
      navigationEndpoint?: { browseEndpoint?: YT_BROWSE_ENDPOINT };
    };
  };
  detailedMetadataSnippets: Array<{ snippetText: YT_TEXT_RUNS }>;
  ownerText?: {
    runs: Array<{
      text: string;
      navigationEndpoint: { browseEndpoint: YT_BROWSE_ENDPOINT };
    }>;
  };
  longBylineText?: {
    runs: Array<{
      text: string;
      navigationEndpoint: { browseEndpoint: YT_BROWSE_ENDPOINT };
    }>;
  };
  shortBylineText?: {
    runs: Array<{
      text: string;
      navigationEndpoint: { browseEndpoint: YT_BROWSE_ENDPOINT };
    }>;
  };
  avatar?: {
    decoratedAvatarViewModel?: {
      rendererContext?: {
        commandContext?: {
          onTap?: {
            innertubeCommand?: { browseEndpoint?: YT_BROWSE_ENDPOINT };
          };
        };
      };
    };
  };
  title: YT_TEXT_RUNS;
  publishedTimeText: YT_SIMPLE_TEXT;
  lengthText: YT_SIMPLE_TEXT;
};

export type YOUTUBE_SEARCH_RAW_CHANNEL_ITEM = {
  channelId: string;
  title?: YT_SIMPLE_TEXT;
  navigationEndpoint?: {
    browseEndpoint?: YT_BROWSE_ENDPOINT;
  };
  thumbnail?: YT_THUMBNAIL_LIST;
  descriptionSnippet?: YT_TEXT_RUNS;
  shortBylineText?: YT_TEXT_RUNS;
  videoCountText?: YT_SIMPLE_TEXT;
  ownerBadges?: YT_METADATA_BADGE[];
  subscriberCountText?: YT_SIMPLE_TEXT;
};

export type YOUTUBE_SEARCH_SECTION_ITEM =
  | { videoRenderer: YOUTUBE_SEARCH_RAW_VIDEO_ITEM }
  | { channelRenderer: YOUTUBE_SEARCH_RAW_CHANNEL_ITEM }
  | { itemSectionRenderer: { contents: YOUTUBE_SEARCH_SECTION_ITEM[] } }
  | {
      continuationItemRenderer: {
        continuationEndpoint: { continuationCommand: { token: string } };
      };
    };

export type YOUTUBE_SEARCH_CONTINUATION_RESPONSE = {
  onResponseReceivedCommands?: Array<{
    appendContinuationItemsAction?: {
      continuationItems?: YOUTUBE_SEARCH_SECTION_ITEM[];
    };
  }>;
};

export type YOUTUBE_SEARCH_RAW_RESPONSE = {
  estimatedResults: string;
  contents: {
    twoColumnSearchResultsRenderer: {
      primaryContents: {
        sectionListRenderer: {
          contents: YOUTUBE_SEARCH_SECTION_ITEM[];
        };
      };
    };
  };
};

export type YOUTUBE_SEARCH_RESPONSE_ITEM =
  | YOUTUBE_SEARCH_VIDEO_ITEM
  | YOUTUBE_SEARCH_CHANNEL_ITEM;

export type YOUTUBE_SEARCH_VIDEO_ITEM = {
  id: string | null;
  videoId: string | null;
  videoUrl: string | null;
  title: string | null;
  channelId: string | null;
  channelUrl: string | null;
  lengthText: string | null;
  publishedTimeText: string | null;
  channelLogoUrl: string | null;
  description: string | null;
  duration: number | null;
  viewCountText: string | null;
  viewCount: number | null;
  thumbnails: YT_THUMBNAIL[] | null;
};

export type YOUTUBE_SEARCH_CHANNEL_ITEM = {
  channelId: string;
  title: string | null;
  handle: string | null;
  channelUrl: string | null;
  description: string | null;
  thumbnails: YT_THUMBNAIL[] | null;
  subscriberCountText: string | null;
  subscribers: number | null;
  isVerified: boolean;
};

export type YOUTUBE_SEARCH_RESPONSE = {
  resultType: YT_SEARCH_FILTER;
  items: YOUTUBE_SEARCH_RESPONSE_ITEM[];
  searchQuery: string;
  estimatedResults: number | null;
  totalResults: number | null;
};
