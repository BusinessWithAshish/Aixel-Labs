import { z } from "zod";
import { YOUTUBE_CHANNEL_REQUEST_SCHEMA } from "./schemas";
import type { YT_CHANNEL_CONTENT_TYPE } from "./constants";
import type { YT_THUMBNAIL } from "../types";

type YOUTUBE_CHANNEL_REQUEST = z.infer<typeof YOUTUBE_CHANNEL_REQUEST_SCHEMA>;

export type YOUTUBE_CHANNEL_FETCH_REQUEST = {
  channelId: string;
  contentType?: YOUTUBE_CHANNEL_REQUEST["contentType"];
  limit?: YOUTUBE_CHANNEL_REQUEST["limit"];
  country?: YOUTUBE_CHANNEL_REQUEST["country"];
  region?: YOUTUBE_CHANNEL_REQUEST["region"];
};

export type YOUTUBE_CHANNEL_GRID_ITEM =
  | {
      richItemRenderer: {
        content?: {
          lockupViewModel?: {
            contentId?: string;
            contentImage?: {
              thumbnailViewModel?: {
                image?: { sources?: YT_THUMBNAIL[] };
              };
            };
            metadata?: {
              lockupMetadataViewModel?: {
                title?: { content?: string };
                metadata?: {
                  contentMetadataViewModel?: {
                    metadataRows?: Array<{
                      metadataParts?: Array<{
                        text?: { content?: string };
                      }>;
                    }>;
                  };
                };
              };
            };
          };
          shortsLockupViewModel?: {
            entityId?: string;
            accessibilityText?: string;
            thumbnailViewModel?: {
              thumbnailViewModel?: {
                image?: { sources?: YT_THUMBNAIL[] };
              };
            };
            overlayMetadata?: {
              primaryText?: { content?: string };
              secondaryText?: { content?: string };
            };
            onTap?: {
              innertubeCommand?: {
                reelWatchEndpoint?: {
                  videoId?: string;
                  thumbnail?: { thumbnails?: YT_THUMBNAIL[] };
                };
              };
            };
          };
        };
      };
    }
  | {
      continuationItemRenderer: {
        continuationEndpoint: {
          continuationCommand: { token: string };
        };
      };
    };

export type YOUTUBE_CHANNEL_VIDEO_LOCKUP = NonNullable<
  NonNullable<
    Extract<
      YOUTUBE_CHANNEL_GRID_ITEM,
      { richItemRenderer: unknown }
    >["richItemRenderer"]["content"]
  >["lockupViewModel"]
>;

export type YOUTUBE_CHANNEL_SHORTS_LOCKUP = NonNullable<
  NonNullable<
    Extract<
      YOUTUBE_CHANNEL_GRID_ITEM,
      { richItemRenderer: unknown }
    >["richItemRenderer"]["content"]
  >["shortsLockupViewModel"]
>;

export type YOUTUBE_CHANNEL_PLAYLIST_GRID_ITEM = {
  lockupViewModel?: YOUTUBE_CHANNEL_PLAYLIST_LOCKUP;
};

export type YOUTUBE_CHANNEL_PLAYLIST_LOCKUP = {
  contentId?: string;
  contentType?: string;
  contentImage?: {
    collectionThumbnailViewModel?: {
      primaryThumbnail?: {
        thumbnailViewModel?: {
          image?: { sources?: YT_THUMBNAIL[] };
          overlays?: Array<{
            thumbnailOverlayBadgeViewModel?: {
              thumbnailBadges?: Array<{
                thumbnailBadgeViewModel?: { text?: string };
              }>;
            };
          }>;
        };
      };
    };
    thumbnailViewModel?: {
      image?: { sources?: YT_THUMBNAIL[] };
    };
  };
  metadata?: {
    lockupMetadataViewModel?: {
      title?: { content?: string };
      metadata?: {
        contentMetadataViewModel?: {
          metadataRows?: Array<{
            metadataParts?: Array<{
              text?: { content?: string };
            }>;
          }>;
        };
      };
    };
  };
  itemPlayback?: {
    inlinePlayerData?: {
      onSelect?: {
        innertubeCommand?: {
          watchEndpoint?: {
            videoId?: string;
            playlistId?: string;
          };
        };
      };
    };
  };
  rendererContext?: {
    commandContext?: {
      onTap?: {
        innertubeCommand?: {
          watchEndpoint?: {
            videoId?: string;
            playlistId?: string;
          };
        };
      };
    };
  };
};

