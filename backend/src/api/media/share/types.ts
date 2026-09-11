import type { z } from "zod";

import type { MEDIA_SHARE_REQUEST_SCHEMA } from "./schemas";

export type MEDIA_SHARE_REQUEST = z.infer<typeof MEDIA_SHARE_REQUEST_SCHEMA>;

export type MEDIA_SHARE_RESPONSE = {
  /** Public URL of the copy — what an external service fetches. */
  url: string;
  publicPath: string;
  bytes: number;
  /** Days until prune.sh deletes the public copy. */
  retentionDays: number;
};
