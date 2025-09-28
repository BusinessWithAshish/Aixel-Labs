import {GmapsScrape} from "../apis/GMAPS_SCRAPE";
import {GOOGLE_MAPS_BASE_URL} from "./constants";

function createGoogleMapsUrl(query: string, city: string, state: string, country: string) {
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

export type TGoogleMapsUrls = {
  city: string;
  state: string;
  country: string;
  query: string;
  url: string;
};

export function generateGoogleMapsUrls(data: GmapsScrape) {
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