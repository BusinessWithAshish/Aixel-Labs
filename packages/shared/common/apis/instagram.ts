import z from "zod";

// either search query by specifying search for (users, hashtags, locations, tags)
// or search by username/instagram Urls
// or search by location by specifying country, states, cities

export enum INSTAGRAM_SCRAPE_SEARCH_FOR {
  USERNAMES = "usernames",
  QUERY = "query",
}

export const INSTAGRAM_SCRAPE_REQUEST_SCHEMA = z.object({
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

export type INSTAGRAM_SCRAPE_REQUEST = z.infer<
  typeof INSTAGRAM_SCRAPE_REQUEST_SCHEMA
>;

export type INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO = {
  username: string | null;
  email: string | null;
  instagramUrl: string | null;
  phoneNumber: string | null;
  website: string | null;
  bio: string | null;
};

export type INSTAGRAM_SCRAPE_RESPONSE = {
  founded: string[];
  foundedLeadsCount: number;
  allLeads: INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO[];
  allLeadsCount: number;
};
