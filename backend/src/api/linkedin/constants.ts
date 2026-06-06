export const LINKEDIN_BASE_URL = "https://www.linkedin.com";

/** Upper bound for `limit` on LinkedIn scraper request payloads (both by-people and by-company). */
export const LINKEDIN_REQUEST_RESULT_LIMIT_MAX = 250;

export const LINKEDIN_BY_COMPANY_ADVANCED_SEARCH_QUERY =
  "site:linkedin.com/company/";
export const LINKEDIN_BY_PEOPLE_ADVANCED_SEARCH_QUERY = "site:linkedin.com/in/";

export enum LINKEDIN_COMPANY_SIZE_ENUM {
  "1-10" = "1-10 employees",
  "11-50" = "11-50 employees",
  "51-200" = "51-200 employees",
  "201-500" = "201-500 employees",
  "501-1000" = "501-1000 employees",
  "1001-5000" = "1001-5000 employees",
  "5001-10,000" = "5001-10,000 employees",
  "10,001+" = "10,001+ employees",
}

export enum LINKEDIN_SENIORITY_ENUM {
  "UNPAID" = "UNPAID",
  "TRAINING" = "TRAINING",
  "ENTRY_LEVEL" = "ENTRY_LEVEL",
  "SENIOR" = "SENIOR",
  "MANAGER" = "MANAGER",
  "DIRECTOR" = "DIRECTOR",
  "VICE_PRESIDENT" = "VICE_PRESIDENT",
  "CHIEF_X_OFFICER" = "CHIEF_X_OFFICER",
  "PARTNER" = "PARTNER",
  "OWNER" = "OWNER",
}

export enum LINKEDIN_COMPANY_TYPE_ENUM {
  "PUBLIC_COMPANY" = "Public Company",
  "EDUCATIONAL" = "Educational",
  "SELF_EMPLOYED" = "Self Employed",
  "GOVERNMENT_AGENCY" = "Government Agency",
  "NON_PROFIT" = "Non Profit",
  "SELF_OWNED" = "Self Owned",
  "PRIVATELY_HELD" = "Privately Held",
  "PARTNERSHIP" = "Partnership",
}
