import {
    GSEARCH_DEFAULT_LANGUAGE,
    GSEARCH_DEFAULT_PAGES,
    GSEARCH_DEFAULT_TIME_FILTER,
    GSEARCH_SAFE,
    GSEARCH_TIME_FILTER,
} from '@aixellabs/backend/gsearch/constants';
import type { GSEARCH_REQUEST } from '@aixellabs/backend/gsearch/types';
import type { OptionType } from '@/components/ui/searchable-select';

export const DEFAULT_GOOGLE_ADVANCED_SEARCH_FORM_VALUES: GSEARCH_REQUEST = {
    searchQuery: '',
    country: '',
    region: undefined,
    state: undefined,
    pages: GSEARCH_DEFAULT_PAGES,
    language: GSEARCH_DEFAULT_LANGUAGE,
    safe: GSEARCH_SAFE.OFF,
    timeFilter: GSEARCH_DEFAULT_TIME_FILTER,
};

export const GOOGLE_ADVANCED_SEARCH_FORM_NAME = 'google-advanced-search-form';

export const GSEARCH_TIME_FILTER_OPTIONS: OptionType[] = [
    { value: GSEARCH_TIME_FILTER.LAST_24_HOURS, label: 'Last 24 hours' },
    { value: GSEARCH_TIME_FILTER.LAST_WEEK, label: 'Last week' },
    { value: GSEARCH_TIME_FILTER.LAST_MONTH, label: 'Last month' },
    { value: GSEARCH_TIME_FILTER.LAST_YEAR, label: 'Last year' },
];
