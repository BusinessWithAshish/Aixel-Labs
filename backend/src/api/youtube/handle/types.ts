import { z } from "zod";
import { YOUTUBE_HANDLE_REQUEST_SCHEMA } from "./schemas";

export type YOUTUBE_HANDLE_REQUEST = z.infer<
  typeof YOUTUBE_HANDLE_REQUEST_SCHEMA
>;

type YTHandlePageMetadata = {
  channelMetadataRenderer?: {
    externalId?: string;
  };
};

export type YOUTUBE_HANDLE_PAGE_INIT_DATA = {
  metadata?: YTHandlePageMetadata;
  header?: {
    c4TabbedHeaderRenderer?: { channelId?: string };
    pageHeaderRenderer?: {
      content?: {
        pageHeaderViewModel?: {
          metadata?: {
            contentMetadataViewModel?: {
              metadataRows?: Array<{
                metadataParts?: Array<{
                  text?: { commandRuns?: Array<{ onTap?: unknown }> };
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
    };
  };
};

export type YOUTUBE_HANDLE_RESPONSE = {
  handle: string;
  channelId: string;
};
