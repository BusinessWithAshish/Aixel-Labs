import { z } from "zod";
import {
  INSTAGRAM_REQUEST_SCHEMA,
  INSTAGRAM_SUGGESTED_REQUEST_SCHEMA,
} from "./schemas";

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
  businessPhoneNumber: string[] | null;
  businessCategoryName: string | null;
  overallCategoryName: string | null;
  businessAddressJson: string | null;
};

export type INSTAGRAM_SUGGESTED_REQUEST = z.infer<
  typeof INSTAGRAM_SUGGESTED_REQUEST_SCHEMA
>;

/** One "accounts you might like" entry — the lean shape AYML ships to guests. */
export type INSTAGRAM_SUGGESTED_PROFILE = {
  id: string | null;
  username: string | null;
  fullName: string | null;
  instagramUrl: string | null;
  isVerified: boolean | null;
  profilePicture: string | null;
};

export type INSTAGRAM_SUGGESTED_RESPONSE = {
  /** The handle the suggestions are for (normalized). */
  username: string;
  /** Its pk, or null when the account couldn't be resolved. */
  userId: string | null;
  /** Suggested accounts — empty when Instagram shows guests none. */
  suggested: INSTAGRAM_SUGGESTED_PROFILE[];
};
