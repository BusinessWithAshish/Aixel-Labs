import { createMediaHandler } from "../create-handler";
import { MEDIA_FETCH_REQUEST_SCHEMA } from "./schemas";
import { fetchMedia } from "./fetch";

/** POST /video/fetch — any media source in, local file path + duration out. */
export const mediaFetchHandler = createMediaHandler({
  label: "MEDIA/FETCH",
  schema: MEDIA_FETCH_REQUEST_SCHEMA,
  fetch: (input) => fetchMedia(input),
});
