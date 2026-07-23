import type { FACEBOOK_REQUEST } from '@aixellabs/backend/facebook';
import { FACEBOOK_REQUEST_RESULT_LIMIT_DEFAULT } from '@aixellabs/backend/facebook/constants';

export const DEFAULT_FACEBOOK_FORM_VALUES: FACEBOOK_REQUEST = {
    entities: [],
    query: '',
    country: '',
    state: '',
    city: '',
    keywords: [],
    excludeKeywords: [],
    limit: FACEBOOK_REQUEST_RESULT_LIMIT_DEFAULT,
};

export const FACEBOOK_FORM_NAME = 'facebook-search-form';
