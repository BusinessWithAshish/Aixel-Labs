/**
 * Crawl — single source of truth for defaults, patterns, and labels.
 * Nothing in crawl/compute/handler should hardcode these values.
 */

export const CRAWL_FIELD_DESCRIPTIONS = {
  domains:
    "Domains or URLs to scrape (e.g. 'acme.com' or 'https://acme.com/about'). Max 50.",
  maxPages: "Pages per domain.",
  maxDepth: "Crawl depth from seed homepage.",
  thorough:
    "When true, disables early-exit after email+phone+social found.",
  country:
    "Optional ISO 3166-1 alpha-2 default country for phone parsing.",
} as const;

export const CRAWL = {
  DEFAULT_MAX_PAGES: 15,
  HARD_MAX_PAGES: 30,
  DEFAULT_MAX_DEPTH: 2,
  HARD_MAX_DEPTH: 3,
  MAX_DOMAINS: 50,
  DOMAIN_CONCURRENCY: 20,
  PAGE_CONCURRENCY: 4,
  FETCH_RETRIES: 2,
  DOMAIN_ID_HEX_LEN: 16,
  MIN_TEL_DIGITS: 7,
  PRIORITY_KEYWORD_SCORE: 20,
  HOMEPAGE_SCORE: 5,
  SHORT_PATH_BONUS: 5,
  SKIP_PATH_SCORE: -50,
} as const;

/** Per-domain scrape outcome. */
export const CRAWL_STATUS = {
  SUCCESS: "success",
  DNS_FAIL: "dns_fail",
  TIMEOUT: "timeout",
  BLOCKED: "blocked",
  NOT_FOUND: "not_found",
  UPSTREAM_ERROR: "upstream_error",
} as const;

export const CRAWL_EMAIL_METHOD = {
  MAILTO: "mailto",
  CFEMAIL: "cfemail",
  REGEX: "regex",
  OBFUSCATED: "obfuscated",
  JSONLD: "jsonld",
} as const;

export const CRAWL_EMAIL_TYPE = {
  GENERIC: "generic",
  PERSONAL: "personal",
  UNKNOWN: "unknown",
} as const;

export const CRAWL_PHONE_CONFIDENCE = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export const CRAWL_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  GENERIC: "Website contacts scrape failed",
} as const;

/** High-signal path / link-text keywords (scored for priority BFS). */
export const CRAWL_PRIORITY_KEYWORDS = [
  "contact",
  "contact-us",
  "contactus",
  "about",
  "about-us",
  "aboutus",
  "team",
  "our-team",
  "ourteam",
  "people",
  "staff",
  "impressum",
  "imprint",
  "legal",
  "kontakt",
  "uber-uns",
  "über-uns",
  "support",
  "press",
  "company",
  "media",
  "careers",
  "nous-contacter",
] as const;

/** Probed even when not linked from homepage. */
export const CRAWL_WELL_KNOWN_PATHS = [
  "/contact",
  "/contact-us",
  "/about",
  "/about-us",
  "/team",
  "/impressum",
  "/kontakt",
  "/imprint",
] as const;

/** Path segments that rarely hold published contacts. */
export const CRAWL_SKIP_PATH_SEGMENTS = [
  "blog",
  "tag",
  "tags",
  "category",
  "categories",
  "product",
  "products",
  "cart",
  "checkout",
  "wp-admin",
  "wp-json",
  "feed",
  "cdn-cgi",
  "login",
  "signup",
  "register",
  "account",
  "shop",
] as const;

export const CRAWL_SOCIAL_HOSTS = {
  linkedin: ["linkedin.com"],
  twitter: ["twitter.com", "x.com"],
  facebook: ["facebook.com", "fb.com", "fb.me"],
  instagram: ["instagram.com"],
  youtube: ["youtube.com", "youtu.be"],
  tiktok: ["tiktok.com"],
  github: ["github.com"],
  pinterest: ["pinterest.com"],
} as const;

export type CRAWL_SOCIAL_KEY = keyof typeof CRAWL_SOCIAL_HOSTS;

export const CRAWL_SOCIAL_SHARE_PATTERNS = [
  /sharer\.php/i,
  /share\.php/i,
  /intent\/tweet/i,
  /intent\/follow/i,
  /shareArticle/i,
  /\/share\?/i,
  /dialog\/share/i,
  /pin\/create/i,
] as const;

export const CRAWL_EMAIL_FP_LOCAL_PARTS = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "abuse",
  "webmaster",
] as const;

export const CRAWL_EMAIL_FP_PATTERNS = [
  /@2x\./i,
  /\.(png|jpe?g|gif|svg|webp|css|js)(@|$)/i,
  /sentry\.io/i,
  /example\.(com|org|net)$/i,
  /wixpress\.com$/i,
  /schema\.org$/i,
  /yourdomain/i,
  /domain\.com$/i,
  /email\.com$/i,
  /test@/i,
] as const;

export const CRAWL_GENERIC_EMAIL_LOCAL = [
  "info",
  "contact",
  "hello",
  "support",
  "sales",
  "help",
  "office",
  "admin",
  "enquiry",
  "enquiries",
  "inquiry",
  "inquiries",
  "service",
  "team",
  "press",
  "media",
  "marketing",
  "hr",
  "jobs",
  "careers",
] as const;

export const CRAWL_JSONLD_TYPES = [
  "Organization",
  "LocalBusiness",
  "Person",
  "ContactPoint",
] as const;

/** Shared regex / matchers (SSOT). */
export const CRAWL_PATTERNS = {
  EMAIL: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  ASSET_EXT: /\.(pdf|png|jpe?g|gif|svg|webp|css|js|zip|xml|rss)$/i,
  DNS_FAIL: /ENOTFOUND|getaddrinfo|NXDOMAIN|ERR_NAME_NOT_RESOLVED|dns/i,
  TIMEOUT: /timeout|ETIMEDOUT|AbortError|timed out/i,
  BLOCKED: /403|429|blocked|captcha/i,
  HAS_SCHEME: /^https?:\/\//i,
} as const;

export const CRAWL_EMPTY_SOCIALS = {} as const;
