import { CRAWL } from '@aixellabs/backend/crawl/constants';
import type { CRAWL_REQUEST } from '@aixellabs/backend/crawl/types';

export const DEFAULT_CRAWL_FORM_VALUES: CRAWL_REQUEST = {
    domains: [''],
    maxPages: CRAWL.DEFAULT_MAX_PAGES,
    maxDepth: CRAWL.DEFAULT_MAX_DEPTH,
    thorough: false,
};

export const CRAWL_FORM_NAME = 'crawl-form';

export const CRAWL_MAX_DOMAINS = CRAWL.MAX_DOMAINS;
