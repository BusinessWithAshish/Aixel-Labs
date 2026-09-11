import { z } from "zod";

import { MEDIA_FIELD_DESCRIPTIONS } from "../constants";

export const MEDIA_SHARE_REQUEST_SCHEMA = z.object({
  path: z.string().min(1).describe(MEDIA_FIELD_DESCRIPTIONS.sharePath),
});
