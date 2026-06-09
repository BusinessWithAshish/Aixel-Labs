import { z } from "zod";
import {
  LINKEDIN_COMPANY_SIZE_ENUM,
  LINKEDIN_COMPANY_TYPE_ENUM,
  LINKEDIN_REQUEST_RESULT_LIMIT_MAX,
} from "./constants";

export const LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA = z.object({
  discovery_filters: z
    .object({
      country: z
        .string()
        .min(1, "Select a country at minimum")
        .describe(
          "Full country name where the person is based (required). E.g. 'India', 'United States', 'United Kingdom'.",
        ),
      state: z
        .string()
        .optional()
        .describe(
          "State or province within the country (optional). E.g. 'California', 'Maharashtra'.",
        ),
      city: z
        .string()
        .optional()
        .describe(
          "City where the person is located (optional). E.g. 'Mumbai', 'San Francisco'.",
        ),
      name: z
        .string()
        .optional()
        .describe("Partial or full name of the person to search for (optional)."),
      bio: z
        .string()
        .optional()
        .describe(
          "Keywords that should appear in the person's LinkedIn bio or headline (optional).",
        ),
      job_titles: z
        .array(z.string())
        .optional()
        .describe(
          "Job titles to filter by (optional). E.g. ['Software Engineer', 'Product Manager', 'CTO'].",
        ),
      keywords: z
        .array(z.string())
        .optional()
        .describe(
          "General keywords related to the person's skills, industry, or profile (optional).",
        ),
      languages: z
        .array(z.string())
        .optional()
        .describe("Languages the person speaks (optional). E.g. ['English', 'Spanish']."),
      companies: z
        .array(z.string())
        .optional()
        .describe(
          "Companies the person currently works at or has worked at (optional). E.g. ['Google', 'Meta'].",
        ),
      educations: z
        .array(z.string())
        .optional()
        .describe(
          "Educational institutions attended (optional). E.g. ['IIT Bombay', 'Harvard University'].",
        ),
    })
    .describe("Core search filters used to discover LinkedIn profiles."),

  enrichment: z
    .object({
      followers: z
        .object({
          min: z.number().optional().describe("Minimum follower count."),
          max: z.number().optional().describe("Maximum follower count."),
        })
        .optional()
        .describe("Filter by LinkedIn follower count range (optional)."),
      experience_years: z
        .object({
          min: z.number().optional().describe("Minimum years of professional experience."),
          max: z.number().optional().describe("Maximum years of professional experience."),
        })
        .optional()
        .describe("Filter by total years of professional experience (optional)."),
      industry: z
        .array(z.string())
        .optional()
        .describe(
          "Industry sectors to filter by (optional). E.g. ['Technology', 'Finance', 'Healthcare'].",
        ),
    })
    .describe("Optional enrichment filters applied after initial discovery."),

  limit: z
    .number()
    .min(1)
    .max(LINKEDIN_REQUEST_RESULT_LIMIT_MAX)
    .default(100)
    .describe(
      `Maximum number of results to return (1–${LINKEDIN_REQUEST_RESULT_LIMIT_MAX}). Defaults to 100 if not specified.`,
    ),
});

export const LINKEDIN_BY_COMPANY_REQUEST_SCHEMA = z.object({
  discovery_filters: z
    .object({
      country: z
        .string()
        .min(1, "Select a country at minimum")
        .describe(
          "Full country name where the company is headquartered (required). E.g. 'India', 'United States'.",
        ),
      city: z
        .string()
        .optional()
        .describe("City where the company is located (optional)."),
      company_name: z
        .string()
        .optional()
        .describe("Full or partial company name to search for (optional)."),
      industry: z
        .array(z.string())
        .optional()
        .describe(
          "Industry sectors the company operates in (optional). E.g. ['Technology', 'Retail', 'Manufacturing'].",
        ),
      keywords: z
        .array(z.string())
        .optional()
        .describe(
          "Keywords related to the company's products, services, or profile (optional).",
        ),
      company_size: z
        .nativeEnum(LINKEDIN_COMPANY_SIZE_ENUM)
        .optional()
        .describe(
          "Company headcount range (optional). Values: '1-10 employees', '11-50 employees', '51-200 employees', '201-500 employees', '501-1000 employees', '1001-5000 employees', '5001-10,000 employees', '10,001+ employees'.",
        ),
      type: z
        .nativeEnum(LINKEDIN_COMPANY_TYPE_ENUM)
        .optional()
        .describe(
          "Type of company (optional). Values: 'Public Company', 'Educational', 'Self Employed', 'Government Agency', 'Non Profit', 'Privately Held', 'Partnership'.",
        ),
      specialties: z
        .array(z.string())
        .optional()
        .describe(
          "Specific specialties or niches the company focuses on (optional). E.g. ['cloud computing', 'AI', 'e-commerce'].",
        ),
    })
    .describe("Core search filters used to discover LinkedIn company pages."),

  enrichment: z
    .object({
      employee_count: z
        .object({
          min: z.number().optional().describe("Minimum number of employees."),
          max: z.number().optional().describe("Maximum number of employees."),
        })
        .optional()
        .describe("Filter by actual employee count range (optional)."),
      funding: z
        .object({
          min: z.number().optional().describe("Minimum total funding in USD."),
          max: z.number().optional().describe("Maximum total funding in USD."),
        })
        .optional()
        .describe("Filter by total funding amount in USD (optional)."),
      is_recently_active: z
        .boolean()
        .optional()
        .describe("Only include companies that have posted recently on LinkedIn (optional)."),
      company_engagement_rate: z
        .object({
          min_likes: z.number().optional(),
          max_like: z.number().optional(),
          min_comment: z.number().optional(),
          max_comment: z.number().optional(),
        })
        .optional()
        .describe("Filter by post engagement metrics — likes and comments (optional)."),
      is_hiring: z
        .boolean()
        .optional()
        .describe("Only include companies that are actively hiring on LinkedIn (optional)."),
      recently_funded: z
        .boolean()
        .optional()
        .describe("Only include companies that recently received funding (optional)."),
      follower_count: z
        .object({
          min: z.number().optional().describe("Minimum LinkedIn follower count."),
          max: z.number().optional().describe("Maximum LinkedIn follower count."),
        })
        .optional()
        .describe("Filter by company LinkedIn page follower count (optional)."),
      description_include: z
        .array(z.string())
        .optional()
        .describe(
          "Keywords that must appear in the company description (optional).",
        ),
      description_exclude: z
        .array(z.string())
        .optional()
        .describe(
          "Keywords that must NOT appear in the company description (optional).",
        ),
    })
    .optional()
    .describe("Optional enrichment filters applied after initial discovery."),

  limit: z
    .number()
    .min(1)
    .max(LINKEDIN_REQUEST_RESULT_LIMIT_MAX)
    .default(100)
    .describe(
      `Maximum number of results to return (1–${LINKEDIN_REQUEST_RESULT_LIMIT_MAX}). Defaults to 100 if not specified.`,
    ),
});