export type YOUTUBE_CHANNEL_BROWSE_RESPONSE = {
  metadata?: {
    channelMetadataRenderer?: {
      title?: string;
      description?: string;
      externalId?: string;
      channelUrl?: string;
      vanityChannelUrl?: string;
      isFamilySafe?: boolean;
      rssUrl?: string;
      keywords?: string;
      avatar?: { thumbnails?: YT_THUMBNAIL[] };
    };
  };
  header?: {
    pageHeaderRenderer?: {
      pageTitle?: string;
      content?: {
        pageHeaderViewModel?: {
          title?: {
            dynamicTextViewModel?: {
              text?: { content?: string };
              rendererContext?: {
                accessibilityContext?: { label?: string };
              };
            };
          };
          image?: {
            decoratedAvatarViewModel?: {
              avatar?: {
                avatarViewModel?: {
                  image?: { sources?: YT_THUMBNAIL[] };
                };
              };
            };
          };
          metadata?: {
            contentMetadataViewModel?: {
              metadataRows?: Array<{
                metadataParts?: Array<{
                  text?: { content?: string };
                }>;
              }>;
            };
          };
          description?: {
            descriptionPreviewViewModel?: {
              description?: { content?: string };
              rendererContext?: {
                commandContext?: {
                  onTap?: {
                    innertubeCommand?: YOUTUBE_CHANNEL_ENGAGEMENT_COMMAND;
                  };
                };
              };
            };
          };
          attribution?: {
            attributionViewModel?: {
              text?: {
                content?: string;
                commandRuns?: Array<{
                  onTap?: {
                    innertubeCommand?: {
                      urlEndpoint?: { url?: string };
                    };
                  };
                }>;
              };
              suffix?: {
                content?: string;
                commandRuns?: Array<{
                  onTap?: {
                    innertubeCommand?: YOUTUBE_CHANNEL_ENGAGEMENT_COMMAND;
                  };
                }>;
              };
            };
          };
          banner?: {
            imageBannerViewModel?: {
              image?: { sources?: YT_THUMBNAIL[] };
            };
          };
        };
      };
    };
  };
  contents?: {
    twoColumnBrowseResultsRenderer?: {
      tabs?: Array<{
        tabRenderer?: {
          title?: string;
          selected?: boolean;
          content?: {
            richGridRenderer?: { contents?: YOUTUBE_CHANNEL_GRID_ITEM[] };
            sectionListRenderer?: {
              contents?: Array<{
                itemSectionRenderer?: {
                  contents?: Array<{
                    gridRenderer?: {
                      items?: YOUTUBE_CHANNEL_PLAYLIST_GRID_ITEM[];
                    };
                  }>;
                };
              }>;
            };
          };
        };
      }>;
    };
  };
};

type YOUTUBE_CHANNEL_ENGAGEMENT_COMMAND = {
  showEngagementPanelEndpoint?: {
    engagementPanel?: {
      engagementPanelSectionListRenderer?: {
        content?: {
          sectionListRenderer?: {
            contents?: Array<{
              itemSectionRenderer?: {
                contents?: Array<{
                  continuationItemRenderer?: {
                    continuationEndpoint?: {
                      continuationCommand?: { token?: string };
                    };
                  };
                }>;
              };
            }>;
          };
        };
      };
    };
  };
};

