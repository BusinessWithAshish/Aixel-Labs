import {
  YOUTUBE_GEO_REQUEST_SCHEMA,
  YOUTUBE_HANDLE_VALUE_SCHEMA,
} from "../schemas";

export const YOUTUBE_HANDLE_REQUEST_SCHEMA = YOUTUBE_GEO_REQUEST_SCHEMA.extend({
  handle: YOUTUBE_HANDLE_VALUE_SCHEMA.describe(
    "YouTube channel handle (@username or username)",
  ),
});
