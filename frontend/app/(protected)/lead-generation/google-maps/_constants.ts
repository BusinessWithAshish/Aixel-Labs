import {
  GMAPS_ENRICHMENT_DEFAULTS,
  GMAPS_REQUEST_LIMIT_DEFAULT,
  GMAPS_REQUEST_LIMIT_MAX,
} from '@aixellabs/backend/gmaps/filters';
import { GMAPS_EMPTY } from '@aixellabs/backend/gmaps/place-types';
import type { GMAPS_INTERNAL_REQUEST } from '@aixellabs/backend/gmaps/internal/types';

export const DEFAULT_GOOGLE_MAPS_FORM_VALUES: GMAPS_INTERNAL_REQUEST = {
  query: GMAPS_EMPTY,
  placeType: undefined,
  country: GMAPS_EMPTY,
  countryCode: GMAPS_EMPTY,
  state: GMAPS_EMPTY,
  cities: [],
  urls: [],
  enrichment: { ...GMAPS_ENRICHMENT_DEFAULTS },
  limit: GMAPS_REQUEST_LIMIT_DEFAULT,
};

export { GMAPS_REQUEST_LIMIT_MAX, GMAPS_EMPTY };
