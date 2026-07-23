import { FACEBOOK_REQUEST_SCHEMA } from "./schemas";
import { z } from "zod";

export type FACEBOOK_REQUEST = z.infer<typeof FACEBOOK_REQUEST_SCHEMA>;

export type FACEBOOK_RESPONSE = {
  id: string | null;
  name: string | null;
  facebookUrl: string | null;
  category: string | null;
  website: string | null;
  phone: string | null;
  emails: string[] | null;
  address: string | null;
  followers: number | null;
  likes: number | null;
  verified: boolean | null;
  profileImageUrl: string | null;
  bio: string | null;
};
