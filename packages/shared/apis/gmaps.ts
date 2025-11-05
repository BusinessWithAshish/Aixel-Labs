// GMAPS API Types and Utilities

// Request type matching backend schema
export type GmapsScrapeRequest = {
  query: string;
  country: string;
  states: Array<{
    name: string;
    cities: string[];
  }>;
};

// Response types
export type Lead = {
  id?: string;
  name: string;
  overAllRating: string;
  phoneNumber: string;
  numberOfReviews: string;
  website: string;
  gmapsUrl: string;
};

export type GmapsScrapeResponse = {
  founded: string[];
  foundedLeadsCount: number;
  allLeads: Lead[];
  allLeadsCount: number;
};

// Streaming message types
export type StreamMessage = {
  type: 'progress' | 'status' | 'error' | 'complete';
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
    allLeads?: Lead[];
  };
  timestamp: string;
};

// Utility types
export type TGoogleMapsUrls = {
  city: string;
  state: string;
  country: string;
  query: string;
  url: string;
};

// Constants
const GOOGLE_MAPS_BASE_URL = 'https://www.google.com/maps/search/';

// Utility functions
function createGoogleMapsUrl(query: string, city: string, state: string, country: string): string {
  console.log(`🔗 Creating URL for: "${query}" in "${city}, ${state}, ${country}"`);
  
  // Clean and format the query
  const formattedQuery = query.toLowerCase().trim().replace(/\s+/g, '+');
  console.log(`🔗 Formatted query: "${formattedQuery}"`);

  // Create location string: City, State, Country
  const location = `${city}, ${state}, ${country}`;
  const formattedLocation = location.replace(/\s+/g, '+').replace(/,/g, ',');
  console.log(`🔗 Formatted location: "${formattedLocation}"`);

  // Construct the final URL
  const searchTerm = `${formattedQuery}+in+${formattedLocation}`;
  console.log(`🔗 Search term: "${searchTerm}"`);

  // URL encode the entire search term
  const encodedSearchTerm = encodeURIComponent(searchTerm).replace(/%2B/g, '+');
  console.log(`🔗 Encoded search term: "${encodedSearchTerm}"`);

  const finalUrl = `${GOOGLE_MAPS_BASE_URL}${encodedSearchTerm}`;
  console.log(`🔗 Final URL: "${finalUrl}"`);

  return finalUrl;
}

export function generateGoogleMapsUrls(data: GmapsScrapeRequest): string[] {
  const urls: TGoogleMapsUrls[] = [];

  data.states.forEach(state => {
    state.cities.forEach(city => {
      const url = createGoogleMapsUrl(data.query, city, state.name, data.country);
      urls.push({
        city: city,
        state: state.name,
        country: data.country,
        query: data.query,
        url: url
      });
    });
  });

  return urls.map(url => url.url);
}

