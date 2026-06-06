import { z } from "zod";
import {
  LINKEDIN_COMPANY_SIZE_ENUM,
  LINKEDIN_COMPANY_TYPE_ENUM,
  LINKEDIN_REQUEST_RESULT_LIMIT_MAX,
} from "./constants";

export const LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA = z.object({
  // SERP discovery filters
  discovery_filters: z.object({
    // Required filters
    country: z.string().min(1, "Select a country at minimum"),
    state: z.string().optional(),
    city: z.string().optional(),

    // Optional filters
    name: z.string().optional(),
    bio: z.string().optional(),
    job_titles: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    companies: z.array(z.string()).optional(),
    educations: z.array(z.string()).optional(),
  }),

  enrichment: z.object({
    followers: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
      })
      .optional(),

    experience_years: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
      })
      .optional(),

    industry: z.array(z.string()).optional(),
  }),

  limit: z.number().min(1).max(LINKEDIN_REQUEST_RESULT_LIMIT_MAX).default(100),
});

export const LINKEDIN_BY_COMPANY_REQUEST_SCHEMA = z.object({
  // SERP discovery filters
  discovery_filters: z.object({
    country: z.string().min(1, "Select a country at minimum"),
    city: z.string().optional(),
    company_name: z.string().optional(),
    industry: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    company_size: z.nativeEnum(LINKEDIN_COMPANY_SIZE_ENUM).optional(),
    type: z.nativeEnum(LINKEDIN_COMPANY_TYPE_ENUM).optional(),
    specialties: z.array(z.string()).optional(),
  }),

  // Enrichment filters
  enrichment: z
    .object({
      employee_count: z
        .object({
          min: z.number().optional(),
          max: z.number().optional(),
        })
        .optional(),

      funding: z
        .object({
          min: z.number().optional(),
          max: z.number().optional(),
        })
        .optional(),

      is_recently_active: z.boolean().optional(),

      company_engagement_rate: z
        .object({
          min_likes: z.number().optional(),
          max_like: z.number().optional(),
          min_comment: z.number().optional(),
          max_comment: z.number().optional(),
        })
        .optional(),

      is_hiring: z.boolean().optional(),
      recently_funded: z.boolean().optional(),

      follower_count: z
        .object({
          min: z.number().optional(),
          max: z.number().optional(),
        })
        .optional(),

      description_include: z.array(z.string()).optional(),
      description_exclude: z.array(z.string()).optional(),
    })
    .optional(),

  limit: z.number().min(1).max(LINKEDIN_REQUEST_RESULT_LIMIT_MAX).default(100),
});
