import { z } from "zod";
import { IG_ADVANCED_POSTS_REQUEST_SCHEMA } from "./schemas";
import type { IG_MEDIA_TYPE_LABEL } from "./constants";

export type IG_ADVANCED_POSTS_REQUEST = z.infer<
  typeof IG_ADVANCED_POSTS_REQUEST_SCHEMA
>;

export type IgMediaTypeLabel =
  (typeof IG_MEDIA_TYPE_LABEL)[keyof typeof IG_MEDIA_TYPE_LABEL];

export type IG_ADVANCED_POST_IMAGE = {
  url: string;
  width: number | null;
  height: number | null;
};

export type IG_ADVANCED_POST_VIDEO = {
  url: string;
  width: number | null;
  height: number | null;
  type: number | null;
};

export type IG_ADVANCED_POST_USER = {
  id: string | null;
  username: string | null;
  fullName: string | null;
  isVerified: boolean | null;
  profilePicUrl: string | null;
};

export type IG_ADVANCED_POST = {
  id: string | null;
  pk: string | null;
  shortcode: string | null;
  url: string | null;
  mediaType: number | null;
  mediaTypeLabel: IgMediaTypeLabel | "unknown";
  productType: string | null;
  takenAt: number | null;
  caption: string | null;
  likeCount: number | null;
  commentCount: number | null;
  playCount: number | null;
  viewCount: number | null;
  isVideo: boolean;
  commentsDisabled: boolean | null;
  likeAndViewCountsDisabled: boolean | null;
  locationName: string | null;
  locationId: string | null;
  imageUrl: string | null;
  images: IG_ADVANCED_POST_IMAGE[];
  videoUrl: string | null;
  videos: IG_ADVANCED_POST_VIDEO[];
  carouselCount: number | null;
  carousel: IG_ADVANCED_POST[];
  user: IG_ADVANCED_POST_USER | null;
  coauthors: IG_ADVANCED_POST_USER[];
};

export type IG_ADVANCED_POSTS_PAGE_INFO = {
  hasNextPage: boolean;
  endCursor: string | null;
};

export type IG_ADVANCED_POSTS_RESPONSE = {
  username: string;
  userId: string | null;
  posts: IG_ADVANCED_POST[];
  pageInfo: IG_ADVANCED_POSTS_PAGE_INFO;
  /** Raw pages fetched in this request. */
  pagesFetched: number;
};

/** Raw Instagram v1 feed item (subset we care about). */
export type IgFeedImageCandidate = {
  url?: string;
  width?: number;
  height?: number;
};

export type IgFeedVideoVersion = {
  url?: string;
  width?: number;
  height?: number;
  type?: number;
};

export type IgFeedUser = {
  pk?: string | number;
  id?: string | number;
  username?: string;
  full_name?: string;
  is_verified?: boolean;
  profile_pic_url?: string;
};

export type IgFeedCaption = {
  text?: string;
};

export type IgFeedLocation = {
  name?: string;
  pk?: string | number;
  location_id?: string | number;
};

export type IgFeedItem = {
  id?: string;
  pk?: string | number;
  code?: string;
  media_type?: number;
  product_type?: string;
  taken_at?: number;
  caption?: IgFeedCaption | null;
  like_count?: number;
  comment_count?: number;
  play_count?: number;
  view_count?: number;
  comments_disabled?: boolean;
  like_and_view_counts_disabled?: boolean;
  location?: IgFeedLocation | null;
  image_versions2?: { candidates?: IgFeedImageCandidate[] };
  video_versions?: IgFeedVideoVersion[];
  carousel_media_count?: number;
  carousel_media?: IgFeedItem[];
  user?: IgFeedUser;
  coauthor_producers?: IgFeedUser[];
};

export type IgFeedUserTimelineResponse = {
  items?: IgFeedItem[];
  more_available?: boolean;
  next_max_id?: string;
  num_results?: number;
  user?: IgFeedUser;
  status?: string;
};
