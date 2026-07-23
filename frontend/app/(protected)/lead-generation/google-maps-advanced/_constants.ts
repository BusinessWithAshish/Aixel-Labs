import type { GMAPS_ADVANCED_REQUEST } from '@aixellabs/backend/gmaps/advanced';
import { GMAPS_ADVANCED_DEFAULTS } from '@aixellabs/backend/gmaps/advanced/constants';

export const DEFAULT_GOOGLE_MAPS_ADVANCED_FORM_VALUES: GMAPS_ADVANCED_REQUEST = {
    urls: [],
    richness: GMAPS_ADVANCED_DEFAULTS.RICHNESS,
};

export const GOOGLE_MAPS_ADVANCED_FORM_NAME = 'google-maps-advanced-form';
