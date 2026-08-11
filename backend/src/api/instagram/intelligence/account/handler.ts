import { INSTAGRAM_INTELLIGENCE_HANDLER_LABELS } from "../constants";
import { createIntelligenceHandler } from "../create-handler";
import { instagramAccountIntelligenceService } from "./service";
import { INSTAGRAM_ACCOUNT_INTELLIGENCE_REQUEST_SCHEMA } from "./schemas";

export const instagramAccountIntelligenceHandler = createIntelligenceHandler({
  label: INSTAGRAM_INTELLIGENCE_HANDLER_LABELS.ACCOUNT,
  schema: INSTAGRAM_ACCOUNT_INTELLIGENCE_REQUEST_SCHEMA,
  fetch: instagramAccountIntelligenceService,
  enrich: (data) => data,
});
