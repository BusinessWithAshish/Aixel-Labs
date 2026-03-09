import { z } from "zod";
import { GMAPS_REQUEST_SCHEMA } from "../schemas";

export type GMAPS_SCRAPE_LEAD_INFO = {
  placeId: string | null;
  website: string | null;
  phoneNumber: string | null;
  name: string | null;
  gmapsUrl: string | null;
  overAllRating: string | null;
  numberOfReviews: string | null;
};

export type GMAPS_SCRAPE_REQUEST = z.infer<typeof GMAPS_REQUEST_SCHEMA>;

export type GMAPS_SCRAPE_RESPONSE = {
  founded: string[];
  foundedLeadsCount: number;
  allLeads: GMAPS_SCRAPE_LEAD_INFO[];
  allLeadsCount: number;
};
