import { z } from "zod";
import type { GMAPS_ADVANCED_REQUEST_SCHEMA } from "./schemas";
import type { GMAPS_DETAILS_RESPONSE } from "../details/types";

export type GMAPS_ADVANCED_REQUEST = z.output<typeof GMAPS_ADVANCED_REQUEST_SCHEMA>;

export type GMAPS_ADVANCED_RESPONSE = GMAPS_DETAILS_RESPONSE;
