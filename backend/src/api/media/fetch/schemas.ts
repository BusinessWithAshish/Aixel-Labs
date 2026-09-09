import { z } from "zod";

import { MEDIA_FIELD_DESCRIPTIONS } from "../constants";

export const MEDIA_FETCH_REQUEST_SCHEMA = z.object({
  source: z.string().min(1).describe(MEDIA_FIELD_DESCRIPTIONS.source),
});
