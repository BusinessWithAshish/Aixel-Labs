import { GOOGLE_TRENDS_HANDLER_LABELS } from "./constants";
import { createGoogleTrendsHandler } from "./create-handler";
import { fetchGoogleTrendsTrending } from "./helpers";
import { GOOGLE_TRENDS_REQUEST_SCHEMA } from "./schemas";

export const googleTrendsTrendingHandler = createGoogleTrendsHandler({
  label: GOOGLE_TRENDS_HANDLER_LABELS.TRENDING,
  schema: GOOGLE_TRENDS_REQUEST_SCHEMA,
  fetch: fetchGoogleTrendsTrending,
});