export type YOUTUBE_CHANNEL_ABOUT_VIEW_MODEL = {
  country?: string;
  viewCountText?: string;
  subscriberCountText?: string;
  joinedDateText?: { content?: string };
  links?: Array<{
    channelExternalLinkViewModel?: {
      title?: { content?: string };
      link?: {
        content?: string;
        commandRuns?: Array<{
          onTap?: {
            innertubeCommand?: {
              urlEndpoint?: { url?: string };
            };
          };
        }>;
      };
    };
  }>;
};

export type YOUTUBE_CHANNEL_ABOUT_RESPONSE = {
  onResponseReceivedEndpoints?: Array<{
    appendContinuationItemsAction?: {
      continuationItems?: Array<{
        aboutChannelRenderer?: {
          metadata?: {
            aboutChannelViewModel?: YOUTUBE_CHANNEL_ABOUT_VIEW_MODEL;
          };
        };
      }>;
    };
  }>;
  onResponseReceivedActions?: YOUTUBE_CHANNEL_ABOUT_RESPONSE["onResponseReceivedEndpoints"];
  onResponseReceivedCommands?: YOUTUBE_CHANNEL_ABOUT_RESPONSE["onResponseReceivedEndpoints"];
};

export type YOUTUBE_CHANNEL_CONTINUATION_RESPONSE = {
  onResponseReceivedActions?: Array<{
    appendContinuationItemsAction?: {
      continuationItems?: YOUTUBE_CHANNEL_GRID_ITEM[];
    };
  }>;
  onResponseReceivedCommands?: Array<{
    appendContinuationItemsAction?: {
      continuationItems?: YOUTUBE_CHANNEL_GRID_ITEM[];
    };
  }>;
};

export type YOUTUBE_CHANNEL_LINK = {
  title: string;
  displayUrl: string | null;
  url: string;
};

export type YOUTUBE_CHANNEL_INFO = {
  title: string | null;
  description: string | null;
  descriptionPreview: string | null;
  channelId: string | null;
  channelUrl: string | null;
  handle: string | null;
  handleUrl: string | null;
  avatar: YT_THUMBNAIL[] | null;
  banner: YT_THUMBNAIL[] | null;
  isVerified: boolean | null;
  isFamilySafe: boolean | null;
  subscriberCountText: string | null;
  subscribers: number | null;
  videoCountText: string | null;
  videoCount: number | null;
  totalViewsText: string | null;
  totalViews: number | null;
  joinedDateText: string | null;
  country: string | null;
  rssUrl: string | null;
  keywords: string | null;
  links: YOUTUBE_CHANNEL_LINK[] | null;
};

export type YOUTUBE_CHANNEL_VIDEO_ITEM = {
  videoId: string;
  title: string | null;
  thumbnail: YT_THUMBNAIL[] | null;
  viewsText: string | null;
  views: number | null;
  publishedText: string | null;
};

export type YOUTUBE_CHANNEL_SHORT_ITEM = {
  shortId: string;
  title: string | null;
  thumbnail: YT_THUMBNAIL[] | null;
  viewsText: string | null;
  views: number | null;
  publishedText: string | null;
};

export type YOUTUBE_CHANNEL_PLAYLIST_ITEM = {
  playlistId: string;
  title: string | null;
  thumbnail: YT_THUMBNAIL[] | null;
  videoCountText: string | null;
  videoCount: number | null;
  firstVideoId: string | null;
  playlistUrl: string;
};

export type YOUTUBE_CHANNEL_RESPONSE = {
  channelId: string;
  channelInfo: YOUTUBE_CHANNEL_INFO | null;
  contentType: YT_CHANNEL_CONTENT_TYPE;
  items:
    | YOUTUBE_CHANNEL_VIDEO_ITEM[]
    | YOUTUBE_CHANNEL_SHORT_ITEM[]
    | YOUTUBE_CHANNEL_PLAYLIST_ITEM[];
  totalResults: number;
};
