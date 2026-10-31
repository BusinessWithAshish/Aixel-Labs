export const DEFAULT_GOOGLE_MAPS_URL = "https://www.google.com/maps/search/";

export const GMAPS_FIELD_DESCRIPTIONS = {
  base: "When ever there is a query based input given byt he user and not a url directly, dont fill up the urls array, unless user gives the array of url(s) as input",
  query:
    "Type of business or search intent (e.g. dentists, Italian restaurants, emergency plumbers). Fold brainstormed keywords into this field.",
  country:
    "Full country name, always auto-inferred from any city or region mentioned — never ask the user. Examples: Miami → 'United States', London → 'United Kingdom', Dubai → 'United Arab Emirates', Mumbai → 'India', Toronto → 'Canada', Sydney → 'Australia'. One country per submission.",
  state:
    "State or province, always auto-inferred from any city mentioned — never ask the user. Examples: Miami → 'Florida', Chicago → 'Illinois', Los Angeles → 'California', Mumbai → 'Maharashtra', Toronto → 'Ontario', Sydney → 'New South Wales'. Omit (leave empty) for UAE, Singapore, Hong Kong, Bahrain, Kuwait, Qatar, Oman, Luxembourg, Monaco — these have no state-level division.",
  cities:
    'One or more cities in the same country and state when applicable. Never mix cities from different states or regions. Whenever the user names a city or cities, populate cities from that wording (e.g. Miami → ["Miami"]). Do not drop city names.',
  urls: "Valid Google Maps URLs. When provided, omit query, country, state, and cities.",
  countryCode:
    "Lowercase ISO 3166-1 alpha-2 code derived from country. India in, United States us, United Arab Emirates ae, United Kingdom gb. Set whenever country is known; never ask the user.",
} as const;
