import z from "zod";
import type { INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO } from "./types";

export enum INSTAGRAM_SCRAPE_SEARCH_FOR {
  USERNAMES = "usernames",
  QUERY = "query",
}

export const INSTAGRAM_SCRAPE_REQUEST_SCHEMA = z.object({
  searchFor: z.nativeEnum(INSTAGRAM_SCRAPE_SEARCH_FOR),
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
  excludeKeywords: z.array(z.string()).optional(),
  excludeHashtags: z.array(z.string()).optional(),
});

export type INSTAGRAM_SCRAPE_REQUEST = z.infer<
  typeof INSTAGRAM_SCRAPE_REQUEST_SCHEMA
>;

export type INSTAGRAM_SCRAPE_RESPONSE = {
  founded: string[];
  foundedLeadsCount: number;
  allLeads: INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO[];
  allLeadsCount: number;
};

export const INSTAGRAM_SCRAPE_ADVANCED_REQUEST_SCHEMA = z.object({
  searchFor: z.nativeEnum(INSTAGRAM_SCRAPE_SEARCH_FOR),
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
