import { z } from "zod";
import { GMAPS_PLACE_TYPE_FIELD_DESCRIPTIONS } from "./constants";
import { GMAPS_PLACE_TYPE_IDS } from "./taxonomy";

export const GMAPS_PLACE_TYPE_SCHEMA = z
  .enum(GMAPS_PLACE_TYPE_IDS)
  .describe(GMAPS_PLACE_TYPE_FIELD_DESCRIPTIONS.placeType);

export type GMAPS_PLACE_TYPE = z.output<typeof GMAPS_PLACE_TYPE_SCHEMA>;
