import type { z } from "zod";

import type {
  CRAWL_EMAIL_METHOD,
  CRAWL_EMAIL_TYPE,
  CRAWL_PHONE_CONFIDENCE,
  CRAWL_STATUS,
} from "./constants";
import type { CRAWL_REQUEST_SCHEMA } from "./schemas";

export type CRAWL_REQUEST = z.input<typeof CRAWL_REQUEST_SCHEMA>;

export type CRAWL_REQUEST_PARSED = z.output<typeof CRAWL_REQUEST_SCHEMA>;

export type CRAWL_EMAIL_TYPE_VALUE =
  (typeof CRAWL_EMAIL_TYPE)[keyof typeof CRAWL_EMAIL_TYPE];

export type CRAWL_EMAIL_METHOD_VALUE =
  (typeof CRAWL_EMAIL_METHOD)[keyof typeof CRAWL_EMAIL_METHOD];

export type CRAWL_PHONE_CONFIDENCE_VALUE =
  (typeof CRAWL_PHONE_CONFIDENCE)[keyof typeof CRAWL_PHONE_CONFIDENCE];

export type CRAWL_STATUS_VALUE =
  (typeof CRAWL_STATUS)[keyof typeof CRAWL_STATUS];

export type CRAWL_EMAIL = {
  value: string;
  type?: CRAWL_EMAIL_TYPE_VALUE;
  sourceUrl: string;
  method: CRAWL_EMAIL_METHOD_VALUE;
};

export type CRAWL_PHONE = {
  value: string;
  raw?: string;
  sourceUrl: string;
  confidence: CRAWL_PHONE_CONFIDENCE_VALUE;
};

export type CRAWL_SOCIALS = {
  linkedin?: string[];
  twitter?: string[];
  facebook?: string[];
  instagram?: string[];
  youtube?: string[];
  tiktok?: string[];
  github?: string[];
  pinterest?: string[];
};

export type CRAWL_META = {
  title?: string;
  description?: string;
  siteName?: string;
};

/** One lead-shaped contact profile per domain (`id` = hash of registrable domain). */
export type CRAWL_RESPONSE = {
  id: string;
  domain: string;
  emails: CRAWL_EMAIL[];
  phones: CRAWL_PHONE[];
  socials: CRAWL_SOCIALS;
  address?: string;
  meta?: CRAWL_META;
  pagesCrawled: string[];
  status: CRAWL_STATUS_VALUE;
  scrapedAt: string;
  errors?: string[];
};

export type CRAWL_PAGE_EXTRACT = {
  emails: CRAWL_EMAIL[];
  phones: CRAWL_PHONE[];
  socials: CRAWL_SOCIALS;
  address?: string;
  meta?: CRAWL_META;
  links: string[];
};

export type CRAWL_NORMALIZED_DOMAIN = {
  domain: string;
  seedUrl: string;
  id: string;
};

export type CRAWL_OPTIONS = {
  maxPages: number;
  maxDepth: number;
  thorough: boolean;
  country?: string;
};

export type CRAWL_RESULT = {
  extracts: CRAWL_PAGE_EXTRACT[];
  pagesCrawled: string[];
  status: CRAWL_STATUS_VALUE;
  errors: string[];
};

export type CRAWL_MERGED_EXTRACT = {
  emails: CRAWL_EMAIL[];
  phones: CRAWL_PHONE[];
  socials: CRAWL_SOCIALS;
  address?: string;
  meta?: CRAWL_META;
};
