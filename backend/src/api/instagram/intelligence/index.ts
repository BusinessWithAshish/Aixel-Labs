import type { IRouter } from "express";
import { INSTAGRAM_INTELLIGENCE_ROUTES } from "./constants";
import { instagramAccountIntelligenceHandler } from "./account/handler";

export function registerInstagramIntelligenceRoutes(router: IRouter) {
  router.post(
    INSTAGRAM_INTELLIGENCE_ROUTES.ACCOUNT,
    instagramAccountIntelligenceHandler,
  );
}
