import type { YOUTUBE_GEO_REQUEST_SCHEMA } from "./schemas";
import type { z } from "zod";

export type YOUTUBE_GEO_REQUEST = z.infer<typeof YOUTUBE_GEO_REQUEST_SCHEMA>;

export type YT_THUMBNAIL = {
  url: string;
  width?: number;
  height?: number;
};

export type YT_SIMPLE_TEXT = { simpleText?: string };
export type YT_TEXT_RUNS = { runs?: Array<{ text: string }> };
export type YT_THUMBNAIL_LIST = { thumbnails: YT_THUMBNAIL[] };

export type YT_BROWSE_ENDPOINT = {
  browseId?: string;
  canonicalBaseUrl?: string;
};

export type YT_METADATA_BADGE = {
  metadataBadgeRenderer?: { style?: string };
};

export type YT_METADATA_PART = { text?: { content?: string } };
export type YT_CONTENT_METADATA_ROW = { metadataParts?: YT_METADATA_PART[] };

export type YT_LOCKUP_METADATA_VIEW_MODEL = {
  title?: { content?: string };
  image?: {
    decoratedAvatarViewModel?: {
      rendererContext?: {
        commandContext?: {
          onTap?: {
            innertubeCommand?: {
              browseEndpoint?: { browseId?: string };
            };
          };
        };
      };
    };
  };
  metadata?: {
    contentMetadataViewModel?: {
      metadataRows?: YT_CONTENT_METADATA_ROW[];
    };
  };
};

export type YT_LOCKUP_THUMBNAIL_IMAGE = {
  thumbnailViewModel?: {
    image?: { sources?: YT_THUMBNAIL[] };
    overlays?: Array<{
      thumbnailBottomOverlayViewModel?: {
        badges?: Array<{
          thumbnailBadgeViewModel?: { text?: string };
        }>;
      };
    }>;
  };
};

export type YOUTUBE_VIDEO_WATCH_META = {
  publishedAt: string | null;
  lengthSeconds: number | null;
  channelSubscribers: number | null;
  likeCount: number | null;
  commentCount: number | null;
  description: string | null;
};
