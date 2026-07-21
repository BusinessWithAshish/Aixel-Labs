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

export type YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_ITEM = {
  videoSecondaryInfoRenderer?: {
    owner?: {
      videoOwnerRenderer?: {
        subscriberCountText?: { simpleText?: string };
        // Newer "collaborators" layout: subscriber count is only available
        // inside the inline Collaborators dialog shown when clicking the
        // owner navigation endpoint or attributed title. The first list item
        // is the primary channel; its subtitle carries "@handle • 11.8M subscribers".
        navigationEndpoint?: {
          showDialogCommand?: {
            panelLoadingStrategy?: {
              inlineContent?: {
                dialogViewModel?: {
                  customContent?: {
                    listViewModel?: {
                      listItems?: Array<{
                        listItemViewModel?: {
                          subtitle?: { content?: string };
                          rendererContext?: {
                            accessibilityContext?: { label?: string };
                          };
                        };
                      }>;
                    };
                  };
                };
              };
            };
          };
        };
        attributedTitle?: {
          commandRuns?: Array<{
            onTap?: {
              innertubeCommand?: {
                showDialogCommand?: {
                  panelLoadingStrategy?: {
                    inlineContent?: {
                      dialogViewModel?: {
                        customContent?: {
                          listViewModel?: {
                            listItems?: Array<{
                              listItemViewModel?: {
                                subtitle?: { content?: string };
                                rendererContext?: {
                                  accessibilityContext?: { label?: string };
                                };
                              };
                            }>;
                          };
                        };
                      };
                    };
                  };
                };
              };
            };
          }>;
        };
      };
    };
  };
  itemSectionRenderer?: {
    header?: {
      commentsHeaderRenderer?: {
        countText?: { runs?: Array<{ text?: string }> };
      };
    };
  };
  videoPrimaryInfoRenderer?: {
    viewCount?: {
      videoViewCountRenderer?: {
        viewCount?: { simpleText?: string };
        shortViewCount?: { simpleText?: string; runs?: Array<{ text?: string }> };
      };
    };
  };
  contents?: YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_ITEM[];
};

/**
 * InnerTube sometimes returns `results.results` as an array of panels
 * (`{ contents: [...] }[]`) and sometimes as a single object
 * (`{ contents: [...] }`). Callers must normalize before iterating.
 */
export type YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_RESULTS =
  | YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_ITEM[]
  | {
      contents?: YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_ITEM[];
    };

export type YOUTUBE_VIDEO_GET_WATCH_RESPONSE = [
  {
    playerResponse?: {
      videoDetails?: YOUTUBE_VIDEO_DETAILS;
      playabilityStatus?: {
        status?: string;
        reason?: string;
      };
      microformat?: {
        playerMicroformatRenderer?: {
          uploadDate?: string;
          publishDate?: string;
          likeCount?: string;
        };
      };
    };
  },
  {
    watchNextResponse?: {
      contents?: YOUTUBE_VIDEO_WATCH_NEXT_RESULTS & {
        twoColumnWatchNextResults?: {
          results?: {
            results?: YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_RESULTS;
          };
        };
      };
      engagementPanels?: YOUTUBE_VIDEO_ENGAGEMENT_PANEL[];
    };
  },
];

export type YOUTUBE_VIDEO_ENGAGEMENT_PANEL = {
  engagementPanelSectionListRenderer?: {
    targetId?: string;
    header?: {
      engagementPanelTitleHeaderRenderer?: {
        contextualInfo?: {
          runs?: Array<{ text?: string }>;
          simpleText?: string;
        };
        title?: {
          runs?: Array<{ text?: string }>;
          simpleText?: string;
          contextualInfo?: {
            runs?: Array<{ text?: string }>;
            simpleText?: string;
          };
        };
      };
    };
    content?: {
      structuredDescriptionContentRenderer?: {
        items?: Array<{
          videoDescriptionHeaderRenderer?: {
            factoid?: Array<{
              factoidRenderer?: {
                value?: { simpleText?: string };
                label?: { simpleText?: string };
              };
            }>;
          };
        }>;
      };
    };
  };
};

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
  videoUrl: string;
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
  videoUrl: string;
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
  publishedAt: string | null;
  channelSubscribers: number | null;
  likeCount: number | null;
  commentCount: number | null;
};

export type YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE = {
  videoId: string;
  items: YOUTUBE_VIDEO_SUGGESTION_ITEM[];
  totalResults: number;
};
