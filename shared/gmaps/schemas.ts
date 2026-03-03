import { z } from "zod";
import type { GMAPS_SCRAPE_LEAD_INFO } from "./types";

export const GMAPS_SCRAPE_REQUEST_SCHEMA = z.object({
  query: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  cities: z.array(z.string()).optional(),
  urls: z.array(z.url()).optional(),
});

export type GMAPS_SCRAPE_REQUEST = z.infer<typeof GMAPS_SCRAPE_REQUEST_SCHEMA>;

export type GMAPS_SCRAPE_RESPONSE = {
  founded: string[];
  foundedLeadsCount: number;
  allLeads: GMAPS_SCRAPE_LEAD_INFO[];
  allLeadsCount: number;
};
