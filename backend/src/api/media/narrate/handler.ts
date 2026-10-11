import { createMediaHandler } from "../create-handler";
import { narrate } from "./narrate";
import { MEDIA_NARRATE_REQUEST_SCHEMA } from "./schemas";

/** POST /media/narrate — text in, narration WAV + word timings + footage phrases out. */
export const mediaNarrateHandler = createMediaHandler({
  label: "MEDIA/NARRATE",
  schema: MEDIA_NARRATE_REQUEST_SCHEMA,
  fetch: (input) => narrate(input),
});
