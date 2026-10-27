import { z } from "zod";
import {
  CONTENT_LAB_DEFAULT_COUNTRY,
  CONTENT_LAB_FIELD_DESCRIPTIONS as D,
  CONTENT_LAB_LIMITS,
  CONTENT_LAB_PLATFORMS,
} from "./constants";

const PLATFORM_SCHEMA = z.enum(CONTENT_LAB_PLATFORMS);
const COUNTRY_SCHEMA = z
  .string()
  .length(2)
  .transform((value) => value.toUpperCase())
  .default(CONTENT_LAB_DEFAULT_COUNTRY)
  .describe(D.country);

export const CONTENT_LAB_EXPLORE_REQUEST_SCHEMA = z.object({
  query: z.string().trim().min(1).max(CONTENT_LAB_LIMITS.maxQueryChars).describe(D.query),
  platforms: z.array(PLATFORM_SCHEMA).min(1).default([...CONTENT_LAB_PLATFORMS]).describe(D.platforms),
  country: COUNTRY_SCHEMA,
  limit: z.number().int().min(1).max(CONTENT_LAB_LIMITS.maxPosts).default(CONTENT_LAB_LIMITS.defaultPosts).describe(D.limit),
});

export const CONTENT_LAB_BREAKDOWN_REQUEST_SCHEMA = z.object({
  url: z.string().trim().min(1).max(500).describe(D.url),
  country: COUNTRY_SCHEMA,
});

export const CONTENT_LAB_CHECK_REQUEST_SCHEMA = z.object({
  text: z.string().trim().min(1).max(CONTENT_LAB_LIMITS.maxCheckTextChars).describe(D.text),
  platform: PLATFORM_SCHEMA.describe(D.platform),
  query: z.string().trim().min(1).max(CONTENT_LAB_LIMITS.maxQueryChars).describe(D.query),
  country: COUNTRY_SCHEMA,
});

export const CONTENT_LAB_CREATOR_REQUEST_SCHEMA = z.object({
  platform: PLATFORM_SCHEMA.describe(D.platform),
  handle: z.string().trim().min(1).max(200).describe(D.handle),
  country: COUNTRY_SCHEMA,
  limit: z.number().int().min(1).max(CONTENT_LAB_LIMITS.maxPosts).default(CONTENT_LAB_LIMITS.defaultPosts).describe(D.limit),
});
