// Base Instagram API types:
import { INSTAGRAM_REQUEST_SCHEMA } from "./schemas";
import { z } from "zod";
type PageInfo = { has_next_page: boolean; end_cursor: string };
type Edge<T> = {
  count: number;
  page_info: PageInfo;
  edges: Array<{ node: T }>;
};
type Dims = { height: number; width: number };
type Owner = { id: string; username: string };
export type Profile = Owner & {
  profile_pic_url: string;
  is_verified: boolean;
  full_name: string;
};
type Thumbnail = { src: string; config_width: number; config_height: number };

type BaseMedia = {
  id: string;
  dimensions: Dims;
  display_url: string;
  owner: Owner;
  is_video: boolean;
  has_audio: boolean;
  video_url: string;
  taken_at_timestamp: number;
  video_view_count: string;
  location: string;
  thumbnail_src: string;
  thubnail_tall_src: string;
  thumbnail_resoruce: Thumbnail[];
};

type Video = BaseMedia & {
  edge_media_to_tagged_users: { count: number; edges: Array<object> };
  comments_disabled: boolean;
  video_duration: number;
  title: string;
  edge_media_to_comment: { count: number };
  edge_liked_by: { count: number };
  edge_media_preview_like: { count: number };
};

type Post = BaseMedia & {
  edge_media_to_tagged_users: Array<{ node: { user: Profile } }>;
  edge_media_to_caption: { edges: Array<{ node: { text: string } }> };
  edge_media_to_comment: { count: number };
  edge_liked_by: { count: number };
  edge_media_preview_like: { count: number };
  coauthor_producers: Profile[];
  pinned_for_users: Profile[];
  clips_music_attribution_infor: {
    artist_name: string;
    audio_id: string;
    song_name: string;
    uses_original_audio: boolean;
  };
};

type InstagramUserBase = {
  biography: string;
  bio_links: Array<{ url: string; title: string; link_type: string }>;
  biography_with_entities: {
    raw_text: string;
    entities: Array<{
      user: { username: string };
      hashtag: { name: string };
    }>;
  };
  edge_followed_by: { count: number };
  edge_follow: { count: number };
  fbid: string;
  full_name: string;
  highlight_reel_count: number;
  has_onboarded_to_text_post_app: boolean;
  id: string;
  is_business_account: boolean;
  is_professional_account: boolean;
  if_joined_recently: boolean;
  business_email: string;
  business_phone_number: string;
  business_category_name: string;
  overall_category_name: string;
  business_address_json: string;
  is_private: boolean;
  is_verified: boolean;
  profile_pic_url: string;
  profile_pic_url_hd: string;
  username: string;
};

type InstagramUserProFields = {
  edge_felix_video_timeline: Edge<Video>;
  edge_owner_to_timeline_media: Edge<Post>;
  edge_saved_media: Edge<object>;
  edge_media_collections: Edge<object>;
  edge_related_profiles: Edge<Profile>;
};

export type InstagramUser = {
  data: {
    user: InstagramUserBase & InstagramUserProFields;
  };
  status: string;
};

export type INSTAGRAM_REQUEST = z.infer<typeof INSTAGRAM_REQUEST_SCHEMA>;

export type INSTAGRAM_RESPONSE = {
  id: string | null;
  fullName: string | null;
  username: string | null;
  instagramUrl: string | null;
  websites: string[] | null;
  bio: string | null;
  bioHashtags: string[] | null;
  bioMentions: string[] | null;
  followers: number | null;
  following: number | null;
  posts: number | null;
  profilePicture: string | null;
  profilePictureHd: string | null;
  isVerified: boolean | null;
  isBusiness: boolean | null;
  isProfessional: boolean | null;
  isPrivate: boolean | null;
  isJoinedRecently: boolean | null;
  businessEmail: string | null;
  businessPhoneNumber: string | null;
  businessCategoryName: string | null;
  overallCategoryName: string | null;
  businessAddressJson: string | null;
};
