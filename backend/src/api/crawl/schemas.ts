import { z } from "zod";

import { CRAWL, CRAWL_FIELD_DESCRIPTIONS } from "./constants";

/** Client-safe domain/URL check (no Node crypto). Full normalize happens in scrape. */
function looksLikeDomainOrUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const { hostname } = new URL(withScheme);
    return (
      Boolean(hostname) && hostname.includes(".") && !hostname.startsWith(".")
    );
  } catch {
    return false;
  }
}

/** Domain (`acme.com`) or URL (`https://acme.com/about`). */
export const CRAWL_DOMAIN_OR_URL_SCHEMA = z
  .string()
  .trim()
  .min(1)
  .refine(looksLikeDomainOrUrl, {
    message: "Must be a domain (acme.com) or URL (https://acme.com/about)",
  });

export const CRAWL_REQUEST_SCHEMA = z.object({
  domains: z
    .array(CRAWL_DOMAIN_OR_URL_SCHEMA)
    .min(1)
    .max(CRAWL.MAX_DOMAINS)
    .describe(CRAWL_FIELD_DESCRIPTIONS.domains),
  maxPages: z
    .number()
    .int()
    .min(1)
    .max(CRAWL.HARD_MAX_PAGES)
    .optional()
    .default(CRAWL.DEFAULT_MAX_PAGES)
    .describe(
      `${CRAWL_FIELD_DESCRIPTIONS.maxPages} Default ${CRAWL.DEFAULT_MAX_PAGES}, max ${CRAWL.HARD_MAX_PAGES}.`,
    ),
  maxDepth: z
    .number()
    .int()
    .min(0)
    .max(CRAWL.HARD_MAX_DEPTH)
    .optional()
    .default(CRAWL.DEFAULT_MAX_DEPTH)
    .describe(
      `${CRAWL_FIELD_DESCRIPTIONS.maxDepth} Default ${CRAWL.DEFAULT_MAX_DEPTH}, max ${CRAWL.HARD_MAX_DEPTH}.`,
    ),
  thorough: z
    .boolean()
    .optional()
    .default(false)
    .describe(CRAWL_FIELD_DESCRIPTIONS.thorough),
  country: z
    .string()
    .trim()
    .length(2)
    .transform((s) => s.toUpperCase())
    .optional()
    .describe(CRAWL_FIELD_DESCRIPTIONS.country),
});
