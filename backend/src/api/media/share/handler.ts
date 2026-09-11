import { createMediaHandler } from "../create-handler";
import { MEDIA_SHARE_REQUEST_SCHEMA } from "./schemas";
import { shareMedia } from "./share";

/** POST /media/share — a private media file in, a public URL out (pruned after 7 days). */
export const mediaShareHandler = createMediaHandler({
  label: "MEDIA/SHARE",
  schema: MEDIA_SHARE_REQUEST_SCHEMA,
  fetch: (input) => shareMedia(input),
});
