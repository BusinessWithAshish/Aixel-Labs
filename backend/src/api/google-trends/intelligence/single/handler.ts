import { GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA } from "../../interest/schemas";
import { GOOGLE_TRENDS_HANDLER_LABELS } from "../../constants";
import { createGoogleTrendsHandler } from "../../create-handler";
import { googleTrendsInterestIntelligenceService } from "./service";

export const googleTrendsInterestIntelligenceHandler = createGoogleTrendsHandler({
  label: GOOGLE_TRENDS_HANDLER_LABELS.INTELLIGENCE_INTEREST,
  schema: GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA,
  fetch: googleTrendsInterestIntelligenceService,
});
