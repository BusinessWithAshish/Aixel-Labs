import z from "zod";
import { INSTAGRAM_SCRAPE_SEARCH_FOR } from "./instagram.js";

export const INSTAGRAM_SCRAPE_ADVANCED_REQUEST_SCHEMA = z.object({
  searchFor: z.enum(INSTAGRAM_SCRAPE_SEARCH_FOR),
  usernames: z.array(z.string()).optional(),
  query: z.string().optional(),
  country: z.string().optional(),
  states: z
    .array(
      z
        .object({
          name: z.string(),
          cities: z.array(z.string()),
        })
        .optional()
    )
    .optional(),
  hashtags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
});

export type INSTAGRAM_SCRAPE_ADVANCED_REQUEST = z.infer<
  typeof INSTAGRAM_SCRAPE_ADVANCED_REQUEST_SCHEMA
>;

export type INSTAGRAM_SCRAPE_ADVANCED_SEARCH_SCRAPE_LEAD_INFO = {
    username: string | null;
    email: string | null;
    instagramUrl: string | null;
    phoneNumber: string | null;
    website: string | string[] | null;
    bio: string | null;
    followers: number | null;
    following: number | null;
    posts: number | null;
    profilePicture: string | null;
  };