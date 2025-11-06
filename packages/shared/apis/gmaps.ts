// GMAPS API Types and Utilities
import z from "zod";

// Constants
export const GOOGLE_MAPS_BASE_URL = "https://www.google.com/maps/search/";

export const GMAPS_SCRAPE_REQUEST_SCHEMA = z.object({
  query: z.string(),
  country: z.string(),
  states: z.array(
    z.object({
      name: z.string(),
      cities: z.array(z.string()),
    })
  ),
});
export type GMAPS_SCRAPE_REQUEST = z.infer<typeof GMAPS_SCRAPE_REQUEST_SCHEMA>;

export type GMAPS_SCRAPE_RESPONSE = {
  founded: string[];
  foundedLeadsCount: number;
  allLeads: GMAPS_SCRAPE_LEAD_INFO[];
  allLeadsCount: number;
};

export type GMAPS_SCRAPE_LEAD_INFO = {
  website: string;
  phoneNumber: string;
  name: string;
  gmapsUrl: string;
  overAllRating: string;
  numberOfReviews: string;
};

// Streaming message types
export type StreamMessage = {
  type: "progress" | "status" | "error" | "complete";
  message: string;
  data?: {
    current?: number;
    total?: number;
    percentage?: number;
    stage?: string;
    batch?: number;
    browser?: number;
    phase?: number;
    foundedLeadsCount?: number;
    allLeadsCount?: number;
    founded?: string[];
    allLeads?: GMAPS_SCRAPE_LEAD_INFO[];
  };
  timestamp: string;
};

// Utility functions
export function generateGoogleMapsUrls(data: GMAPS_SCRAPE_REQUEST): string[] {
  const urls: string[] = [];

  data.states.forEach((state: { name: string; cities: string[] }) => {
    state.cities.forEach((city: string) => {
      // Clean and format the query
      const formattedQuery = data.query
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "+");

      // Create location string: City, State, Country
      const location = `${city}, ${state.name}, ${data.country}`;
      const formattedLocation = location
        .replace(/\s+/g, "+")
        .replace(/,/g, ",");

      // Construct the final URL
      const searchTerm = `${formattedQuery}+in+${formattedLocation}`;

      // URL encode the entire search term
      const encodedSearchTerm = encodeURIComponent(searchTerm).replace(
        /%2B/g,
        "+"
      );

      const finalUrl = `${GOOGLE_MAPS_BASE_URL}${encodedSearchTerm}`;

      urls.push(finalUrl);
    });
  });

  return urls;
}
