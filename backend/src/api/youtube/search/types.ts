import { z } from "zod";
import { YOUTUBE_SEARCH_REQUEST_SCHEMA } from "./schemas";

export type YOUTUBE_SEARCH_REQUEST = z.infer<
  typeof YOUTUBE_SEARCH_REQUEST_SCHEMA
>;

type YTThumbnail = { url: string; width: number; height: number };
type YTThumbnailList = { thumbnails: YTThumbnail[] };
type YTSimpleText = { simpleText: string };
type YTTextRuns = { runs: { text: string }[] };
type YTBrowseEndpoint = { browseId: string; canonicalBaseUrl: string };

export type YOUTUBE_SEARCH_RAW_RESPONSE_ITEM = {
  videoId: string;
  videoCountText: YTSimpleText;
  thumbnail: YTThumbnailList;
  channelThumbnailSupportedRenderers: {
    channelThumbnailWithLinkRenderer: { thumbnail: YTThumbnailList };
  };
  detailedMetadataSnippets: Array<{ snippetText: YTTextRuns }>;
  ownerText: {
    runs: Array<{
      text: string;
      navigationEndpoint: { browseEndpoint: YTBrowseEndpoint };
    }>;
  };
  title: YTTextRuns;
  publishedTimeText: YTSimpleText;
  lengthText: YTSimpleText;
};

export type YOUTUBE_SEARCH_SECTION_ITEM =
  | { videoRenderer: YOUTUBE_SEARCH_RAW_RESPONSE_ITEM }
  | { itemSectionRenderer: { contents: YOUTUBE_SEARCH_SECTION_ITEM[] } }
  | {
      continuationItemRenderer: {
        continuationEndpoint: { continuationCommand: { token: string } };
      };
    };

type YOUTUBE_SEARCH_PAGE_CONTENTS = [
  { itemSectionRenderer: { contents: YOUTUBE_SEARCH_SECTION_ITEM[] } },
  {
    continuationItemRenderer: {
      continuationEndpoint: { continuationCommand: { token: string } };
    };
  },
];

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
        sectionListRenderer: { contents: YOUTUBE_SEARCH_PAGE_CONTENTS };
      };
    };
  };
};

export type YOUTUBE_SEARCH_RESPONSE_ITEM = {
  id: string | null;
  videoId: string | null;
  title: string | null;
  channelId: string | null;
  channelUrl: string | null;
  lengthText: string | null;
  publishedTimeText: string | null;
  channelLogoUrl: string | null;
  description: string | null;
  duration: number | null;
  thumbnails: YTThumbnail[] | null;
};

export type YOUTUBE_SEARCH_RESPONSE = {
  items: YOUTUBE_SEARCH_RESPONSE_ITEM[];
  searchQuery: string;
  estimatedResults: number | null;
  totalResults: number | null;
};
