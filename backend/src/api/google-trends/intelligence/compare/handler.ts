import { GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA } from "../../interest/schemas";
import { GOOGLE_TRENDS_HANDLER_LABELS } from "../../constants";
import { createGoogleTrendsHandler } from "../../create-handler";
import { googleTrendsCompareIntelligenceService } from "./service";

export const googleTrendsCompareIntelligenceHandler = createGoogleTrendsHandler({
  label: GOOGLE_TRENDS_HANDLER_LABELS.INTELLIGENCE_COMPARE,
  schema: GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA,
  fetch: googleTrendsCompareIntelligenceService,
});
