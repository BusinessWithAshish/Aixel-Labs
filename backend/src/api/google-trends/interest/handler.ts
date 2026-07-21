import { GOOGLE_TRENDS_HANDLER_LABELS } from "../constants";
import { createGoogleTrendsHandler } from "../create-handler";
import { fetchGoogleTrendsInterest } from "./helpers";
import { GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA } from "./schemas";

export const googleTrendsInterestHandler = createGoogleTrendsHandler({
  label: GOOGLE_TRENDS_HANDLER_LABELS.INTEREST,
  schema: GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA,
  fetch: fetchGoogleTrendsInterest,
});
