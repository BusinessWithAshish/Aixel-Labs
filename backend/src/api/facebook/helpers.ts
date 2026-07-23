/** Barrel: pure transforms + I/O orchestration for Facebook lead API. */
export {
  generateAdvanceQuery,
  generateExcludeKeywords,
  generateFacebookSearchQuery,
  extractPageVanity,
  hasEntities,
  hasQuery,
  facebookPageUrl,
  facebookMbasicPageUrl,
  facebookAboutUrl,
  uniquePageVanities,
  isSparseFacebookLead,
  mapFacebookPageHtml,
  preferRicherLead,
} from "./compute";

export { fetchFromEntities, fetchFromQuery } from "./client";
