import { z } from "zod";
import { YOUTUBE_HANDLE_REQUEST_SCHEMA } from "./schemas";

export type YOUTUBE_HANDLE_REQUEST = z.infer<
  typeof YOUTUBE_HANDLE_REQUEST_SCHEMA
>;

type YTHandlePageMetadata = {
  channelMetadataRenderer?: {
    externalId?: string;
    title?: string;
  };
};

export type YOUTUBE_HANDLE_PAGE_INIT_DATA = {
  metadata?: YTHandlePageMetadata;
  header?: {
    c4TabbedHeaderRenderer?: {
      channelId?: string;
      title?: string;
      subscriberCountText?: { simpleText?: string };
    };
    pageHeaderRenderer?: {
      pageTitle?: string;
      content?: {
        pageHeaderViewModel?: {
          title?: {
            dynamicTextViewModel?: { text?: { content?: string } };
          };
          metadata?: {
            contentMetadataViewModel?: {
              metadataRows?: Array<{
                metadataParts?: Array<{
                  text?: {
                    content?: string;
                    commandRuns?: Array<{ onTap?: unknown }>;
                  };
                }>;
              }>;
            };
          };
        };
      };
    };
  };
  microformat?: {
    microformatDataRenderer?: {
      urlCanonical?: string;
      title?: string;
    };
  };
};

export type YOUTUBE_HANDLE_RESPONSE = {
  handle: string;
  channelId: string;
  title: string | null;
  subscribers: number | null;
};
